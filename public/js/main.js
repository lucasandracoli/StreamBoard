document.addEventListener("DOMContentLoaded", () => {
  const notyf = new Notyf();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
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
  }

  const deviceModal = document.getElementById("deviceModal");
  const openDeviceModalBtn = document.getElementById("openDeviceModal");
  const cancelDeviceModalBtn = document.getElementById("cancelDeviceModal");
  const connectionModal = document.getElementById("connectionModal");
  const closeConnectionBtn = document.getElementById("closeConnectionModal");
  const inputId = document.getElementById("modalDeviceId");
  const inputKey = document.getElementById("modalDeviceKey");

  if (openDeviceModalBtn) {
    openDeviceModalBtn.addEventListener("click", () => {
      deviceModal.style.display = "flex";
      setTimeout(() => document.querySelector(".modal-input").focus(), 200);
      deviceModal.classList.add("active");
    });
  }

  if (cancelDeviceModalBtn) {
    cancelDeviceModalBtn.addEventListener("click", () => {
      deviceModal.classList.remove("active");
      setTimeout(() => (deviceModal.style.display = "none"), 300);
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
      deviceModal.classList.remove("active");
      setTimeout(() => (deviceModal.style.display = "none"), 300);
    }
    if (e.target === connectionModal) {
      connectionModal.style.display = "none";
    }
  });

  const deviceForm = document.querySelector('form[action="/devices"]');
  if (deviceForm) {
    deviceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(deviceForm);
      const data = {};
      formData.forEach((value, key) => {
        data[key] = value;
      });

      try {
        const response = await fetch(deviceForm.action, {
          method: deviceForm.method,
          headers: { "Content-Type": "application/json" },
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
  }

  const campaignModal = document.getElementById("campaignModal");
  const openCampaignModalBtn = document.getElementById("openCampaignModal");
  const cancelCampaignModalBtn = document.getElementById("cancelCampaignModal");

  if (openCampaignModalBtn) {
    openCampaignModalBtn.addEventListener("click", () => {
      campaignModal.style.display = "flex";
      setTimeout(() => document.querySelector(".modal-input").focus(), 200);
      campaignModal.classList.add("active");
    });
  }

  if (cancelCampaignModalBtn) {
    cancelCampaignModalBtn.addEventListener("click", () => {
      campaignModal.classList.remove("active");
      setTimeout(() => (campaignModal.style.display = "none"), 300);
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === campaignModal) {
      campaignModal.classList.remove("active");
      setTimeout(() => (campaignModal.style.display = "none"), 300);
    }
  });

  const campaignForm = document.querySelector('form[action="/campaigns"]');
  if (campaignForm) {
    campaignForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(campaignForm);

      try {
        const response = await fetch(campaignForm.action, {
          method: campaignForm.method,
          body: formData,
        });

        if (!response.ok) {
          throw new Error(
            `Erro ao cadastrar campanha. Status: ${response.status}`
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
  }

  const confirmationModal = document.getElementById("confirmationModal");
  const closeConfirmationModalBtn = document.getElementById(
    "closeConfirmationModal"
  );
  const cancelConfirmationBtn = document.getElementById("cancelConfirmation");
  const confirmDeletionBtn = document.getElementById("confirmDeletion");

  document.querySelectorAll(".action-icon-excluir").forEach((button) => {
    button.addEventListener("click", () => {
      const campaignId = button.getAttribute("data-id");
      confirmationModal.style.display = "flex";

      confirmDeletionBtn.addEventListener("click", async () => {
        try {
          const response = await fetch(`/campaigns/${campaignId}/delete`, {
            method: "POST",
          });

          const result = await response.json();
          if (response.ok) {
            notyf.success(result.message);
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          } else {
            throw new Error(result.message);
          }
        } catch (error) {
          notyf.error(error.message);
        }
      });
    });
  });

  closeConfirmationModalBtn.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });

  cancelConfirmationBtn.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });

  flatpickr("#start_date", {
    dateFormat: "d/m/Y",
    locale: "pt",
    static: true,
    allowInput: true,
  });

  flatpickr("#end_date", {
    dateFormat: "d/m/Y",
    locale: "pt",
    static: true,
    allowInput: true,
  });
});
