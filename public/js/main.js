document.addEventListener("DOMContentLoaded", () => {
  const notyf = new Notyf();
  const MODAL_CLOSE_DELAY = 150;

  const handleFetchError = async (response) => {
    try {
      const errorJson = await response.json();
      return errorJson.message || `Erro ${response.status}`;
    } catch (e) {
      return `Erro ${response.status}: A resposta do servidor não é um JSON válido.`;
    }
  };

  const truncateString = (str, startChars, endChars) => {
    if (!str || str.length <= startChars + endChars) {
      return str;
    }
    return (
      str.substring(0, startChars) +
      "..." +
      str.substring(str.length - endChars)
    );
  };

  const deviceModal = document.getElementById("deviceModal");
  const confirmationModal = document.getElementById("confirmationModal");
  const campaignModal = document.getElementById("campaignModal");
  const detailsModal = document.getElementById("deviceDetailsModal");

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

  if (deviceModal) {
    const openDeviceModalBtn = document.getElementById("openDeviceModal");
    const cancelDeviceModalBtn = document.getElementById("cancelDeviceModal");
    const deviceForm = document.getElementById("deviceForm");
    const modalTitle = document.getElementById("deviceModalTitle");
    const submitButton = document.getElementById("deviceSubmitButton");

    const openCreateDeviceModal = () => {
      deviceForm.reset();
      modalTitle.textContent = "Cadastrar Novo Dispositivo";
      submitButton.textContent = "Adicionar";
      deviceForm.action = "/devices";
      deviceModal.style.display = "flex";
      deviceModal.classList.add("active");
    };

    const openEditDeviceModal = async (deviceId) => {
      try {
        const response = await fetch(`/api/deviceDetails/${deviceId}`);
        if (!response.ok) throw new Error(await handleFetchError(response));
        const device = await response.json();
        deviceForm.reset();
        modalTitle.textContent = "Editar Dispositivo";
        submitButton.textContent = "Salvar Alterações";
        deviceForm.action = `/devices/${device.id}/edit`;
        document.getElementById("newDeviceName").value = device.name;
        document.getElementById("newDeviceType").value = device.device_type;
        document.getElementById("newDeviceSector").value = device.sector;
        deviceModal.style.display = "flex";
        deviceModal.classList.add("active");
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar dados do dispositivo.");
      }
    };

    openDeviceModalBtn?.addEventListener("click", openCreateDeviceModal);

    if (
      document.body.id !== "campaigns-page" &&
      document.body.id !== "dashboard-page"
    ) {
      document.querySelectorAll(".action-icon-editar").forEach((btn) => {
        btn.addEventListener("click", (e) =>
          openEditDeviceModal(e.currentTarget.dataset.id)
        );
      });
    }

    cancelDeviceModalBtn?.addEventListener("click", () => {
      deviceModal.classList.remove("active");
      setTimeout(() => (deviceModal.style.display = "none"), MODAL_CLOSE_DELAY);
    });

    deviceForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (
        [...this.querySelectorAll("[required]")].some(
          (el) => el.value.trim() === ""
        )
      ) {
        return notyf.error("Preencha todos os campos obrigatórios.");
      }
      try {
        const res = await fetch(this.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(this))),
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

  if (campaignModal) {
    const openCampaignModalBtn = document.getElementById("openCampaignModal");
    const cancelCampaignModalBtn = document.getElementById(
      "cancelCampaignModal"
    );
    const campaignForm = campaignModal.querySelector(".modal-form");
    const modalTitle = campaignModal.querySelector(".modal-title");
    const submitButton = campaignForm.querySelector('button[type="submit"]');
    const fileUploadInput = document.getElementById("file-upload");
    const filePreviewWrapper = document.getElementById("file-preview-wrapper");
    const fileUploadLabel = document.querySelector('label[for="file-upload"]');
    const startDatePicker = flatpickr("#start_date", {
      enableTime: true,
      dateFormat: "d/m/Y H:i",
      locale: "pt",
      time_24hr: true,
    });
    const endDatePicker = flatpickr("#end_date", {
      enableTime: true,
      dateFormat: "d/m/Y H:i",
      locale: "pt",
      time_24hr: true,
    });

    const resetFileInput = () => {
      if (fileUploadInput) fileUploadInput.value = "";
      if (filePreviewWrapper) filePreviewWrapper.innerHTML = "";
      if (fileUploadLabel) fileUploadLabel.style.display = "inline-flex";
      const existingHiddenInput = campaignForm.querySelector(
        'input[name="remove_media"]'
      );
      if (existingHiddenInput) existingHiddenInput.remove();
    };

    cancelCampaignModalBtn?.addEventListener("click", () => {
      campaignModal.classList.remove("active");
      setTimeout(() => {
        campaignModal.style.display = "none";
        resetFileInput();
      }, MODAL_CLOSE_DELAY);
    });

    const openCreateCampaignModal = () => {
      campaignForm.reset();
      resetFileInput();
      modalTitle.textContent = "Cadastrar Nova Campanha";
      submitButton.textContent = "Adicionar";
      campaignForm.action = "/campaigns";
      campaignModal.style.display = "flex";
      campaignModal.classList.add("active");
    };

    const openEditCampaignModal = async (campaignId) => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}`);
        if (!response.ok) throw new Error(await handleFetchError(response));
        const { campaign, devices } = await response.json();
        campaignForm.reset();
        resetFileInput();
        modalTitle.textContent = "Editar Campanha";
        submitButton.textContent = "Salvar Alterações";
        campaignForm.action = `/campaigns/${campaign.id}/edit`;
        document.getElementById("campaignName").value = campaign.name;
        startDatePicker.setDate(campaign.start_date, true);
        endDatePicker.setDate(campaign.end_date, true);
        if (devices.length > 0) {
          document.getElementById("device_id").value = devices[0].device_id;
        }
        if (campaign.midia) {
          const fileName = campaign.midia.split("/").pop();
          const isVideo = ["mp4", "webm", "mov"].some((ext) =>
            fileName.toLowerCase().endsWith(ext)
          );
          fileUploadLabel.style.display = "none";
          filePreviewWrapper.innerHTML = `<div class="file-preview"><div class="file-preview-icon"><i class="bi ${
            isVideo ? "bi-camera-video-fill" : "bi-image-fill"
          }"></i></div><div class="file-preview-details"><div class="file-preview-name">${fileName}</div></div><button type="button" class="file-preview-remove" id="remove-existing-media-btn"><i class="bi bi-x"></i></button></div>`;
          document
            .getElementById("remove-existing-media-btn")
            .addEventListener("click", () => {
              resetFileInput();
              fileUploadLabel.style.display = "inline-flex";
              const hiddenInput = document.createElement("input");
              hiddenInput.type = "hidden";
              hiddenInput.name = "remove_media";
              hiddenInput.value = "true";
              campaignForm.appendChild(hiddenInput);
            });
        } else {
          fileUploadLabel.style.display = "inline-flex";
        }
        campaignModal.style.display = "flex";
        campaignModal.classList.add("active");
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar dados da campanha.");
      }
    };

    openCampaignModalBtn?.addEventListener("click", openCreateCampaignModal);

    if (document.body.id === "campaigns-page") {
      document.querySelectorAll(".action-icon-editar").forEach((btn) => {
        btn.addEventListener("click", (e) =>
          openEditCampaignModal(e.currentTarget.dataset.id)
        );
      });
    }

    campaignForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (
        [...this.querySelectorAll("[required]")].some(
          (el) => el.value.trim() === ""
        )
      ) {
        return notyf.error("Preencha todos os campos obrigatórios.");
      }
      try {
        const res = await fetch(this.action, {
          method: "POST",
          body: new FormData(this),
        });
        const json = await res.json();
        if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);
        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha de comunicação ou resposta inválida do servidor.");
      }
    });

    fileUploadInput?.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;
      const fileName = file.name;
      const fileExtension = fileName.split(".").pop();
      const isVideo = file.type.includes("video");
      const iconClass = isVideo ? "bi-camera-video-fill" : "bi-image-fill";
      const previewHTML = `<div class="file-preview"><div class="file-preview-icon"><i class="bi ${iconClass}"></i></div><div class="file-preview-details"><div class="file-preview-name">${fileName}</div><div class="file-preview-extension">${fileExtension}</div></div><button type="button" class="file-preview-remove" id="remove-file-btn"><i class="bi bi-x"></i></button></div>`;
      filePreviewWrapper.innerHTML = previewHTML;
      fileUploadLabel.style.display = "none";
      document
        .getElementById("remove-file-btn")
        .addEventListener("click", resetFileInput);
    });
  }

  document.querySelectorAll(".action-icon-excluir").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmationModal.style.display = "flex";
      const confirmDeletionBtn = document.getElementById("confirmDeletion");

      const newConfirmBtn = confirmDeletionBtn.cloneNode(true);
      confirmDeletionBtn.parentNode.replaceChild(
        newConfirmBtn,
        confirmDeletionBtn
      );

      newConfirmBtn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        let url = "";

        if (document.body.id === "campaigns-page") {
          url = `/campaigns/${id}/delete`;
        } else {
          url = `/devices/${id}/delete`;
        }

        if (!url) return;

        try {
          const res = await fetch(url, { method: "POST" });
          const json = await res.json();

          if (!res.ok) {
            return notyf.error(json.message || `Erro ${res.status}`);
          }

          confirmationModal.style.display = "none";
          notyf.success(json.message);
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          notyf.error("Falha na comunicação com o servidor.");
        }
      });
    });
  });

  const cancelConfirmationBtn = document.getElementById("cancelConfirmation");
  cancelConfirmationBtn?.addEventListener("click", () => {
    confirmationModal.style.display = "none";
  });

  const closeDetailsModalBtn = document.getElementById("closeDetailsModal");
  const detailsLoader = detailsModal?.querySelector(".details-modal-loader");
  const detailsContent = detailsModal?.querySelector(".details-modal-content");

  const populateDetailsModal = (data) => {
    document.getElementById("modalDeviceName").textContent = data.name;
    const deviceType = data.device_type || "desconhecido";
    const capitalizedDeviceType =
      deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
    document.getElementById(
      "modalDeviceType"
    ).textContent = `Dispositivo ${capitalizedDeviceType}`;
    document.getElementById("modalDeviceSector").textContent = data.sector;
    document.getElementById("modalRegisteredAt").textContent =
      data.registered_at_formatted;
    document.getElementById("modalLastSeen").textContent =
      data.last_seen_formatted;

    const identifierEl = document.getElementById("modalDeviceIdentifier");
    const authKeyEl = document.getElementById("modalAuthKey");

    if (identifierEl) {
      identifierEl.textContent = truncateString(data.device_identifier, 8, 8);
      identifierEl.dataset.fullValue = data.device_identifier;
    }

    if (authKeyEl) {
      authKeyEl.textContent = truncateString(data.authentication_key, 8, 8);
      authKeyEl.dataset.fullValue = data.authentication_key;
    }

    document.getElementById("modalDownlink").textContent =
      data.network_downlink !== undefined && data.network_downlink !== null
        ? `${data.network_downlink} Mbps`
        : "N/A";

    const campaignsDiv = document.getElementById("modalActiveCampaigns");
    if (data.active_campaigns && data.active_campaigns.length > 0) {
      let campaignsHtml = "";
      data.active_campaigns.forEach((campaignName) => {
        campaignsHtml += `<p><span class="details-label">Campanha:</span><span>${campaignName}</span></p>`;
      });
      campaignsDiv.innerHTML = campaignsHtml;
    } else {
      campaignsDiv.innerHTML =
        '<p class="details-subtitle">Nenhuma campanha ativa no momento.</p>';
    }

    const iconContainer = document.getElementById("modalDeviceIcon");
    const icon = document.querySelector(
      `.open-details-modal[data-device-id="${data.id}"] i`
    );
    if (icon) {
      iconContainer.innerHTML = icon.outerHTML;
    }

    const revokeBtn = document.getElementById("modalRevokeButton");
    const reactivateBtn = document.getElementById("modalReactivateButton");
    revokeBtn.dataset.identifier = data.device_identifier;
    reactivateBtn.dataset.identifier = data.device_identifier;

    if (data.is_active) {
      revokeBtn.style.display = "inline-flex";
      reactivateBtn.style.display = "none";
    } else {
      revokeBtn.style.display = "none";
      reactivateBtn.style.display = "inline-flex";
    }
  };

  document.querySelectorAll(".open-details-modal").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const deviceId = btn.dataset.deviceId;
      if (detailsModal) {
        detailsModal.style.display = "flex";
        if (detailsContent) detailsContent.style.display = "none";
        if (detailsLoader) detailsLoader.style.display = "flex";
        try {
          const res = await fetch(`/api/deviceDetails/${deviceId}`);
          if (!res.ok) {
            throw new Error("Falha ao carregar dados do dispositivo.");
          }
          const data = await res.json();
          populateDetailsModal(data);
          if (detailsLoader) detailsLoader.style.display = "none";
          if (detailsContent) detailsContent.style.display = "block";
        } catch (err) {
          notyf.error(err.message);
          detailsModal.style.display = "none";
        }
      }
    });
  });

  detailsModal?.addEventListener("click", function (e) {
    const copyElement = e.target.closest(".copyable-code");
    if (copyElement) {
      const fullValue = copyElement.dataset.fullValue;
      if (fullValue) {
        navigator.clipboard
          .writeText(fullValue)
          .then(() => {
            notyf.success("Copiado para a área de transferência!");
          })
          .catch((err) => {
            notyf.error("Falha ao copiar.");
          });
      }
    }
  });

  closeDetailsModalBtn?.addEventListener("click", () => {
    if (detailsModal) detailsModal.style.display = "none";
  });

  document
    .getElementById("modalRevokeButton")
    ?.addEventListener("click", async function () {
      const identifier = this.dataset.identifier;
      try {
        const res = await fetch(`/devices/${identifier}/revoke`, {
          method: "POST",
        });
        if (!res.ok) {
          const msg = await handleFetchError(res);
          return notyf.error(msg);
        }
        notyf.success("Dispositivo revogado com sucesso.");
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha na comunicação com o servidor.");
      }
    });

  document
    .getElementById("modalReactivateButton")
    ?.addEventListener("click", async function () {
      const identifier = this.dataset.identifier;
      try {
        const res = await fetch(`/devices/${identifier}/reactivate`, {
          method: "POST",
        });
        if (!res.ok) {
          const msg = await handleFetchError(res);
          return notyf.error(msg);
        }
        const json = await res.json();
        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha na comunicação com o servidor.");
      }
    });

  window.addEventListener("click", (e) => {
    if (e.target === deviceModal) {
      deviceModal.classList.remove("active");
      setTimeout(() => (deviceModal.style.display = "none"), MODAL_CLOSE_DELAY);
    }
    if (e.target === campaignModal) {
      campaignModal.classList.remove("active");
      setTimeout(() => {
        campaignModal.style.display = "none";
        campaignModal.querySelector(".modal-form").reset();
        campaignModal.querySelector("#file-preview-wrapper").innerHTML = "";
        campaignModal.querySelector('label[for="file-upload"]').style.display =
          "inline-flex";
      }, MODAL_CLOSE_DELAY);
    }
    if (e.target === confirmationModal)
      confirmationModal.style.display = "none";
    if (e.target === detailsModal) detailsModal.style.display = "none";
  });

  document.querySelectorAll(".device-table tbody tr").forEach((row) => {
    row.addEventListener("click", function (event) {
      if (
        event.target.closest(
          ".action-icon, .action-icon-excluir, .action-icon-editar, .details-icon-button"
        )
      ) {
        return;
      }
      this.querySelector(".open-details-modal")?.click();
    });
  });
});
