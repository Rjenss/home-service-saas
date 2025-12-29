// unscheduled.js
const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("unscheduledStatus");
  const listEl = document.getElementById("unscheduledJobs");

  loadUnscheduledJobs();

  async function loadUnscheduledJobs() {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      if (statusEl) statusEl.textContent = "API base URL is not configured.";
      return;
    }

    if (statusEl) statusEl.textContent = "Loading...";
    if (listEl) listEl.textContent = "";

    try {
      const res = await fetch(`${baseUrl}/jobs`, { method: "GET" });
      const text = await res.text();
      if (!res.ok) {
        if (statusEl) statusEl.textContent = `Error: ${res.status}`;
        if (listEl) listEl.textContent = text;
        return;
      }

      const jobs = JSON.parse(text);
      const unscheduled = (Array.isArray(jobs) ? jobs : []).filter((j) => {
        const s = String(j.status || "").trim().toLowerCase();
        return s === "unscheduled";
      });

      renderJobs(unscheduled);

      if (statusEl) {
        statusEl.textContent = unscheduled.length
          ? `Showing ${unscheduled.length} job(s).`
          : "No unscheduled jobs.";
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = "Error loading jobs.";
      if (listEl) listEl.textContent = String(err);
    }
  }

  function renderJobs(jobs) {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!jobs || jobs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "calendar-empty";
      empty.textContent = "No unscheduled jobs right now.";
      listEl.appendChild(empty);
      return;
    }

    // Sort newest first when possible
    const sorted = [...jobs].sort((a, b) => {
      const ta = String(a.created_at || "");
      const tb = String(b.created_at || "");
      return tb.localeCompare(ta);
    });

    for (const job of sorted) {
      const card = document.createElement("article");
      card.className = "job-card visit-card";

      const header = document.createElement("div");
      header.className = "job-card-header";

      const titleLeft = escapeHtml(job.customerName || "Job");
      header.innerHTML = `
        <span>${titleLeft}</span>
        <span class="visit-status visit-status-unscheduled">Unscheduled</span>
      `;

      const body = document.createElement("div");
      body.className = "job-card-body";

      const jobId = escapeHtml(job.jobId || "N/A");
      const phone = escapeHtml(job.customerPhone || "");
      const address = escapeHtml(job.address || "");
      const priority = escapeHtml(job.priority || "normal");
      const requestedDate = escapeHtml(job.requested_date || "");
      const requestedTime = escapeHtml(job.requested_time || "");
      const notes = escapeHtml(job.description || "");

      const requestedLine = requestedDate || requestedTime
        ? `${requestedDate}${requestedTime ? ` ${requestedTime}` : ""}`
        : "Not provided";

      body.innerHTML = `
        <div class="visit-job-id">Job: ${jobId}</div>
        <div>Phone: ${phone || "Not provided"}</div>
        <div>Address: ${address || "Not provided"}</div>
        <div>Priority: ${priority}</div>
        <div>Requested: ${requestedLine}</div>
        <div class="visit-notes">${notes || "No description"}</div>
      `;

      card.appendChild(header);
      card.appendChild(body);
      listEl.appendChild(card);
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
});
