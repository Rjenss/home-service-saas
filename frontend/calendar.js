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
  let selectedDate = getTodayIso(); // "YYYY-MM-DD" in your local time (CST/CDT for you)

  init();

  function init() {
    updateCurrentDayLabel();
    if (prevDayBtn) {
      prevDayBtn.addEventListener("click", () => {
        changeDay(-1);
      });
    }
    if (nextDayBtn) {
      nextDayBtn.addEventListener("click", () => {
        changeDay(1);
      });
    }
    loadJobVisitsForCalendar();
  }

  // Today in local time as "YYYY-MM-DD"
  function getTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Move selected date by offset days (-1 = previous, +1 = next)
  function changeDay(offset) {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d); // local date
    date.setDate(date.getDate() + offset);

    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, "0");
    const newD = String(date.getDate()).padStart(2, "0");
    selectedDate = `${newY}-${newM}-${newD}`;

    updateCurrentDayLabel();
    renderVisitsForSelectedDay();
  }

  // Update the big label at the top
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

  async function loadJobVisitsForCalendar() {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      if (statusEl) {
        statusEl.textContent =
          "API base URL is not configured. Please check calendar.js.";
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Loading job visits...";
    }

    try {
      const resp = await fetch(`${baseUrl}/job_visits`, {
        method: "GET",
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      allVisits = Array.isArray(data) ? data : [];

      renderVisitsForSelectedDay();
    } catch (err) {
      console.error("Error loading job visits:", err);
      if (statusEl) {
        statusEl.textContent = "Error loading job visits. Check console logs.";
      }
    }
  }

  function renderVisitsForSelectedDay() {
    if (!calendarEl) return;
    calendarEl.innerHTML = "";

    // Filter to the selected date
    const visits = allVisits
      .filter(v => v.scheduled_date === selectedDate)
      .sort((a, b) => {
        const ta = (a.scheduled_time || "").padStart(5, "9");
        const tb = (b.scheduled_time || "").padStart(5, "9");
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      });

    if (statusEl) {
      if (!visits.length) {
        statusEl.textContent = `No visits scheduled for ${selectedDate}.`;
      } else {
        statusEl.textContent = `Showing ${visits.length} visit(s) for ${selectedDate}.`;
      }
    }

    if (!visits.length) {
      const msg = document.createElement("p");
      msg.className = "calendar-empty";
      msg.textContent = "No visits scheduled for this day.";
      calendarEl.appendChild(msg);
      return;
    }

    // Group by technician
    const byTech = {};
    for (const visit of visits) {
      const techLabel =
        visit.technician_name ||
        visit.technician_id ||
        "Unassigned";
      if (!byTech[techLabel]) {
        byTech[techLabel] = [];
      }
      byTech[techLabel].push(visit);
    }

    for (const techLabel of Object.keys(byTech)) {
      const section = document.createElement("section");
      section.className = "calendar-tech-section";

      const heading = document.createElement("h2");
      heading.className = "calendar-tech-heading";
      heading.textContent =
        techLabel === "Unassigned"
          ? "Unassigned visits"
          : `Technician: ${techLabel}`;
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

        header.innerHTML = `
          <span>${timeText}</span>
          <span class="visit-status visit-status-${statusText.toLowerCase()}">
            ${statusText}
          </span>
        `;

        const body = document.createElement("div");
        body.className = "job-card-body";

        const jobId = visit.job_id || "N/A";
        const notesText = visit.notes || "";

        body.innerHTML = `
          <div class="visit-job-id">Job: ${jobId}</div>
          <div class="visit-notes">${notesText || "No notes"}</div>
        `;

        card.appendChild(header);
        card.appendChild(body);
        list.appendChild(card);
      }

      section.appendChild(list);
      calendarEl.appendChild(section);
    }
  }
});
