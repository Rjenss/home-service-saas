// Set this to your API base URL from CloudFormation Outputs (ApiUrl)
// Example: "https://abc123.execute-api.us-east-1.amazonaws.com/Prod"
const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const jobForm = document.getElementById("jobForm");
  const jobFormStatus = document.getElementById("jobFormStatus");
  const jobsListEl = document.getElementById("jobsList");

  // Load jobs on page load
  loadJobs();



  // Create Job (POST /jobs)
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      jobFormStatus.textContent = "API base URL is not set in app.js.";
      return;
    }

    const job = {
      customerName: document.getElementById("customerName").value.trim(),
      customerPhone: document.getElementById("customerPhone").value.trim(),
      address: document.getElementById("address").value.trim(),
      description: document.getElementById("description").value.trim(),
      priority: document.getElementById("priority").value,
    };

    if (!job.customerName) {
      jobFormStatus.textContent = "Customer name is required.";
      return;
    }

    jobFormStatus.textContent = "Creating job...";

    try {
      const res = await fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      });

      if (!res.ok) {
        const text = await res.text();
        jobFormStatus.textContent = `Error creating job. Status ${res.status}. ${text}`;
        return;
      }

      const createdJob = await res.json();
      jobFormStatus.textContent = `Job created with ID ${createdJob.jobId}.`;

      jobForm.reset();
      await loadJobs();
    } catch (err) {
      jobFormStatus.textContent = `Error creating job: ${String(err)}`;
    }
  });

  async function loadJobs() {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      jobsListEl.textContent = "API base URL is not set in app.js.";
      return;
    }

    jobsListEl.textContent = "Loading jobs...";

    try {
      const res = await fetch(`${baseUrl}/jobs`, {
        method: "GET",
      });

      if (!res.ok) {
        const text = await res.text();
        jobsListEl.textContent = `Error loading jobs. Status ${res.status}. ${text}`;
        return;
      }

      const jobs = await res.json();
      renderJobs(jobs);
    } catch (err) {
      jobsListEl.textContent = `Error loading jobs: ${String(err)}`;
    }
  }

  function renderJobs(jobs) {
    jobsListEl.innerHTML = "";

    if (!jobs || jobs.length === 0) {
      jobsListEl.textContent = "No jobs yet.";
      return;
    }

    for (const job of jobs) {
      const card = document.createElement("div");
      card.className = "job-card";

      const header = document.createElement("div");
      header.className = "job-card-header";
      header.innerHTML = `
        <span>${job.jobId || "(no id)"}</span>
        <span>${job.priority || ""}</span>
      `;

      const body = document.createElement("div");
      body.className = "job-card-body";
      body.innerHTML = `
        <div><strong>${job.customerName || ""}</strong></div>
        <div>${job.description || ""}</div>
        <div>${job.address || ""}</div>
        <div>${job.customerPhone || ""}</div>
      `;

      card.appendChild(header);
      card.appendChild(body);
      jobsListEl.appendChild(card);
    }
  }
});
