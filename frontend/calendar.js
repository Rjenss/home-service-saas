// calendar.js
const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("calendarStatus");
  const calendarEl = document.getElementById("calendarJobs");

  loadJobsForCalendar();

  async function loadJobsForCalendar() {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      statusEl.textContent = "API base URL is not set.";
      return;
    }

    statusEl.textContent = "Loading jobs...";

    try {
      const res = await fetch(`${baseUrl}/jobs`, { method: "GET" });
      if (!res.ok) {
        const text = await res.text();
        statusEl.textContent = `Error loading jobs. Status ${res.status}. ${text}`;
        return;
      }

      const jobs = await res.json();
      statusEl.textContent = "";
      renderCalendar(jobs || []);
    } catch (err) {
      statusEl.textContent = `Error loading jobs: ${String(err)}`;
    }
  }

  function renderCalendar(jobs) {
    calendarEl.innerHTML = "";

    if (!jobs.length) {
      calendarEl.textContent = "No jobs scheduled yet.";
      return;
    }

    // Group by date derived from created_at (YYYY-MM-DD)
    const byDate = {};
    for (const job of jobs) {
      const created = job.created_at || job.createdAt || "";
      const dateKey = created ? created.slice(0, 10) : "Unscheduled";

      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(job);
    }

    const dates = Object.keys(byDate).sort();
    for (const d of dates) {
      const section = document.createElement("section");
      section.className = "calendar-day";

      const heading = document.createElement("h2");
      heading.textContent = d === "Unscheduled" ? "Unscheduled" : d;
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "calendar-day-list";

      for (const job of byDate[d]) {
        const card = document.createElement("div");
        card.className = "job-card";

        const title = document.createElement("div");
        title.className = "job-card-title";
        title.textContent = job.customerName || "(no name)";

        const details = document.createElement("div");
        details.className = "job-card-details";
        details.innerHTML = `
          <div>${job.description || ""}</div>
          <div>${job.address || ""}</div>
          <div>${job.customerPhone || ""}</div>
          <div>Status: ${job.status || "new"}</div>
          <div>Priority: ${job.priority || "normal"}</div>
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
