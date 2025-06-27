document
  .getElementById("loginForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = this.username.value;
    const password = this.password.value;

    const response = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const result = await response.json();
    document.getElementById("responseMessage").textContent = result.message;

    if (result.code === 200) {
      window.location.href = "/dashboard";
    }
  });
