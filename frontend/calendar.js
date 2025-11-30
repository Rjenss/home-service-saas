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
  let selectedDate = getTodayDateCST(); // "YYYY-MM-DD"

  init();

  function init() {
    updateCurrentDayLabel(selectedDate);
    if (prevDayBtn) {
      prevDayBtn.addEventListener("click", () => changeDay(-1));
    }
    if (nextDayBtn) {
      nextDayBtn.addEventListener("click", () => changeDay(1));
    }
    loadJobVisitsForCalendar();
  }

  // Get today's date in CST as "YYYY-MM-DD"
  function getTodayDateCST() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === "year").value;
    const month = parts.find(p => p.type === "month").value;
    const day = parts.find(p => p.type === "day").value;
    return `${year}-${month}-${day}`;
  }

  function isoToDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function dateToIsoUTC(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Move selected date by offset days (-1 = previous, 1 = next)
  function changeDay(offset) {
    const date = isoToDate(selectedDate);
    date.setUTCDate(date.getUTCDate() + offset);
    selectedDate = dateToIsoUTC(date);
    updateCurrentDayLabel(selectedDate);
    renderVisitsForSelectedDay();
  }

  // Friendly label for currently selected day
  function updateCurrentDayLabel(isoDate) {
    if (!currentDayLabelEl) return;
    if (!isoDate) {
      currentDayLabelEl.textContent = "Unscheduled";
      return;
    }
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
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

      if (statusEl) {
        if (!allVisits.length) {
          statusEl.textContent = "No job visits found.";
        } else {
          statusEl.textContent = `Loaded ${allVisits.length} job visits.`;
        }
      }

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

    if (!selectedDate) {
      const msg = document.createElement("p");
      msg.textContent = "No day selected.";
      calendarEl.appendChild(msg);
      return;
    }

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

    if (!visits.length) {
      const msg = document.createElement("p");
      msg.className = "calendar-empty";
      msg.textContent = "No visits scheduled for this day.";
      calendarEl.appendChild(msg);
      return;
    }

    // Group by technician so dispatcher can see who is doing what
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
