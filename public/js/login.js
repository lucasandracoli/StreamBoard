const notyf = new Notyf();

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

    if (result.code === 200) {
      notyf.success(result.message);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    } else {
      notyf.error(result.message);
    }
  });
