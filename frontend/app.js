// You can hard-code this later once you're sure of the URL.
// For now we read it from the input so you can change regions/stacks easily.
function getApiBaseUrl() {
  const input = document.getElementById("apiBaseUrl");
  return (input.value || "").trim().replace(/\/+$/, ""); // strip trailing slash
}

document.addEventListener("DOMContentLoaded", () => {
  const testApiBtn = document.getElementById("testApiBtn");
  const apiStatusEl = document.getElementById("apiStatus");

  const jobForm = document.getElementById("jobForm");
  const jobFormStatus = document.getElementById("jobFormStatus");

  const refreshJobsBtn = document.getElementById("refreshJobsBtn");
  const jobsListEl = document.getElementById("jobsList");

  // 1) Test API (/hello)
  testApiBtn.addEventListener("click", async () => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      apiStatusEl.textContent = "Please paste your API base URL (ending in /Prod).";
      return;
    }

    const url = `${baseUrl}/hello`;
    apiStatusEl.textContent = `Calling ${url} ...`;

    try {
      const res = await fetch(url, { method: "GET" });
      const text = await res.text();
      apiStatusEl.textContent = `Status: ${res.status}\nResponse: ${text}`;
    } catch (err) {
      apiStatusEl.textContent = `Error calling API:\n${String(err)}`;
    }
  });

  // 2) Create Job (will POST to /jobs later)
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      jobFormStatus.textContent = "Set API base URL before creating jobs.";
      return;
    }

    const job = {
      customerName: document.getElementById("customerName").value.trim(),
      customerPhone: document.getElementById("customerPhone").value.trim(),
      address: document.getElementById("address").value.trim(),
      description: document.getElementById("description").value.trim(),
      priority: document.getElementById("priority").value,
    };

    // For now, we only log it + pretend success.
    // Later you'll call: POST `${baseUrl}/jobs`
    console.log("Job to create:", job);
    jobFormStatus.textContent = "Job captured locally (stub). Backend /jobs POST not implemented yet.";
    jobForm.reset();
  });

  // 3) Jobs list (will GET /jobs later). For now, stub data.
  refreshJobsBtn.addEventListener("click", async () => {
    jobsListEl.innerHTML = ""; // clear

    // Later:
    // const baseUrl = getApiBaseUrl();
    // const res = await fetch(`${baseUrl}/jobs`);
    // const jobs = await res.json();
    // renderJobs(jobs);

    const dummyJobs = [
      {
        id: "JOB-1001",
        customerName: "John Smith",
        description: "Leaking sink in kitchen",
        priority: "urgent",
      },
      {
        id: "JOB-1002",
        customerName: "Maria Garcia",
        description: "No power in bedroom outlets",
        priority: "normal",
      },
    ];

    renderJobs(dummyJobs);
  });

  function renderJobs(jobs) {
    jobsListEl.innerHTML = "";
    if (!jobs.length) {
      jobsListEl.textContent = "No jobs to show.";
      return;
    }

    for (const job of jobs) {
      const card = document.createElement("div");
      card.className = "job-card";

      const header = document.createElement("div");
      header.className = "job-card-header";
      header.innerHTML = `
        <span>${job.id || "(unsaved)"}</span>
        <span>${job.priority || ""}</span>
      `;

      const body = document.createElement("div");
      body.className = "job-card-body";
      body.innerHTML = `
        <div><strong>${job.customerName || ""}</strong></div>
        <div>${job.description || ""}</div>
      `;

      card.appendChild(header);
      card.appendChild(body);
      jobsListEl.appendChild(card);
    }
  }
});
