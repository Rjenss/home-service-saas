// Set this to your API base URL from CloudFormation (ApiUrl)
const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const jobForm = document.getElementById("jobForm");
  const jobFormStatus = document.getElementById("jobFormStatus");

  // Create Job (POST /jobs)
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const baseUrl = getApiBaseUrl();

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
      jobFormStatus.textContent = `Job created successfully! Job ID: ${createdJob.jobId}`;

      jobForm.reset();

    } catch (err) {
      jobFormStatus.textContent = `Error creating job: ${String(err)}`;
    }
  });
});
