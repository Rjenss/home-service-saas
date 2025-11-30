// calendar.js
const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  // Strip any trailing slash from the base URL
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("calendarStatus");
  const calendarEl = document.getElementById("calendarJobs");

  loadJobVisitsForCalendar();

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
      const visits = Array.isArray(data) ? data : [];

      if (!visits.length) {
        if (statusEl) {
          statusEl.textContent = "No job visits found.";
        }
        calendarEl.innerHTML = "";
        return;
      }

      if (statusEl) {
        statusEl.textContent = `Loaded ${visits.length} job visits.`;
      }

      renderCalendar(visits);
    } catch (err) {
      console.error("Error loading job visits:", err);
      if (statusEl) {
        statusEl.textContent = "Error loading job visits. Check console logs.";
      }
    }
  }

  function renderCalendar(visits) {
    calendarEl.innerHTML = "";

    // Group visits by scheduled_date (fallback to "Unscheduled")
    const grouped = {};
    for (const visit of visits) {
      const dateKey = visit.scheduled_date || "Unscheduled";
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(visit);
    }

    // Sort dates, keep "Unscheduled" at the end
    const dateKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      // Simple string compare; ISO dates will sort correctly
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

    for (const dateKey of dateKeys) {
      const section = document.createElement("section");
      section.className = "calendar-day";

      const heading = document.createElement("h2");
      heading.textContent = dateKey === "Unscheduled" ? "Unscheduled visits" : dateKey;
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "calendar-day-list";

      const visitsForDay = grouped[dateKey];

      for (const visit of visitsForDay) {
        const card = document.createElement("article");
        card.className = "job-card";

        const title = document.createElement("h3");
        title.textContent = visit.job_id
          ? `Visit for job ${visit.job_id}`
          : "Job visit";

        const details = document.createElement("div");
        details.className = "job-card-details";

        const timeText =
          visit.scheduled_time ||
          visit.scheduled_display ||
          "Time not set";

        const statusText = visit.status || "scheduled";
        const techText = visit.technician_id || "Unassigned";
        const notesText = visit.notes || "";

        details.innerHTML = `
          <div>Time: ${timeText}</div>
          <div>Status: ${statusText}</div>
          <div>Technician: ${techText}</div>
          <div>Notes: ${notesText}</div>
        `;

        card.appendChild(title);
        card.appendChild(details);
        list.appendChild(card);
      }

      section.appendChild(list);
      calendarEl.appendChild(section);
    }
  }
});
