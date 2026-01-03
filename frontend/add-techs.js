const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("techForm");
  const statusEl = document.getElementById("techFormStatus");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const baseUrl = getApiBaseUrl();
    statusEl.textContent = "Saving...";

    const payload = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      email: document.getElementById("email").value.trim(),
      skill_tags: document.getElementById("skill_tags").value.trim(),
      active: document.getElementById("active").value === "true",
    };

    try {
      const res = await fetch(`${baseUrl}/technicians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        statusEl.textContent = `Error: ${res.status}`;
        return;
      }

      const created = JSON.parse(text);
      statusEl.textContent = `Created: ${created.first_name}${created.last_name ? " " + created.last_name : ""}`;
      form.reset();
      document.getElementById("active").value = "true";
    } catch (err) {
      statusEl.textContent = `Error: ${String(err)}`;
    }
  });
});
