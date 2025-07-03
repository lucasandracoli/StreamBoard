document.addEventListener("DOMContentLoaded", () => {
  const notyf = new Notyf();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = JSON.stringify({
        username: loginForm.username.value.trim(),
        password: loginForm.password.value.trim(),
      });
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const json = await res.json();
      if (res.ok && json.code === 200) {
        notyf.success(json.message);
        setTimeout(() => (location.href = "/dashboard"), 1200);
      } else {
        notyf.error(json.message);
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

  openDeviceModalBtn?.addEventListener("click", () => {
    deviceModal.style.display = "flex";
    setTimeout(() => deviceModal.querySelector(".modal-input").focus(), 120);
    deviceModal.classList.add("active");
  });

  cancelDeviceModalBtn?.addEventListener("click", () => {
    deviceModal.classList.remove("active");
    setTimeout(() => (deviceModal.style.display = "none"), 220);
  });

  closeConnectionBtn?.addEventListener("click", () => {
    connectionModal.style.display = "none";
  });

  document.querySelectorAll(".show-connection").forEach((btn) => {
    btn.addEventListener("click", () => {
      inputId.value = btn.dataset.identifier;
      inputKey.value = btn.dataset.key;
      connectionModal.style.display = "flex";
    });
  });

  document.querySelectorAll(".revoke-token").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await fetch(`/devices/${btn.dataset.identifier}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        notyf.success("Token revogado com sucesso.");
        setTimeout(() => location.reload(), 1200);
      } else {
        notyf.error("Erro ao revogar token.");
      }
    });
  });

  const confirmationModal = document.getElementById("confirmationModal");
  window.addEventListener("click", (e) => {
    if (e.target === deviceModal) {
      deviceModal.classList.remove("active");
      setTimeout(() => (deviceModal.style.display = "none"), 220);
    }
    if (e.target === connectionModal) connectionModal.style.display = "none";
    if (e.target === campaignModal) {
      campaignModal.classList.remove("active");
      setTimeout(() => (campaignModal.style.display = "none"), 220);
    }
    if (e.target === confirmationModal)
      confirmationModal.style.display = "none";
  });

  const deviceForm = document.querySelector('form[action="/devices"]');
  if (deviceForm) {
    deviceForm.noValidate = true;
    deviceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const filled = [...deviceForm.querySelectorAll("[required]")].every(
        (el) => el.value.trim() !== ""
      );
      if (!filled) {
        notyf.error("Preencha todos os campos obrigatórios.");
        return;
      }
      const body = JSON.stringify(Object.fromEntries(new FormData(deviceForm)));
      const res = await fetch(deviceForm.action, {
        method: deviceForm.method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      const json = await res.json();
      if (res.ok && json.code === 200) {
        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } else {
        notyf.error(json.message);
      }
    });
  }

  const campaignModal = document.getElementById("campaignModal");
  const openCampaignModalBtn = document.getElementById("openCampaignModal");
  const cancelCampaignModalBtn = document.getElementById("cancelCampaignModal");

  openCampaignModalBtn?.addEventListener("click", () => {
    campaignModal.style.display = "flex";
    setTimeout(() => campaignModal.querySelector(".modal-input").focus(), 120);
    campaignModal.classList.add("active");
  });

  cancelCampaignModalBtn?.addEventListener("click", () => {
    campaignModal.classList.remove("active");
    setTimeout(() => (campaignModal.style.display = "none"), 220);
  });

  const campaignForm = document.querySelector('form[action="/campaigns"]');
  if (campaignForm) {
    campaignForm.noValidate = true;
    campaignForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const filled = [...campaignForm.querySelectorAll("[required]")].every(
        (el) => el.value.trim() !== ""
      );
      if (!filled) {
        notyf.error("Preencha todos os campos obrigatórios.");
        return;
      }
      const res = await fetch(campaignForm.action, {
        method: campaignForm.method,
        body: new FormData(campaignForm),
      });
      const json = await res.json();
      if (res.ok && json.code === 200) {
        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } else {
        notyf.error(json.message);
      }
    });
  }

  const closeConfirmationModalBtn = document.getElementById(
    "closeConfirmationModal"
  );
  const cancelConfirmationBtn = document.getElementById("cancelConfirmation");
  const confirmDeletionBtn = document.getElementById("confirmDeletion");

  document.querySelectorAll(".action-icon-excluir").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmationModal.style.display = "flex";
      confirmDeletionBtn.onclick = async () => {
        const res = await fetch(`/campaigns/${btn.dataset.id}/delete`, {
          method: "POST",
        });
        const json = await res.json();
        if (res.ok) {
          notyf.success(json.message);
          setTimeout(() => location.reload(), 1200);
        } else {
          notyf.error(json.message);
        }
      };
    });
  });

  closeConfirmationModalBtn?.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });
  cancelConfirmationBtn?.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });

  const startInput = document.getElementById("start_date");
  const endInput = document.getElementById("end_date");
  startInput.value = "";
  endInput.value = "";

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);

  flatpickr(startInput, {
    enableTime: true,
    time_24hr: true,
    defaultDate: now,
    altInput: true,
    altFormat: "d/m/Y H:i",
    dateFormat: "Y-m-d H:i",
    locale: "pt",
    allowInput: true,
    static: true,
  });

  flatpickr(endInput, {
    enableTime: true,
    time_24hr: true,
    defaultDate: tomorrow,
    altInput: true,
    altFormat: "d/m/Y H:i",
    dateFormat: "Y-m-d H:i",
    locale: "pt",
    allowInput: true,
    static: true,
  });
});
