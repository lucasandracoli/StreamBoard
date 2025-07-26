import { notyf } from "./utils.js";

export function setupLoginForm() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
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
      if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);
      notyf.success(json.message);
      setTimeout(() => (location.href = "/dashboard"), 1200);
    } catch (err) {
      notyf.error("Falha na comunicação com o servidor.");
    }
  });
}