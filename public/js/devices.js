document.addEventListener("DOMContentLoaded", () => {
  const notyf = new Notyf();

  const deviceModal = document.getElementById("deviceModal");
  const openBtn = document.getElementById("openDeviceModal");
  const cancelBtn = document.getElementById("cancelDeviceModal");

  const connectionModal = document.getElementById("connectionModal");
  const closeConnectionBtn = document.getElementById("closeConnectionModal");

  const inputId = document.getElementById("modalDeviceId");
  const inputKey = document.getElementById("modalDeviceKey");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      deviceModal.style.display = "flex";
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      deviceModal.style.display = "none";
    });
  }

  if (closeConnectionBtn) {
    closeConnectionBtn.addEventListener("click", () => {
      connectionModal.style.display = "none";
    });
  }

  document.querySelectorAll(".show-connection").forEach((button) => {
    button.addEventListener("click", () => {
      const identifier = button.getAttribute("data-identifier");
      const key = button.getAttribute("data-key");
      inputId.value = identifier;
      inputKey.value = key;
      connectionModal.style.display = "flex";
    });
  });

  // Revogar Token
  document.querySelectorAll(".revoke-token").forEach((button) => {
    button.addEventListener("click", async () => {
      const identifier = button.getAttribute("data-identifier");

      try {
        const response = await fetch(`/devices/${identifier}/revoke`, {
          method: "POST",
        });

        if (response.ok) {
          notyf.success("Token revogado com sucesso.");
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          throw new Error("Erro ao revogar token.");
        }
      } catch (error) {
        notyf.error(error.message);
      }
    });
  });

  window.addEventListener("click", (e) => {
    if (e.target === deviceModal) {
      deviceModal.style.display = "none";
    }
    if (e.target === connectionModal) {
      connectionModal.style.display = "none";
    }
  });

  const form = document.querySelector('form[action="/devices"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });

    try {
      const response = await fetch(form.action, {
        method: form.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(
          `Erro ao cadastrar dispositivo. Status: ${response.status}`
        );
      }

      const result = await response.json();

      if (result.code === 200) {
        notyf.success(result.message);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        notyf.error(result.message);
      }
    } catch (error) {
      notyf.error("Erro inesperado. Tente novamente.");
    }
  });
});
