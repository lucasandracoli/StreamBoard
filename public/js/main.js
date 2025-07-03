document.addEventListener("DOMContentLoaded", () => {
  const notyf = new Notyf();

  // Função auxiliar para tratar erros de fetch
  const handleFetchError = async (response) => {
    try {
      const errorJson = await response.json();
      return errorJson.message || `Erro ${response.status}`;
    } catch (e) {
      return `Erro ${response.status}: A resposta do servidor não é um JSON válido.`;
    }
  };

  // --- MODAIS E EVENTOS DE UI ---
  const deviceModal = document.getElementById("deviceModal");
  const openDeviceModalBtn = document.getElementById("openDeviceModal");
  const cancelDeviceModalBtn = document.getElementById("cancelDeviceModal");
  const connectionModal = document.getElementById("connectionModal");
  const closeConnectionBtn = document.getElementById("closeConnectionModal");
  const inputId = document.getElementById("modalDeviceId");
  const inputKey = document.getElementById("modalDeviceKey");
  const confirmationModal = document.getElementById("confirmationModal");
  const campaignModal = document.getElementById("campaignModal");

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
    resetFileInput();
  });

  const closeConfirmationModalBtn = document.getElementById(
    "closeConfirmationModal"
  );
  const cancelConfirmationBtn = document.getElementById("cancelConfirmation");

  closeConfirmationModalBtn?.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });
  cancelConfirmationBtn?.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === deviceModal) {
      deviceModal.classList.remove("active");
      setTimeout(() => (deviceModal.style.display = "none"), 220);
    }
    if (e.target === connectionModal) connectionModal.style.display = "none";
    if (e.target === campaignModal) {
      campaignModal.classList.remove("active");
      setTimeout(() => (campaignModal.style.display = "none"), 220);
      resetFileInput();
    }
    if (e.target === confirmationModal)
      confirmationModal.style.display = "none";
  });

  // --- LÓGICA DE FORMULÁRIOS ---

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
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

  const deviceForm = document.querySelector('form[action="/devices"]');
  if (deviceForm) {
    deviceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (
        [...deviceForm.querySelectorAll("[required]")].some(
          (el) => el.value.trim() === ""
        )
      ) {
        return notyf.error("Preencha todos os campos obrigatórios.");
      }
      try {
        const res = await fetch(deviceForm.action, {
          method: deviceForm.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(deviceForm))),
        });
        const json = await res.json();
        if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);

        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha na comunicação com o servidor.");
      }
    });
  }

  const campaignForm = document.querySelector('form[action="/campaigns"]');
  if (campaignForm) {
    campaignForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (
        [...campaignForm.querySelectorAll("[required]")].some(
          (el) => el.value.trim() === ""
        )
      ) {
        return notyf.error("Preencha todos os campos obrigatórios.");
      }
      try {
        const res = await fetch(campaignForm.action, {
          method: campaignForm.method,
          body: new FormData(campaignForm),
        });
        const json = await res.json();
        if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);

        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha de comunicação ou resposta inválida do servidor.");
      }
    });
  }

  document.querySelectorAll(".action-icon-excluir").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmationModal.style.display = "flex";
      const confirmDeletionBtn = document.getElementById("confirmDeletion");
      confirmDeletionBtn.onclick = async () => {
        try {
          const res = await fetch(`/campaigns/${btn.dataset.id}/delete`, {
            method: "POST",
          });
          const json = await res.json();
          if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);

          notyf.success(json.message);
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          notyf.error("Falha na comunicação com o servidor.");
        }
      };
    });
  });

  document.querySelectorAll(".revoke-token").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/devices/${btn.dataset.identifier}/revoke`, {
          method: "POST",
        });
        if (!res.ok) {
          const msg = await handleFetchError(res);
          return notyf.error(msg);
        }
        notyf.success("Token revogado com sucesso.");
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha na comunicação com o servidor.");
      }
    });
  });

  // --- INICIALIZAÇÃO DE PLUGINS E UPLOAD ---
  const fileUploadInput = document.getElementById("file-upload");
  const filePreviewWrapper = document.getElementById("file-preview-wrapper");
  const fileUploadLabel = document.querySelector('label[for="file-upload"]');
  const resetFileInput = () => {
    if (fileUploadInput) fileUploadInput.value = "";
    if (filePreviewWrapper) filePreviewWrapper.innerHTML = "";
    if (fileUploadLabel) fileUploadLabel.style.display = "inline-flex";
  };
  fileUploadInput?.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    const fileName = file.name;
    const fileExtension = fileName.split(".").pop();
    const isVideo = file.type.includes("video");
    const iconClass = isVideo ? "bi-camera-video-fill" : "bi-image-fill";
    const previewHTML = `
      <div class="file-preview">
        <div class="file-preview-icon"><i class="bi ${iconClass}"></i></div>
        <div class="file-preview-details">
          <div class="file-preview-name">${fileName}</div>
          <div class="file-preview-extension">${fileExtension}</div>
        </div>
        <button type="button" class="file-preview-remove" id="remove-file-btn"><i class="bi bi-x"></i></button>
      </div>`;
    filePreviewWrapper.innerHTML = previewHTML;
    fileUploadLabel.style.display = "none";
    document
      .getElementById("remove-file-btn")
      .addEventListener("click", resetFileInput);
  });

  const startInput = document.getElementById("start_date");
  const endInput = document.getElementById("end_date");
  if (startInput) {
    flatpickr(startInput, {
      enableTime: true,
      time_24hr: true,
      defaultDate: new Date(),
      altInput: true,
      altFormat: "d/m/Y H:i",
      dateFormat: "Y-m-d H:i",
      locale: "pt",
    });
  }
  if (endInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    flatpickr(endInput, {
      enableTime: true,
      time_24hr: true,
      defaultDate: tomorrow,
      altInput: true,
      altFormat: "d/m/Y H:i",
      dateFormat: "Y-m-d H:i",
      locale: "pt",
    });
  }
});
