// calendar.js
const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";
const TIMEZONE = "America/Chicago";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("calendarStatus");
  const calendarEl = document.getElementById("calendarJobs");
  const currentDayLabelEl = document.getElementById("calendarCurrentDayLabel");
  const prevDayBtn = document.getElementById("prevDayBtn");
  const nextDayBtn = document.getElementById("nextDayBtn");

  let allVisits = [];
  let allTechs = [];
  let techById = {};
  let selectedDate = getTodayIso(); // "YYYY-MM-DD"

  init();

  function init() {
    updateCurrentDayLabel();

    if (prevDayBtn) {
      prevDayBtn.addEventListener("click", () => changeDay(-1));
    }
    if (nextDayBtn) {
      nextDayBtn.addEventListener("click", () => changeDay(1));
    }

    loadCalendarData();
  }

  function getTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function changeDay(offset) {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + offset);

    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, "0");
    const newD = String(date.getDate()).padStart(2, "0");
    selectedDate = `${newY}-${newM}-${newD}`;

    updateCurrentDayLabel();
    renderVisitsForSelectedDay();
  }

  function updateCurrentDayLabel() {
    if (!currentDayLabelEl) return;

    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);

    const formatter = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    currentDayLabelEl.textContent = formatter.format(date);
  }

  async function loadCalendarData() {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      if (statusEl) {
        statusEl.textContent =
          "API base URL is not configured. Please check calendar.js.";
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Loading calendar data...";
    }

    try {
      const [visitsResp, techResp] = await Promise.all([
        fetch(`${baseUrl}/job_visits`, { method: "GET" }),
        fetch(`${baseUrl}/technicians`, { method: "GET" }),
      ]);

      if (!visitsResp.ok) throw new Error(`job_visits HTTP ${visitsResp.status}`);
      if (!techResp.ok) throw new Error(`technicians HTTP ${techResp.status}`);

      const visitsData = await visitsResp.json();
      const techsData = await techResp.json();

      allVisits = Array.isArray(visitsData) ? visitsData : [];
      allTechs = Array.isArray(techsData) ? techsData : [];

      techById = {};
      for (const t of allTechs) {
        if (t && t.id) techById[t.id] = t;
      }

      renderVisitsForSelectedDay();
    } catch (err) {
      console.error("Error loading calendar data:", err);
      if (statusEl) {
        statusEl.textContent = "Error loading calendar data. Check console logs.";
      }
    }
  }

  function techNameFromId(techId) {
    if (!techId) return "Unassigned";
    const t = techById[techId];
    if (!t) return "Unassigned";
    const name = `${t.first_name || ""} ${t.last_name || ""}`.trim();
    return name || "Unassigned";
  }

  function populateTechSelect(selectEl, techs, selectedTechId) {
    selectEl.innerHTML = "";

    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "Unassigned";
    selectEl.appendChild(optNone);

    const sorted = [...(techs || [])].sort((a, b) => {
      const an = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
      const bn = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });

    for (const tech of sorted) {
      if (!tech || !tech.id) continue;
      const opt = document.createElement("option");
      opt.value = tech.id;
      opt.textContent =
        `${tech.first_name || ""} ${tech.last_name || ""}`.trim() || "Technician";
      selectEl.appendChild(opt);
    }

    selectEl.value = selectedTechId || "";
  }

  async function assignTechToVisit({ visitId, technicianId, selectEl }) {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) return;

    selectEl.disabled = true;

    try {
      const resp = await fetch(`${baseUrl}/job_visits/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visit_id: visitId,
          technician_id: technicianId,
        }),
      });

      const updated = await resp.json();

      if (!resp.ok) {
        console.error("Assign failed:", updated);
        if (statusEl) statusEl.textContent = "Assign failed. Check console logs.";
        return;
      }

      const idx = allVisits.findIndex(v => v && v.id === visitId);
      if (idx >= 0) {
        allVisits[idx] = { ...allVisits[idx], ...updated };
      }

      renderVisitsForSelectedDay();
    } catch (err) {
      console.error("Error assigning technician:", err);
      if (statusEl) statusEl.textContent = "Error assigning technician. Check console logs.";
    } finally {
      selectEl.disabled = false;
    }
  }

  function renderVisitsForSelectedDay() {
    if (!calendarEl) return;
    calendarEl.innerHTML = "";

    const visits = allVisits
      .filter(v => v && v.scheduled_date === selectedDate)
      .sort((a, b) => {
        const ta = (a.scheduled_time || "").padStart(5, "9");
        const tb = (b.scheduled_time || "").padStart(5, "9");
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      });

    if (statusEl) {
      statusEl.textContent = visits.length
        ? `Showing ${visits.length} visit(s) for ${selectedDate}.`
        : `No visits scheduled for ${selectedDate}.`;
    }

    if (!visits.length) {
      const msg = document.createElement("p");
      msg.className = "calendar-empty";
      msg.textContent = "No visits scheduled for this day.";
      calendarEl.appendChild(msg);
      return;
    }

    // Group by technician name (derived from technician_id)
    const byTech = {};
    for (const visit of visits) {
      const label = techNameFromId(visit.technician_id);
      if (!byTech[label]) byTech[label] = [];
      byTech[label].push(visit);
    }

    // Sort sections: Unassigned first, then alphabetical
    const techLabels = Object.keys(byTech).sort((a, b) => {
      if (a === "Unassigned" && b !== "Unassigned") return -1;
      if (b === "Unassigned" && a !== "Unassigned") return 1;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    for (const techLabel of techLabels) {
      const section = document.createElement("section");
      section.className = "calendar-tech-section";

      const heading = document.createElement("h2");
      heading.className = "calendar-tech-heading";
      heading.textContent =
        techLabel === "Unassigned" ? "Unassigned visits" : `Technician: ${techLabel}`;
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "calendar-day-list";

      for (const visit of byTech[techLabel]) {
        const card = document.createElement("article");
        card.className = "job-card visit-card";

        const header = document.createElement("div");
        header.className = "job-card-header";

        const timeText =
          visit.scheduled_time ||
          (visit.scheduled_display || "").split(" ")[1] ||
          "Time not set";

        const statusText = visit.status || "scheduled";

        const leftSpan = document.createElement("span");
        leftSpan.textContent = timeText;

        const rightSpan = document.createElement("span");
        rightSpan.className = `visit-status visit-status-${String(statusText).toLowerCase()}`;
        rightSpan.textContent = statusText;

        header.appendChild(leftSpan);
        header.appendChild(rightSpan);

        const body = document.createElement("div");
        body.className = "job-card-body";

        const jobId = visit.job_id || "N/A";
        const notesText = visit.notes || "";

        const jobLine = document.createElement("div");
        jobLine.className = "visit-job-id";
        jobLine.textContent = `Job: ${jobId}`;

        const notesLine = document.createElement("div");
        notesLine.className = "visit-notes";
        notesLine.textContent = notesText || "No notes";

        body.appendChild(jobLine);
        body.appendChild(notesLine);

        // Assigned to dropdown
        const assignRow = document.createElement("div");
        assignRow.className = "visit-assign-row";

        const assignLabel = document.createElement("div");
        assignLabel.className = "visit-assign-label";
        assignLabel.textContent = "Assigned to:";

        const select = document.createElement("select");
        select.className = "visit-assign-select";
        populateTechSelect(select, allTechs, visit.technician_id);

        select.addEventListener("change", async () => {
          await assignTechToVisit({
            visitId: visit.id,
            technicianId: select.value ? select.value : null,
            selectEl: select,
          });
        });

        assignRow.appendChild(assignLabel);
        assignRow.appendChild(select);
        body.appendChild(assignRow);

        card.appendChild(header);
        card.appendChild(body);
        list.appendChild(card);
      }

      section.appendChild(list);
      calendarEl.appendChild(section);
    }
  }
});
