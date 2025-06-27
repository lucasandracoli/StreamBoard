document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("deviceList");
  const logoutButton = document.getElementById("logoutButton");

  fetch("/api/devices")
    .then((res) => res.json())
    .then((data) => {
      if (data.status === "success") {
        list.innerHTML = data.devices.length
          ? data.devices
              .map(
                (d) => `
              <li>
                <strong>${d.name}</strong><br />
                Token: <code>${d.token}</code><br />
                Última conexão: ${
                  d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "Nunca"
                }
              </li>
            `
              )
              .join("")
          : "<li>Nenhum dispositivo pareado ainda.</li>";
      } else {
        list.innerHTML = `<li class="error">${data.message}</li>`;
      }
    });

  logoutButton.addEventListener("click", () => {
    window.location.href = "/logout";
  });
});
