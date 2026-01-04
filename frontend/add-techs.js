const API_BASE_URL = "https://fdho6lafwk.execute-api.us-east-2.amazonaws.com/Prod";

function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, "");
}

function mustGet(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element with id="${id}". Check add-techs.html.`);
  }
  return el;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = mustGet("techForm");
  const statusEl = mustGet("techFormStatus");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    statusEl.textContent = "Saving...";

    try {
      const baseUrl = getApiBaseUrl();

      const firstNameEl = mustGet("first_name");
      const lastNameEl = mustGet("last_name");
      const phoneEl = mustGet("phone");
      const emailEl = mustGet("email");
      const skillTagsEl = mustGet("skill_tags");

      const payload = {
        first_name: firstNameEl.value.trim(),
        last_name: lastNameEl.value.trim(),
        phone: phoneEl.value.trim(),
        email: emailEl.value.trim(),
        skill_tags: skillTagsEl.value.trim()
      };

      if (!payload.first_name) {
        statusEl.textContent = "First name is required.";
        return;
      }
      if (!payload.phone) {
        statusEl.textContent = "Phone is required.";
        return;
      }

      const res = await fetch(`${baseUrl}/technicians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      if (!res.ok) {
        statusEl.textContent = `Error: ${res.status} ${text}`;
        return;
      }

      let created;
      try {
        created = JSON.parse(text);
      } catch {
        statusEl.textContent = "Created, but response was not valid JSON.";
        form.reset();
        return;
      }

      const name = `${created.first_name || ""} ${created.last_name || ""}`.trim() || "Technician";
      statusEl.textContent = `Created: ${name}`;
      form.reset();
    } catch (err) {
      statusEl.textContent = `Error: ${String(err)}`;
    }
  });
});
