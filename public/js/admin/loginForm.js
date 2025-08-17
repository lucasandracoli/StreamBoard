import { notyf } from "./utils.js";

export function setupLoginForm() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitButton = loginForm.querySelector("button[type='submit']");
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginForm.username.value.trim(),
          password: loginForm.password.value.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notyf.error(json.message || `Erro ${res.status}`);
        return;
      }
      notyf.success(json.message);
      setTimeout(() => (location.href = "/dashboard"), 1200);
    } catch (err) {
      notyf.error("Falha na comunicação com o servidor.");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonText;
    }
  });
}
