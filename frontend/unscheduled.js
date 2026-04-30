const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("unscheduledStatus");
  const listEl = document.getElementById("unscheduledJobs");

  loadUnscheduled();

  async function loadUnscheduled() {
    const baseUrl = getApiBaseUrl();
    statusEl.textContent = "Loading...";
    listEl.innerHTML = "";

    try {
      const [jobsRes, techRes, visitsRes] = await Promise.all([
        fetch(`${baseUrl}/jobs`, { method: "GET" }),
        fetch(`${baseUrl}/technicians`, { method: "GET" }),
        fetch(`${baseUrl}/job_visits`, { method: "GET" }),
      ]);

      const jobsText = await jobsRes.text();
      const techText = await techRes.text();
      const visitsText = await visitsRes.text();

      if (!jobsRes.ok) throw new Error(`Jobs error ${jobsRes.status}: ${jobsText}`);
      if (!techRes.ok) throw new Error(`Technicians error ${techRes.status}: ${techText}`);
      if (!visitsRes.ok) throw new Error(`Job visits error ${visitsRes.status}: ${visitsText}`);

      const jobs = JSON.parse(jobsText);
      const techs = JSON.parse(techText);
      const visits = JSON.parse(visitsText);

      const allJobs = Array.isArray(jobs) ? jobs : [];
      const allTechs = Array.isArray(techs) ? techs : [];
      const allVisits = Array.isArray(visits) ? visits : [];

      const unscheduledJobs = allJobs.filter((j) => {
        const s = String(j.status || "").trim().toLowerCase();
        return s === "unscheduled";
      });

      const latestVisitByJobId = newestVisitByJob(allVisits);

      renderSections(unscheduledJobs, latestVisitByJobId, allTechs);

      statusEl.textContent = `Showing ${unscheduledJobs.length} unconfirmed job(s).`;
    } catch (err) {
      statusEl.textContent = "Error loading data.";
      listEl.textContent = String(err);
    }
  }

  function newestVisitByJob(visits) {
    const map = {};
    for (const v of visits) {
      const jobId = v && (v.job_id || v.jobId);
      if (!jobId) continue;

      const created = String(v.created_at || v.createdAt || "");
      const existing = map[jobId];
      if (!existing) {
        map[jobId] = v;
        continue;
      }
      const existingCreated = String(existing.created_at || existing.createdAt || "");
      if (created > existingCreated) map[jobId] = v;
    }
    return map;
  }

  function renderSections(jobs, visitByJobId, techs) {
    listEl.innerHTML = "";

    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "calendar-empty";
      empty.textContent = "No unconfirmed jobs right now.";
      listEl.appendChild(empty);
      return;
    }

    const techNameById = {};
    for (const t of techs) {
      const id = t && t.id;
      if (!id) continue;
      const name = `${t.first_name || ""} ${t.last_name || ""}`.trim() || "Technician";
      techNameById[id] = name;
    }

    const unassigned = [];
    const assigned = [];

    for (const j of jobs) {
      const v = visitByJobId[j.jobId];
      const tid = v && (v.technician_id || v.technicianId);
      if (tid) assigned.push(j);
      else unassigned.push(j);
    }

    listEl.appendChild(makeSection("Unassigned", unassigned, visitByJobId, techNameById));
    listEl.appendChild(makeSection("Assigned", assigned, visitByJobId, techNameById));
  }

  function makeSection(title, jobs, visitByJobId, techNameById) {
    const wrap = document.createElement("section");
    wrap.className = "calendar-tech-section";

    const heading = document.createElement("div");
    heading.className = "job-card-header";
    heading.innerHTML = `<span>${escapeHtml(title)}</span><span>${escapeHtml(String(jobs.length))}</span>`;
    wrap.appendChild(heading);

    if (!jobs.length) {
      const none = document.createElement("div");
      none.className = "calendar-empty";
      none.textContent = "None.";
      wrap.appendChild(none);
      return wrap;
    }

    const list = document.createElement("div");
    list.className = "calendar-day-list";

    for (const job of jobs) {
      const v = visitByJobId[job.jobId] || {};
      const techId = v.technician_id || v.technicianId || "";
      const techName = techId ? (techNameById[techId] || "Technician") : "Not assigned";

      const dateText = v.scheduled_date || v.scheduledDate || "";
      const timeText = v.scheduled_time || v.scheduledTime || "";

      const card = document.createElement("article");
      card.className = "job-card visit-card";

      card.innerHTML = `
        <div class="job-card-header">
          <span>${escapeHtml(job.customerName || "Job")}</span>
          <span class="visit-status visit-status-unscheduled">unconfirmed</span>
        </div>
        <div class="job-card-body">
          <div class="visit-job-id">Job: ${escapeHtml(job.jobId || "N/A")}</div>
          <div>Phone: ${escapeHtml(job.customerPhone || "Not provided")}</div>
          <div>Address: ${escapeHtml(job.address || "Not provided")}</div>
          <div>Assigned to: ${escapeHtml(techName)}</div>
          <div>Scheduled: ${escapeHtml(dateText ? dateText : "Not set")} ${escapeHtml(timeText ? timeText : "")}</div>
          <div class="visit-notes">${escapeHtml(job.description || "No description")}</div>
          <div class="form-footer" style="margin-top:10px;">
            <button type="button" class="btn-secondary" data-resend="${escapeHtml(job.jobId)}">Resend email</button>
            <span class="resend-status" style="font-size:0.85rem;margin-left:8px;"></span>
          </div>
        </div>
      `;

      const resendBtn = card.querySelector('button[data-resend]');
      const resendStatus = card.querySelector('.resend-status');
      resendBtn.addEventListener("click", () => onResend(resendBtn, resendStatus, job.jobId));

      list.appendChild(card);
    }

    wrap.appendChild(list);
    return wrap;
  }

  async function onResend(btn, statusEl, jobId) {
    btn.disabled = true;
    statusEl.textContent = "Sending...";
    statusEl.style.color = "";

    try {
      const res = await fetch(`${getApiBaseUrl()}/jobs/resend_confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (res.ok) {
        statusEl.textContent = "Sent!";
        statusEl.style.color = "#22c55e";
      } else {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try { msg = JSON.parse(text).message || msg; } catch (_) {}
        statusEl.textContent = msg;
        statusEl.style.color = "#ef4444";
        btn.disabled = false;
      }
    } catch (err) {
      statusEl.textContent = "Network error";
      statusEl.style.color = "#ef4444";
      btn.disabled = false;
    }
  }
});
