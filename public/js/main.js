document.addEventListener("DOMContentLoaded", () => {
  const notyf = new Notyf({
    duration: 3000,
    position: { x: "right", y: "top" },
    dismissible: true,
  });

  const deviceTypeNames = {
    midia_indoor: "Mídia Indoor",
    terminal_consulta: "Terminal de Consulta",
    default: "Tipo Desconhecido",
  };

  const handleFetchError = async (response) => {
    try {
      const errorJson = await response.json();
      return errorJson.message || `Erro ${response.status}`;
    } catch (e) {
      return `Erro ${response.status}: A resposta do servidor não é um JSON válido.`;
    }
  };

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

  const companyModal = document.getElementById("companyModal");
  if (companyModal) {
    const openBtn = document.getElementById("openCompanyModal");
    const cancelBtn = document.getElementById("cancelCompanyModal");
    const form = document.getElementById("companyForm");
    const modalTitle = document.getElementById("companyModalTitle");
    const submitButton = document.getElementById("companySubmitButton");
    const sectorsSection = document.getElementById(
      "sectors-management-section"
    );
    const sectorList = document.getElementById("sector-list");
    const newSectorNameInput = document.getElementById("newSectorName");
    const addSectorBtn = document.getElementById("addSectorBtn");
    let currentCompanyId = null;

    const cnpjInput = document.getElementById("companyCnpj");
    if (cnpjInput) {
      IMask(cnpjInput, {
        mask: "00.000.000/0000-00",
      });
    }

    const renderSectors = (sectors) => {
      sectorList.innerHTML = "";
      if (sectors.length === 0) {
        sectorList.innerHTML =
          '<p class="empty-sector-list">Nenhum setor cadastrado.</p>';
        return;
      }
      sectors.forEach((sector) => {
        const sectorEl = document.createElement("div");
        sectorEl.className = "sector-item";
        sectorEl.innerHTML = `
                <span>${sector.name}</span>
                <button type="button" class="delete-sector-btn" data-id="${sector.id}">X</button>
            `;
        sectorList.appendChild(sectorEl);
      });
    };

    const fetchAndRenderSectors = async (companyId) => {
      try {
        const response = await fetch(`/api/companies/${companyId}/sectors`);
        const sectors = await response.json();
        renderSectors(sectors);
      } catch (error) {
        notyf.error("Erro ao carregar setores.");
      }
    };

    addSectorBtn.addEventListener("click", async () => {
      const name = newSectorNameInput.value.trim();
      if (!name) {
        notyf.error("O nome do setor não pode ser vazio.");
        return;
      }
      try {
        const res = await fetch("/api/sectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: currentCompanyId, name: name }),
        });
        if (!res.ok) throw new Error(await handleFetchError(res));
        newSectorNameInput.value = "";
        notyf.success("Setor adicionado!");
        fetchAndRenderSectors(currentCompanyId);
      } catch (error) {
        notyf.error(error.message || "Falha ao adicionar setor.");
      }
    });

    sectorList.addEventListener("click", async (e) => {
      if (e.target.classList.contains("delete-sector-btn")) {
        const sectorId = e.target.dataset.id;

        const confirmationModal = document.getElementById("confirmationModal");
        const confirmButton = document.getElementById("confirmDeletion");
        const cancelButton = document.getElementById("cancelConfirmation");

        confirmationModal.querySelector(
          ".confirmation-modal-body p"
        ).textContent = "Deseja realmente excluir este setor?";

        confirmationModal.style.display = "flex";

        const newConfirmButton = confirmButton.cloneNode(true);
        confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
        const newCancelButton = cancelButton.cloneNode(true);
        cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

        newConfirmButton.addEventListener("click", async () => {
          try {
            const res = await fetch(`/api/sectors/${sectorId}/delete`, {
              method: "POST",
            });
            if (!res.ok) throw new Error(await handleFetchError(res));
            notyf.success("Setor excluído.");
            confirmationModal.style.display = "none";
            fetchAndRenderSectors(currentCompanyId);
          } catch (error) {
            notyf.error(error.message || "Falha ao excluir setor.");
            confirmationModal.style.display = "none";
          }
        });

        newCancelButton.addEventListener("click", () => {
          confirmationModal.style.display = "none";
        });
      }
    });

    const openCreateModal = () => {
      form.reset();
      currentCompanyId = null;
      sectorsSection.style.display = "none";
      modalTitle.textContent = "Cadastrar Nova Empresa";
      submitButton.textContent = "Adicionar";
      form.action = "/companies";
      companyModal.style.display = "flex";
    };

    const openEditModal = async (companyId) => {
      try {
        const response = await fetch(`/api/companies/${companyId}`);
        if (!response.ok) throw new Error(await handleFetchError(response));
        const company = await response.json();

        form.reset();
        currentCompanyId = company.id;
        sectorsSection.style.display = "block";

        modalTitle.textContent = "Editar Empresa";
        submitButton.textContent = "Salvar Alterações";
        form.action = `/companies/${company.id}/edit`;

        document.getElementById("companyName").value = company.name;
        document.getElementById("companyCnpj").value = company.cnpj;
        document.getElementById("companyCity").value = company.city || "";
        document.getElementById("companyAddress").value = company.address || "";
        document.getElementById("companyState").value = company.state || "";

        await fetchAndRenderSectors(company.id);
        companyModal.style.display = "flex";
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar dados da empresa.");
      }
    };

    openBtn?.addEventListener("click", openCreateModal);

    cancelBtn?.addEventListener("click", () => {
      companyModal.style.display = "none";
    });

    document.querySelectorAll(".action-icon-editar").forEach((btn) => {
      if (document.body.id === "companies-page") {
        btn.addEventListener("click", (e) =>
          openEditModal(e.currentTarget.dataset.id)
        );
      }
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
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

  const deviceModal = document.getElementById("deviceModal");
  if (deviceModal) {
    const openDeviceModalBtn = document.getElementById("openDeviceModal");
    const cancelDeviceModalBtn = document.getElementById("cancelDeviceModal");
    const deviceForm = document.getElementById("deviceForm");
    const modalTitle = document.getElementById("deviceModalTitle");
    const submitButton = document.getElementById("deviceSubmitButton");
    const companySelect = document.getElementById("newDeviceCompany");
    const sectorSelect = document.getElementById("newDeviceSector");

    if (companySelect && companySelect.options.length <= 1) {
      companySelect.disabled = true;
      const defaultOption = companySelect.querySelector("option");
      if (defaultOption) {
        defaultOption.textContent = "Nenhuma empresa cadastrada";
      }
    }

    const populateSectors = async (companyId, selectedSectorId = null) => {
      sectorSelect.innerHTML =
        '<option value="" disabled selected>Carregando...</option>';
      sectorSelect.disabled = true;

      if (!companyId) {
        sectorSelect.innerHTML =
          '<option value="" disabled selected>Selecione uma empresa primeiro</option>';
        return;
      }

      try {
        const response = await fetch(`/api/companies/${companyId}/sectors`);
        if (!response.ok) throw new Error("Falha ao buscar setores");
        const sectors = await response.json();

        sectorSelect.innerHTML =
          '<option value="" disabled selected>Selecione um setor</option>';
        sectors.forEach((sector) => {
          const option = document.createElement("option");
          option.value = sector.id;
          option.textContent = sector.name;
          sectorSelect.appendChild(option);
        });

        if (selectedSectorId) {
          sectorSelect.value = selectedSectorId;
        }

        sectorSelect.disabled = false;
      } catch (error) {
        notyf.error("Não foi possível carregar os setores.");
        sectorSelect.innerHTML =
          '<option value="" disabled selected>Erro ao carregar</option>';
      }
    };

    companySelect?.addEventListener("change", () => {
      populateSectors(companySelect.value);
    });

    const openCreateDeviceModal = () => {
      deviceForm.reset();
      sectorSelect.innerHTML =
        '<option value="" disabled selected>Selecione uma empresa primeiro</option>';
      sectorSelect.disabled = true;
      modalTitle.textContent = "Cadastrar Novo Dispositivo";
      submitButton.textContent = "Adicionar";
      deviceForm.action = "/devices";
      deviceModal.style.display = "flex";
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
        companySelect.value = device.company_id;

        await populateSectors(device.company_id, device.sector_id);

        deviceModal.style.display = "flex";
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar dados do dispositivo.");
      }
    };

    openDeviceModalBtn?.addEventListener("click", openCreateDeviceModal);

    document.querySelectorAll(".action-icon-editar").forEach((btn) => {
      if (document.body.id === "devices-page") {
        btn.addEventListener("click", (e) =>
          openEditDeviceModal(e.currentTarget.dataset.id)
        );
      }
    });

    cancelDeviceModalBtn?.addEventListener("click", () => {
      deviceModal.style.display = "none";
    });

    deviceForm.addEventListener("submit", async function (e) {
      e.preventDefault();
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

  const campaignModal = document.getElementById("campaignModal");
  if (campaignModal) {
    let tomSelect;
    const openCampaignModalBtn = document.getElementById("openCampaignModal");
    const cancelCampaignModalBtn = document.getElementById(
      "cancelCampaignModal"
    );
    const campaignForm = campaignModal.querySelector(".modal-form");
    const modalTitle = campaignModal.querySelector(".modal-title");
    const filePreviewWrapper = document.getElementById("file-preview-wrapper");
    const campaignCompanySelect = document.getElementById("campaignCompany");
    const deviceSelectElement = document.getElementById("device_ids");
    const campaignFileInput = document.getElementById("file-upload");
    const fileUploadButton = document.querySelector(".file-upload-button");

    const startDatePicker = flatpickr("#start_date", {
      enableTime: true,
      dateFormat: "d/m/Y H:i",
      locale: "pt",
      time_24hr: true,
      defaultHour: 6,
      defaultMinute: 0,
    });
    const endDatePicker = flatpickr("#end_date", {
      enableTime: true,
      dateFormat: "d/m/Y H:i",
      locale: "pt",
      time_24hr: true,
      defaultHour: 23,
      defaultMinute: 59,
    });

    if (campaignCompanySelect && campaignCompanySelect.options.length <= 1) {
      campaignCompanySelect.disabled = true;
      const defaultOption = campaignCompanySelect.querySelector("option");
      if (defaultOption) {
        defaultOption.textContent = "Nenhuma empresa cadastrada";
      }
    }

    if (deviceSelectElement) {
      tomSelect = new TomSelect(deviceSelectElement, {
        plugins: ["remove_button"],
        create: false,
        placeholder: "Selecione uma empresa primeiro",
        valueField: "id",
        labelField: "name",
        searchField: "name",
      });
    }

    const populateDevicesForCampaign = async (companyId) => {
      tomSelect.clear();
      tomSelect.clearOptions();
      tomSelect.disable();
      tomSelect.settings.placeholder = "Carregando dispositivos...";
      tomSelect.sync();

      if (!companyId) {
        tomSelect.settings.placeholder = "Selecione uma empresa primeiro";
        tomSelect.sync();
        return;
      }

      try {
        const response = await fetch(`/api/companies/${companyId}/devices`);
        if (!response.ok) throw new Error("Falha ao buscar dispositivos");
        const devices = await response.json();

        tomSelect.settings.placeholder = "Selecione o(s) dispositivo(s)";
        tomSelect.addOptions(devices);
        tomSelect.enable();
        tomSelect.sync();
      } catch (error) {
        notyf.error("Não foi possível carregar os dispositivos.");
        tomSelect.settings.placeholder = "Erro ao carregar dispositivos";
        tomSelect.sync();
      }
    };

    campaignCompanySelect?.addEventListener("change", () => {
      populateDevicesForCampaign(campaignCompanySelect.value);
    });

    const displayFilePreview = (file) => {
      const fileName = file.name;
      const fileType = file.type.split("/")[0];
      const fileExtension = fileName.split(".").pop();

      let iconClass = "bi-file-earmark";
      if (fileType === "image") {
        iconClass = "bi-image";
      } else if (fileType === "video") {
        iconClass = "bi-film";
      }

      filePreviewWrapper.innerHTML = `
                <div class="file-preview">
                    <div class="file-preview-icon">
                        <i class="bi ${iconClass}"></i>
                    </div>
                    <div class="file-preview-details">
                        <div class="file-preview-name" title="${fileName}">${fileName}</div>
                        <div class="file-preview-extension">${fileExtension}</div>
                    </div>
                    <button type="button" class="file-preview-remove">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            `;
      fileUploadButton.style.display = "none";
    };

    campaignFileInput?.addEventListener("change", () => {
      const file = campaignFileInput.files[0];
      if (file) {
        displayFilePreview(file);
      } else {
        filePreviewWrapper.innerHTML = "";
        fileUploadButton.style.display = "inline-flex";
      }
    });

    filePreviewWrapper.addEventListener("click", (e) => {
      if (e.target.closest(".file-preview-remove")) {
        campaignFileInput.value = "";
        filePreviewWrapper.innerHTML = "";
        fileUploadButton.style.display = "inline-flex";
      }
    });

    const openCreateCampaignModal = () => {
      campaignForm.reset();
      filePreviewWrapper.innerHTML = "";
      fileUploadButton.style.display = "inline-flex";
      tomSelect.clear();
      tomSelect.clearOptions();
      tomSelect.disable();
      tomSelect.settings.placeholder = "Selecione uma empresa primeiro";
      tomSelect.sync();
      modalTitle.textContent = "Cadastrar Nova Campanha";
      campaignForm.action = "/campaigns";
      document.getElementById("campaignId").value = "";
      campaignModal.style.display = "flex";
    };

    const openEditCampaignModal = async (campaignId) => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}`);
        if (!response.ok) throw new Error(await handleFetchError(response));
        const campaign = await response.json();

        campaignForm.reset();
        filePreviewWrapper.innerHTML = "";
        fileUploadButton.style.display = "inline-flex";

        modalTitle.textContent = "Editar Campanha";
        campaignForm.action = `/campaigns/${campaign.id}/edit`;
        document.getElementById("campaignId").value = campaign.id;
        document.getElementById("campaignName").value = campaign.name;
        campaignCompanySelect.value = campaign.company_id;

        await populateDevicesForCampaign(campaign.company_id);
        tomSelect.setValue(campaign.device_ids);

        startDatePicker.setDate(campaign.start_date, true);
        endDatePicker.setDate(campaign.end_date, true);

        if (campaign.file_path) {
          const file = {
            name: campaign.file_path.split("/").pop(),
            type: campaign.mimetype,
          };
          displayFilePreview(file);
        }

        campaignModal.style.display = "flex";
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar dados da campanha.");
      }
    };

    document.querySelectorAll(".action-icon-editar").forEach((btn) => {
      if (document.body.id === "campaigns-page") {
        btn.addEventListener("click", (e) =>
          openEditCampaignModal(e.currentTarget.dataset.id)
        );
      }
    });

    openCampaignModalBtn?.addEventListener("click", openCreateCampaignModal);

    cancelCampaignModalBtn?.addEventListener("click", () => {
      campaignModal.style.display = "none";
    });

    campaignForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      try {
        const res = await fetch(this.action, {
          method: "POST",
          body: formData,
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

  const detailsModal = document.getElementById("deviceDetailsModal");
  if (detailsModal) {
    const populateDetailsModal = (device) => {
      const deviceIcons = {
        midia_indoor: "bi-tv",
        terminal_consulta: "bi-upc-scan",
        default: "bi-question-circle",
      };

      document.getElementById("modalDeviceName").textContent = device.name;
      document.getElementById("modalDeviceCompany").textContent =
        device.company_name || "N/A";
      document.getElementById("modalDeviceSector").textContent =
        device.sector_name || "N/A";
      document.getElementById("modalDeviceType").textContent =
        deviceTypeNames[device.device_type] || deviceTypeNames.default;
      document.getElementById("modalLastSeen").textContent =
        device.last_seen_formatted;
      document.getElementById("modalRegisteredAt").textContent =
        device.registered_at_formatted;

      const iconClass = deviceIcons[device.device_type] || deviceIcons.default;
      document.getElementById(
        "modalDeviceIcon"
      ).innerHTML = `<i class="bi ${iconClass}"></i>`;

      const campaignsSpan = document.getElementById("modalActiveCampaigns");
      if (device.active_campaigns && device.active_campaigns.length > 0) {
        campaignsSpan.textContent = device.active_campaigns.join(", ");
      } else {
        campaignsSpan.textContent = "Nenhuma campanha ativa no momento.";
      }

      const identifierEl = document.getElementById("modalDeviceIdentifier");
      identifierEl.textContent =
        device.device_identifier.substring(0, 16) + "...";
      identifierEl.dataset.fullValue = device.device_identifier;

      const authKeyEl = document.getElementById("modalAuthKey");
      authKeyEl.textContent =
        device.authentication_key.substring(0, 16) + "...";
      authKeyEl.dataset.fullValue = device.authentication_key;

      const revokeBtn = document.getElementById("modalRevokeButton");
      const reactivateBtn = document.getElementById("modalReactivateButton");
      const magicLinkBtn = document.getElementById(
        "modalGenerateMagicLinkButton"
      );

      revokeBtn.dataset.identifier = device.device_identifier;
      reactivateBtn.dataset.identifier = device.device_identifier;
      magicLinkBtn.dataset.id = device.id;

      if (device.is_active) {
        revokeBtn.style.display = "inline-flex";
        reactivateBtn.style.display = "none";
        magicLinkBtn.style.display =
          device.status.text === "Inativo" ? "inline-flex" : "none";
      } else {
        revokeBtn.style.display = "none";
        reactivateBtn.style.display = "inline-flex";
        magicLinkBtn.style.display = "none";
      }
    };

    document.querySelectorAll(".open-details-modal").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const deviceId = btn.dataset.deviceId;
        detailsModal.style.display = "flex";
        detailsModal.querySelector(".details-modal-content").style.display =
          "none";
        detailsModal.querySelector(".details-modal-loader").style.display =
          "flex";
        try {
          const res = await fetch(`/api/deviceDetails/${deviceId}`);
          if (!res.ok)
            throw new Error("Falha ao carregar dados do dispositivo.");
          const data = await res.json();
          populateDetailsModal(data);
          detailsModal.querySelector(".details-modal-loader").style.display =
            "none";
          detailsModal.querySelector(".details-modal-content").style.display =
            "block";
        } catch (err) {
          notyf.error(err.message);
          detailsModal.style.display = "none";
        }
      });
    });

    document
      .getElementById("closeDetailsModal")
      ?.addEventListener("click", () => {
        detailsModal.style.display = "none";
      });

    detailsModal.addEventListener("click", function (e) {
      const copyElement = e.target.closest(".copyable-code");
      if (copyElement && copyElement.dataset.fullValue) {
        navigator.clipboard
          .writeText(copyElement.dataset.fullValue)
          .then(() => notyf.success("Copiado para a área de transferência!"))
          .catch(() => notyf.error("Falha ao copiar."));
      }
    });

    document
      .getElementById("modalRevokeButton")
      ?.addEventListener("click", async function () {
        const identifier = this.dataset.identifier;
        try {
          const res = await fetch(`/devices/${identifier}/revoke`, {
            method: "POST",
          });
          if (!res.ok) throw new Error(await handleFetchError(res));
          notyf.success("Dispositivo revogado com sucesso.");
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          notyf.error(err.message || "Falha na comunicação com o servidor.");
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
          if (!res.ok) throw new Error(await handleFetchError(res));
          const json = await res.json();
          notyf.success(json.message);
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          notyf.error(err.message || "Falha na comunicação com o servidor.");
        }
      });

    document
      .getElementById("modalGenerateMagicLinkButton")
      ?.addEventListener("click", async function (e) {
        e.stopPropagation();
        const deviceId = this.dataset.id;
        try {
          const res = await fetch(`/devices/${deviceId}/magicLink`, {
            method: "POST",
          });
          if (!res.ok)
            throw new Error(
              (await res.json().message) || "Falha ao gerar link."
            );
          const json = await res.json();
          await navigator.clipboard.writeText(json.magicLink);
          notyf.success("Link mágico copiado para a área de transferência!");
        } catch (err) {
          notyf.error(err.message || "Não foi possível copiar o link.");
        }
      });
  }

  const confirmationModal = document.getElementById("confirmationModal");
  if (confirmationModal) {
    document
      .querySelectorAll(".action-icon-delete, .action-icon-excluir")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = e.currentTarget.dataset.id;
          let url = "";
          let message = "";

          if (document.body.id === "campaigns-page") {
            url = `/campaigns/${id}/delete`;
            message = "Deseja realmente excluir esta campanha?";
          } else if (document.body.id === "devices-page") {
            url = `/devices/${id}/delete`;
            message = "Deseja realmente excluir este dispositivo?";
          } else if (document.body.id === "companies-page") {
            url = `/companies/${id}/delete`;
            message =
              "Deseja realmente excluir esta empresa? Todos os dispositivos e campanhas associados também serão removidos.";
          } else {
            return;
          }

          confirmationModal.style.display = "flex";
          confirmationModal.querySelector(
            ".confirmation-modal-body p"
          ).textContent = message;

          const confirmBtn = document.getElementById("confirmDeletion");
          const newConfirmBtn = confirmBtn.cloneNode(true);
          confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

          newConfirmBtn.addEventListener("click", async () => {
            try {
              const res = await fetch(url, { method: "POST" });
              const json = await res.json();
              if (!res.ok)
                return notyf.error(json.message || `Erro ${res.status}`);

              confirmationModal.style.display = "none";
              notyf.success(json.message);
              setTimeout(() => location.reload(), 1200);
            } catch (err) {
              notyf.error("Falha na comunicação com o servidor.");
            }
          });
        });
      });

    document
      .getElementById("cancelConfirmation")
      ?.addEventListener("click", () => {
        confirmationModal.style.display = "none";
      });
  }

  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.style.display = "none";
    }
  });

  document.querySelectorAll(".device-table tbody tr").forEach((row) => {
    if (row.id && row.id.includes("no-")) return;
    row.addEventListener("click", function (event) {
      if (event.target.closest(".actions-cell")) {
        return;
      }
      const detailsButton = this.querySelector(".open-details-modal");
      if (detailsButton) {
        detailsButton.click();
      }
    });
  });

  const connectAdminWs = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "DEVICE_STATUS_UPDATE") {
          const { deviceId, status } = data.payload;
          const statusCell = document.querySelector(
            `tr[data-device-id="${deviceId}"] [data-status-cell]`
          );
          if (statusCell) {
            const statusSpan = statusCell.querySelector("span");
            const statusText = statusCell.querySelector("[data-status-text]");
            if (statusSpan && statusText) {
              statusSpan.className = `online-status ${status.class}`;
              statusText.textContent = status.text;
            }
          }
        } else if (data.type === "CAMPAIGN_STATUS_UPDATE") {
          const { campaignId, status } = data.payload;
          const campaignRow = document.querySelector(
            `tr[data-campaign-id="${campaignId}"]`
          );
          if (campaignRow) {
            const statusCell = campaignRow.querySelector("[data-status-cell]");
            const statusSpan = campaignRow.querySelector("span");
            const statusText = statusCell.querySelector("[data-status-text]");
            if (statusSpan && statusText) {
              statusSpan.className = `online-status ${status.class}`;
              statusText.textContent = status.text;
            }
          }
        }
      } catch (e) {
        console.error("Erro ao processar mensagem WebSocket do admin:", e);
      }
    };

    ws.onclose = () => {
      setTimeout(connectAdminWs, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  if (document.body.id.endsWith("-page")) {
    connectAdminWs();
  }
});
