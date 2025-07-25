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

  const setupLoginForm = () => {
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
  };

  const setupCompanyModal = () => {
    const companyModal = document.getElementById("companyModal");
    if (!companyModal) return;

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
    let stagedSectors = [];

    if (document.getElementById("companyCnpj")) {
      IMask(document.getElementById("companyCnpj"), {
        mask: "00.000.000/0000-00",
      });
    }

    const renderExistingSectors = (sectors) => {
      sectorList.innerHTML =
        sectors.length === 0
          ? '<p class="empty-sector-list">Nenhum setor cadastrado.</p>'
          : sectors
              .map(
                (sector) => `
                <div class="sector-item">
                  <span>${sector.name}</span>
                  <button type="button" class="delete-sector-btn" data-id="${sector.id}">X</button>
                </div>
              `
              )
              .join("");
    };

    const renderStagedSectors = () => {
      sectorList.innerHTML =
        stagedSectors.length === 0
          ? '<p class="empty-sector-list">Nenhum setor adicionado.</p>'
          : stagedSectors
              .map(
                (name, index) => `
                <div class="sector-item">
                  <span>${name}</span>
                  <button type="button" class="delete-sector-btn" data-index="${index}">X</button>
                </div>`
              )
              .join("");
    };

    const fetchAndRenderSectors = async (companyId) => {
      try {
        const response = await fetch(`/api/companies/${companyId}/sectors`);
        const sectors = await response.json();
        renderExistingSectors(sectors);
      } catch (error) {
        notyf.error("Erro ao carregar setores.");
      }
    };

    addSectorBtn.addEventListener("click", async () => {
      const name = newSectorNameInput.value.trim();
      if (!name) return notyf.error("O nome do setor é obrigatório.");

      if (currentCompanyId) {
        try {
          const res = await fetch("/api/sectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_id: currentCompanyId, name }),
          });
          if (!res.ok) throw new Error(await handleFetchError(res));
          newSectorNameInput.value = "";
          notyf.success("Setor adicionado.");
          fetchAndRenderSectors(currentCompanyId);
        } catch (error) {
          notyf.error(error.message || "Falha ao adicionar setor.");
        }
      } else {
        if (stagedSectors.includes(name)) {
          return notyf.error("Este setor já foi adicionado.");
        }
        stagedSectors.push(name);
        newSectorNameInput.value = "";
        renderStagedSectors();
      }
    });

    sectorList.addEventListener("click", (e) => {
      const deleteButton = e.target.closest(".delete-sector-btn");
      if (!deleteButton) return;

      const sectorId = deleteButton.dataset.id;
      const stagedIndex = deleteButton.dataset.index;

      if (sectorId) {
        const confirmationModal = document.getElementById("confirmationModal");
        const confirmButton = document.getElementById("confirmDeletion");
        const newConfirmButton = confirmButton.cloneNode(true);
        confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);

        confirmationModal.querySelector(
          ".confirmation-modal-body p"
        ).textContent = "Deseja realmente excluir este setor?";
        confirmationModal.style.display = "flex";

        const handleConfirm = async () => {
          try {
            const res = await fetch(`/api/sectors/${sectorId}/delete`, {
              method: "POST",
            });
            if (!res.ok) throw new Error(await handleFetchError(res));
            notyf.success("Setor excluído.");
            fetchAndRenderSectors(currentCompanyId);
          } catch (error) {
            notyf.error(error.message || "Falha ao excluir setor.");
          } finally {
            confirmationModal.style.display = "none";
          }
        };
        newConfirmButton.addEventListener("click", handleConfirm, {
          once: true,
        });
      } else if (stagedIndex !== undefined) {
        stagedSectors.splice(parseInt(stagedIndex, 10), 1);
        renderStagedSectors();
      }
    });

    const openCreateModal = () => {
      form.reset();
      currentCompanyId = null;
      stagedSectors = [];
      sectorsSection.style.display = "block";
      renderStagedSectors();
      modalTitle.textContent = "Cadastrar Empresa";
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
        stagedSectors = [];
        sectorsSection.style.display = "block";
        modalTitle.textContent = "Editar Empresa";
        submitButton.textContent = "Salvar";
        form.action = `/companies/${company.id}/edit`;
        form.name.value = company.name;
        form.cnpj.value = company.cnpj;
        form.city.value = company.city || "";
        form.address.value = company.address || "";
        form.state.value = company.state || "";
        await fetchAndRenderSectors(company.id);
        companyModal.style.display = "flex";
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar empresa.");
      }
    };

    openBtn?.addEventListener("click", openCreateModal);
    cancelBtn?.addEventListener(
      "click",
      () => (companyModal.style.display = "none")
    );
    document.querySelectorAll(".action-icon-editar").forEach((btn) => {
      if (document.body.id === "companies-page") {
        btn.addEventListener("click", (e) =>
          openEditModal(e.currentTarget.dataset.id)
        );
      }
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(this));
      if (!currentCompanyId) {
        body.sectors = stagedSectors;
      }

      try {
        const res = await fetch(this.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);
        notyf.success(json.message);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error("Falha na comunicação com o servidor.");
      }
    });
  };

  const setupDeviceModal = () => {
    const deviceModal = document.getElementById("deviceModal");
    if (!deviceModal) return;

    const openBtn = document.getElementById("openDeviceModal");
    const cancelBtn = document.getElementById("cancelDeviceModal");
    const form = document.getElementById("deviceForm");
    const modalTitle = document.getElementById("deviceModalTitle");
    const submitButton = document.getElementById("deviceSubmitButton");
    const companySelect = document.getElementById("newDeviceCompany");
    const sectorSelect = document.getElementById("newDeviceSector");

    if (companySelect && companySelect.options.length <= 1) {
      companySelect.disabled = true;
      companySelect.querySelector("option").textContent =
        "Nenhuma empresa cadastrada";
    }

    const populateSectors = async (companyId, selectedSectorId = null) => {
      sectorSelect.innerHTML =
        '<option value="" disabled selected>Carregando...</option>';
      sectorSelect.disabled = true;
      if (!companyId) {
        sectorSelect.innerHTML =
          '<option value="" disabled selected>Selecione uma empresa</option>';
        return;
      }
      try {
        const response = await fetch(`/api/companies/${companyId}/sectors`);
        if (!response.ok) throw new Error("Falha ao buscar setores");
        const sectors = await response.json();
        sectorSelect.innerHTML =
          '<option value="" disabled selected>Selecione um setor</option>';
        sectors.forEach((sector) =>
          sectorSelect.add(new Option(sector.name, sector.id))
        );
        if (selectedSectorId) sectorSelect.value = selectedSectorId;
        sectorSelect.disabled = false;
      } catch (error) {
        notyf.error("Não foi possível carregar setores.");
        sectorSelect.innerHTML =
          '<option value="" disabled selected>Erro ao carregar</option>';
      }
    };

    companySelect?.addEventListener("change", () =>
      populateSectors(companySelect.value)
    );

    const openCreateModal = () => {
      form.reset();
      sectorSelect.innerHTML =
        '<option value="" disabled selected>Selecione uma empresa</option>';
      sectorSelect.disabled = true;
      modalTitle.textContent = "Cadastrar Dispositivo";
      submitButton.textContent = "Adicionar";
      form.action = "/devices";
      deviceModal.style.display = "flex";
    };

    const openEditModal = async (deviceId) => {
      try {
        const response = await fetch(`/api/deviceDetails/${deviceId}`);
        if (!response.ok) throw new Error(await handleFetchError(response));
        const device = await response.json();
        form.reset();
        modalTitle.textContent = "Editar Dispositivo";
        submitButton.textContent = "Salvar";
        form.action = `/devices/${device.id}/edit`;
        form.name.value = device.name;
        form.device_type.value = device.device_type;
        form.company_id.value = device.company_id;
        await populateSectors(device.company_id, device.sector_id);
        deviceModal.style.display = "flex";
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar dispositivo.");
      }
    };

    openBtn?.addEventListener("click", openCreateModal);
    cancelBtn?.addEventListener(
      "click",
      () => (deviceModal.style.display = "none")
    );
    document.querySelectorAll(".action-icon-editar").forEach((btn) => {
      if (document.body.id === "devices-page") {
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
  };

  const setupCampaignModal = () => {
    const campaignModal = document.getElementById("campaignModal");
    if (!campaignModal) return;

    let tomSelectDevices, tomSelectSectors;
    let stagedFiles = [];
    let sortableInstance = null;
    let mediaHasBeenTouched = false;

    const elements = {
      openBtn: document.getElementById("openCampaignModal"),
      cancelBtn: document.getElementById("cancelCampaignModal"),
      form: campaignModal.querySelector(".modal-form"),
      modalTitle: campaignModal.querySelector(".modal-title"),
      filePreviewWrapper: document.getElementById("file-preview-wrapper"),
      companySelect: document.getElementById("campaignCompany"),
      deviceSelect: document.getElementById("device_ids"),
      sectorSelect: document.getElementById("sector_ids"),
      fileInput: document.getElementById("file-upload"),
      idInput: document.getElementById("campaignId"),
      nameInput: document.getElementById("campaignName"),
      startDateInput: document.getElementById("start_date"),
      endDateInput: document.getElementById("end_date"),
      segmentationRadios: document.querySelectorAll(
        'input[name="segmentation_type"]'
      ),
      sectorsContainer: document.getElementById("sectors-selection-container"),
      devicesContainer: document.getElementById("devices-selection-container"),
    };

    const fpStart = flatpickr(elements.startDateInput, {
      enableTime: true,
      dateFormat: "d/m/Y H:i",
      locale: "pt",
      time_24hr: true,
      defaultHour: 6,
      defaultMinute: 0,
    });
    const fpEnd = flatpickr(elements.endDateInput, {
      enableTime: true,
      dateFormat: "d/m/Y H:i",
      locale: "pt",
      time_24hr: true,
      defaultHour: 23,
      defaultMinute: 59,
    });

    if (elements.companySelect && elements.companySelect.options.length <= 1) {
      elements.companySelect.disabled = true;
      elements.companySelect.querySelector("option").textContent =
        "Nenhuma empresa cadastrada";
    }

    if (elements.deviceSelect) {
      tomSelectDevices = new TomSelect(elements.deviceSelect, {
        plugins: ["remove_button"],
        create: false,
        placeholder: "Selecione uma empresa primeiro",
        valueField: "id",
        labelField: "name",
        searchField: "name",
      });
    }

    if (elements.sectorSelect) {
      tomSelectSectors = new TomSelect(elements.sectorSelect, {
        plugins: ["remove_button"],
        create: false,
        placeholder: "Selecione uma empresa primeiro",
        valueField: "id",
        labelField: "name",
        searchField: "name",
      });
    }

    const generateVideoThumbnail = (file) => {
      return new Promise((resolve) => {
        const video = document.createElement("video");
        video.setAttribute("crossorigin", "anonymous");
        video.preload = "metadata";
        const source =
          file instanceof File ? URL.createObjectURL(file) : file.file_path;
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          window.setTimeout(() => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            if (!canvas.width || !canvas.height) {
              resolve(null);
              return;
            }
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg");
            if (file instanceof File) {
              URL.revokeObjectURL(source);
            }
            resolve(dataUrl);
          }, 100);
        };
        const onLoadedData = () => {
          video.removeEventListener("loadeddata", onLoadedData);
          video.currentTime = 1;
        };
        video.addEventListener("loadeddata", onLoadedData);
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", () => {
          if (file instanceof File) {
            URL.revokeObjectURL(source);
          }
          resolve(null);
        });
        video.src = source;
      });
    };

    const populateCampaignSelectors = async (companyId) => {
      tomSelectDevices.clear();
      tomSelectDevices.clearOptions();
      tomSelectDevices.disable();
      tomSelectSectors.clear();
      tomSelectSectors.clearOptions();
      tomSelectSectors.disable();

      if (!companyId) {
        tomSelectDevices.settings.placeholder = "Selecione uma empresa";
        tomSelectSectors.settings.placeholder = "Selecione uma empresa";
        tomSelectDevices.sync();
        tomSelectSectors.sync();
        return;
      }

      tomSelectDevices.settings.placeholder = "Carregando...";
      tomSelectSectors.settings.placeholder = "Carregando...";
      tomSelectDevices.sync();
      tomSelectSectors.sync();

      try {
        const [devicesRes, sectorsRes] = await Promise.all([
          fetch(`/api/companies/${companyId}/devices`),
          fetch(`/api/companies/${companyId}/sectors`),
        ]);

        if (!devicesRes.ok || !sectorsRes.ok)
          throw new Error("Falha ao buscar dados da empresa");

        const devices = await devicesRes.json();
        const sectors = await sectorsRes.json();

        tomSelectDevices.settings.placeholder =
          devices.length > 0
            ? "Selecione para adicionar"
            : "Nenhum dispositivo encontrado";
        tomSelectDevices.addOptions(devices);
        tomSelectDevices.enable();

        tomSelectSectors.settings.placeholder =
          sectors.length > 0
            ? "Selecione para adicionar"
            : "Nenhum setor encontrado";
        tomSelectSectors.addOptions(sectors);
        tomSelectSectors.enable();
      } catch (error) {
        notyf.error("Não foi possível carregar dispositivos e setores.");
        tomSelectDevices.settings.placeholder = "Erro ao carregar";
        tomSelectSectors.settings.placeholder = "Erro ao carregar";
      } finally {
        tomSelectDevices.sync();
        tomSelectSectors.sync();
      }
    };

    const handleSegmentationChange = () => {
      const selectedValue = document.querySelector(
        'input[name="segmentation_type"]:checked'
      ).value;
      if (selectedValue === "sectors") {
        elements.sectorsContainer.classList.remove("hidden");
        elements.devicesContainer.classList.add("hidden");
        tomSelectDevices.clear();
      } else if (selectedValue === "devices") {
        elements.sectorsContainer.classList.add("hidden");
        elements.devicesContainer.classList.remove("hidden");
        tomSelectSectors.clear();
      } else {
        elements.sectorsContainer.classList.add("hidden");
        elements.devicesContainer.classList.add("hidden");
        tomSelectDevices.clear();
        tomSelectSectors.clear();
      }
    };

    elements.segmentationRadios.forEach((radio) => {
      radio.addEventListener("change", handleSegmentationChange);
    });

    elements.companySelect?.addEventListener("change", () =>
      populateCampaignSelectors(elements.companySelect.value)
    );

    const renderStagedFiles = () => {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
      elements.filePreviewWrapper.innerHTML = "";

      const list = document.createElement("ul");
      list.className = "file-preview-list";

      stagedFiles.forEach((file, index) => {
        const fileName = file.name || file.file_name;
        const fileType = file.type || file.file_type || "";
        const isImage = fileType.startsWith("image/");
        const isVideo = fileType.startsWith("video/");
        let thumbnailHtml = `<i class="bi bi-file-earmark"></i>`;

        const item = document.createElement("li");
        item.className = "file-preview-item";
        item.dataset.id = file.id || `new-${index}`;

        const durationInputHtml = isImage
          ? `<div class="media-duration-group">
                      <input type="number" class="media-duration-input" data-index="${index}" value="${
              file.duration || 10
            }" min="1">
                      <label>Segundos</label>
                    </div>`
          : "";

        item.innerHTML = `
          <div class="media-thumbnail">${thumbnailHtml}</div>
          <div class="media-details">
            <span class="file-preview-name" title="${fileName}">${fileName}</span>
            ${durationInputHtml}
          </div>
          <button type="button" class="remove-file-btn" data-index="${index}">&times;</button>`;

        list.appendChild(item);

        const thumbnailContainer = item.querySelector(".media-thumbnail");

        if (isImage) {
          const src =
            file instanceof File ? URL.createObjectURL(file) : file.file_path;
          thumbnailContainer.innerHTML = `<img src="${src}" alt="preview">`;
        } else if (isVideo) {
          thumbnailContainer.innerHTML = `<i class="bi bi-film"></i>`;

          generateVideoThumbnail(file)
            .then((thumbnailSrc) => {
              if (thumbnailSrc) {
                thumbnailContainer.innerHTML = `<img src="${thumbnailSrc}" alt="video preview">`;
              }
            })
            .catch((err) => {
              console.error("Falha ao gerar thumbnail do vídeo:", err);
            });
        }
      });

      if (stagedFiles.length < 5) {
        const addItem = document.createElement("li");
        addItem.className = "add-media-card";
        addItem.innerHTML = `
          <label for="file-upload" class="add-media-label">
            <i class="bi bi-plus-lg"></i>
            <span>Adicionar Mídia</span>
          </label>
        `;
        list.appendChild(addItem);
      }

      elements.filePreviewWrapper.appendChild(list);

      sortableInstance = new Sortable(list, {
        animation: 150,
        filter: ".add-media-card",
        onEnd: (evt) => {
          mediaHasBeenTouched = true;
          const [movedItem] = stagedFiles.splice(evt.oldIndex, 1);
          stagedFiles.splice(evt.newIndex, 0, movedItem);
          renderStagedFiles();
        },
      });
    };

    const resetModal = () => {
      elements.form.reset();
      stagedFiles = [];
      mediaHasBeenTouched = false;
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
      elements.filePreviewWrapper.innerHTML = "";
      tomSelectDevices.clear();
      tomSelectDevices.clearOptions();
      tomSelectDevices.disable();
      tomSelectDevices.settings.placeholder = "Selecione uma empresa";
      tomSelectDevices.sync();
      tomSelectSectors.clear();
      tomSelectSectors.clearOptions();
      tomSelectSectors.disable();
      tomSelectSectors.settings.placeholder = "Selecione uma empresa";
      tomSelectSectors.sync();
      fpStart.clear();
      fpEnd.clear();
      document.getElementById("seg-all").checked = true;
      handleSegmentationChange();
    };

    const openCreateCampaignModal = () => {
      resetModal();
      renderStagedFiles();
      elements.modalTitle.textContent = "Cadastrar Campanha";
      elements.form.action = "/campaigns";
      elements.idInput.value = "";
      campaignModal.style.display = "flex";
    };

    const openEditCampaignModal = async (campaignId) => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}`);
        if (!response.ok) throw new Error(await handleFetchError(response));
        const campaign = await response.json();

        resetModal();

        elements.modalTitle.textContent = "Editar Campanha";
        elements.form.action = `/campaigns/${campaign.id}/edit`;
        elements.idInput.value = campaign.id;
        elements.nameInput.value = campaign.name;
        elements.companySelect.value = campaign.company_id;

        fpStart.setDate(campaign.start_date, true);
        fpEnd.setDate(campaign.end_date, true);

        stagedFiles = (campaign.uploads || []).map((file) => ({
          ...file,
          name: file.file_name,
          type: file.file_type,
        }));
        renderStagedFiles();

        await populateCampaignSelectors(campaign.company_id);

        const deviceIds = (campaign.devices || []).map((d) => d.id);
        const sectorIds = campaign.sector_ids || [];

        if (sectorIds.length > 0) {
          document.getElementById("seg-sectors").checked = true;
          tomSelectSectors.setValue(sectorIds);
        } else if (deviceIds.length > 0) {
          document.getElementById("seg-devices").checked = true;
          tomSelectDevices.setValue(deviceIds);
        } else {
          document.getElementById("seg-all").checked = true;
        }
        handleSegmentationChange();

        campaignModal.style.display = "flex";
      } catch (error) {
        notyf.error(error.message || "Erro ao carregar campanha.");
      }
    };

    elements.fileInput?.addEventListener("change", (e) => {
      mediaHasBeenTouched = true;
      const newFiles = Array.from(e.target.files).map((f) =>
        Object.assign(f, { duration: 10 })
      );
      const combinedFiles = [...stagedFiles, ...newFiles];

      if (combinedFiles.length > 5) {
        notyf.error("É permitido no máximo 5 arquivos.");
        stagedFiles = combinedFiles.slice(0, 5);
      } else {
        stagedFiles = combinedFiles;
      }

      renderStagedFiles();
      elements.fileInput.value = "";
    });

    elements.filePreviewWrapper.addEventListener("input", (e) => {
      if (e.target.classList.contains("media-duration-input")) {
        mediaHasBeenTouched = true;
        const index = parseInt(e.target.dataset.index, 10);
        if (stagedFiles[index]) {
          stagedFiles[index].duration = parseInt(e.target.value, 10) || 10;
        }
      }
    });

    elements.filePreviewWrapper.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-file-btn")) {
        mediaHasBeenTouched = true;
        stagedFiles.splice(parseInt(e.target.dataset.index, 10), 1);
        renderStagedFiles();
      }
    });

    const updateCampaignRow = (campaign) => {
      const row = document.querySelector(
        `tr[data-campaign-id="${campaign.id}"]`
      );
      if (!row) return;

      row.querySelector(".col-name").textContent = campaign.name;
      row.querySelector(".col-company").textContent = campaign.company_name;
      row.querySelector(".col-type").textContent = campaign.campaign_type;
      row.querySelector(".col-period").textContent = campaign.periodo_formatado;

      const statusCell = row.querySelector("[data-status-cell]");
      if (statusCell && campaign.status) {
        const statusSpan = statusCell.querySelector(".online-status");
        const statusText = statusCell.querySelector("[data-status-text]");
        if (statusSpan && statusText) {
          statusSpan.className = `online-status ${campaign.status.class}`;
          statusText.textContent = campaign.status.text;
        }
      }

      const deviceCell = row.querySelector(".col-devices");
      let deviceText = "Todos";
      if (campaign.target_names && campaign.target_names.length > 0) {
        deviceText = campaign.target_names.slice(0, 2).join(", ");
        if (campaign.target_names.length > 2) {
          deviceText += ` <span class="device-badge-extra">+${
            campaign.target_names.length - 2
          }</span>`;
        }
      }
      deviceCell.innerHTML = deviceText;
    };

    document.querySelectorAll(".action-icon-editar").forEach((btn) => {
      if (document.body.id === "campaigns-page") {
        btn.addEventListener("click", (e) =>
          openEditCampaignModal(e.currentTarget.dataset.id)
        );
      }
    });

    elements.openBtn?.addEventListener("click", openCreateCampaignModal);
    elements.cancelBtn?.addEventListener(
      "click",
      () => (campaignModal.style.display = "none")
    );

    elements.form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const formData = new FormData();
      const campaignId = elements.idInput.value;

      formData.append("name", elements.nameInput.value);
      formData.append("company_id", elements.companySelect.value);
      formData.append("start_date", elements.startDateInput.value);
      formData.append("end_date", elements.endDateInput.value);

      const segmentationType = document.querySelector(
        'input[name="segmentation_type"]:checked'
      ).value;

      if (segmentationType === "sectors") {
        const selectedSectors = tomSelectSectors.getValue();
        if (Array.isArray(selectedSectors)) {
          selectedSectors.forEach((id) => formData.append("sector_ids", id));
        }
      } else if (segmentationType === "devices") {
        const selectedDevices = tomSelectDevices.getValue();
        if (Array.isArray(selectedDevices)) {
          selectedDevices.forEach((id) => formData.append("device_ids", id));
        }
      }

      if (mediaHasBeenTouched) {
        formData.append("media_touched", "true");
        const mediaMetadata = stagedFiles.map((file, index) => ({
          id: file instanceof File ? null : file.id,
          name: file.name,
          order: index,
          duration: file.duration || 10,
        }));
        formData.append("media_metadata", JSON.stringify(mediaMetadata));
        stagedFiles
          .filter((file) => file instanceof File)
          .forEach((file) => formData.append("media", file));
      }

      try {
        const res = await fetch(this.action, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) return notyf.error(json.message || `Erro ${res.status}`);

        notyf.success(json.message);
        campaignModal.style.display = "none";

        if (campaignId && json.campaign) {
          updateCampaignRow(json.campaign);
        } else {
          setTimeout(() => location.reload(), 1200);
        }
      } catch (err) {
        notyf.error("Falha na comunicação com o servidor.");
      }
    });
  };

  const setupDetailsModal = () => {
    const detailsModal = document.getElementById("deviceDetailsModal");
    if (!detailsModal) return;

    const populateDetailsModal = (device) => {
      const getEl = (id) => document.getElementById(id);
      const deviceIcons = {
        midia_indoor: "bi-tv",
        terminal_consulta: "bi-upc-scan",
        default: "bi-question-circle",
      };

      getEl("modalDeviceName").textContent = device.name;
      getEl("modalDeviceCompany").textContent = device.company_name || "N/A";
      getEl("modalDeviceSector").textContent = device.sector_name || "N/A";
      getEl("modalDeviceType").textContent =
        deviceTypeNames[device.device_type] || deviceTypeNames.default;
      getEl("modalLastSeen").textContent = device.last_seen_formatted;
      getEl("modalRegisteredAt").textContent = device.registered_at_formatted;
      getEl("modalDeviceIcon").innerHTML = `<i class="bi ${
        deviceIcons[device.device_type] || deviceIcons.default
      }"></i>`;
      getEl("modalActiveCampaigns").textContent =
        device.active_campaigns?.length > 0
          ? device.active_campaigns.join(", ")
          : "Nenhuma campanha ativa.";

      const identifierEl = getEl("modalDeviceIdentifier");
      identifierEl.textContent = `${device.device_identifier.substring(
        0,
        16
      )}...`;
      identifierEl.dataset.fullValue = device.device_identifier;

      const authKeyEl = getEl("modalAuthKey");
      authKeyEl.textContent = `${device.authentication_key.substring(
        0,
        16
      )}...`;
      authKeyEl.dataset.fullValue = device.authentication_key;

      const revokeBtn = getEl("modalRevokeButton");
      const reactivateBtn = getEl("modalReactivateButton");
      const magicLinkBtn = getEl("modalGenerateMagicLinkButton");

      revokeBtn.dataset.identifier = device.device_identifier;
      reactivateBtn.dataset.identifier = device.device_identifier;
      magicLinkBtn.dataset.id = device.id;

      revokeBtn.style.display = device.is_active ? "inline-flex" : "none";
      reactivateBtn.style.display = device.is_active ? "none" : "inline-flex";
      magicLinkBtn.style.display =
        device.is_active && device.status.text === "Inativo"
          ? "inline-flex"
          : "none";
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
          populateDetailsModal(await res.json());
        } catch (err) {
          notyf.error(err.message);
          detailsModal.style.display = "none";
        } finally {
          detailsModal.querySelector(".details-modal-loader").style.display =
            "none";
          detailsModal.querySelector(".details-modal-content").style.display =
            "block";
        }
      });
    });

    document
      .getElementById("closeDetailsModal")
      ?.addEventListener("click", () => (detailsModal.style.display = "none"));

    detailsModal.addEventListener("click", (e) => {
      const copyElement = e.target.closest(".copyable-code");
      if (copyElement?.dataset.fullValue) {
        navigator.clipboard
          .writeText(copyElement.dataset.fullValue)
          .then(() => notyf.success("Copiado!"))
          .catch(() => notyf.error("Falha ao copiar."));
      }
    });

    const handleDeviceAction = async (url, successMessage) => {
      try {
        const res = await fetch(url, { method: "POST" });
        if (!res.ok) throw new Error(await handleFetchError(res));
        notyf.success(successMessage);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        notyf.error(err.message || "Falha na comunicação.");
      }
    };

    document
      .getElementById("modalRevokeButton")
      ?.addEventListener("click", function () {
        handleDeviceAction(
          `/devices/${this.dataset.identifier}/revoke`,
          "Dispositivo revogado."
        );
      });
    document
      .getElementById("modalReactivateButton")
      ?.addEventListener("click", function () {
        handleDeviceAction(
          `/devices/${this.dataset.identifier}/reactivate`,
          "Dispositivo reativado."
        );
      });
    document
      .getElementById("modalGenerateMagicLinkButton")
      ?.addEventListener("click", async function (e) {
        e.stopPropagation();
        try {
          const res = await fetch(`/devices/${this.dataset.id}/magicLink`, {
            method: "POST",
          });
          if (!res.ok)
            throw new Error(
              (await res.json()).message || "Falha ao gerar link."
            );
          const json = await res.json();
          await navigator.clipboard.writeText(json.magicLink);
          notyf.success("Link mágico copiado!");
        } catch (err) {
          notyf.error(err.message || "Não foi possível copiar o link.");
        }
      });
  };

  const setupConfirmationModal = () => {
    const confirmationModal = document.getElementById("confirmationModal");
    if (!confirmationModal) return;

    document
      .querySelectorAll(".action-icon-delete, .action-icon-excluir")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const { id } = e.currentTarget.dataset;
          const pageId = document.body.id;
          let config = {};

          if (pageId === "campaigns-page") {
            config = {
              url: `/campaigns/${id}/delete`,
              msg: "Deseja realmente excluir esta campanha?",
              success: "Campanha excluída.",
            };
          } else if (pageId === "devices-page") {
            config = {
              url: `/devices/${id}/delete`,
              msg: "Deseja realmente excluir este dispositivo?",
              success: "Dispositivo excluído.",
            };
          } else if (pageId === "companies-page") {
            config = {
              url: `/companies/${id}/delete`,
              msg: "Excluir esta empresa removerá todos os dados associados. Confirma?",
              success: "Empresa excluída.",
            };
          } else return;

          confirmationModal.querySelector(
            ".confirmation-modal-body p"
          ).textContent = config.msg;
          confirmationModal.style.display = "flex";

          const confirmBtn = document.getElementById("confirmDeletion");
          const newConfirmBtn = confirmBtn.cloneNode(true);
          confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

          newConfirmBtn.addEventListener(
            "click",
            async () => {
              try {
                const res = await fetch(config.url, { method: "POST" });
                if (!res.ok)
                  throw new Error(
                    (await res.json()).message || `Erro ${res.status}`
                  );
                notyf.success(config.success);
                setTimeout(() => location.reload(), 1200);
              } catch (err) {
                notyf.error(err.message || "Falha na comunicação.");
              } finally {
                confirmationModal.style.display = "none";
              }
            },
            { once: true }
          );
        });
      });

    document
      .getElementById("cancelConfirmation")
      ?.addEventListener(
        "click",
        () => (confirmationModal.style.display = "none")
      );
  };

  const setupGlobalListeners = () => {
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) {
        e.target.style.display = "none";
      }
    });

    document.querySelectorAll(".device-table tbody tr").forEach((row) => {
      if (row.id?.includes("no-")) return;
      row.addEventListener("click", function (event) {
        if (event.target.closest(".actions-cell")) return;
        this.querySelector(".open-details-modal")?.click();
      });
    });
  };

  const connectAdminWs = () => {
    if (!document.body.id.endsWith("-page")) return;

    const protocol = window.location.protocol === "https" ? "wss:" : "ws:";
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
            const statusSpan = statusCell.querySelector(".online-status");
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
            if (statusCell) {
              const statusSpan = statusCell.querySelector(".online-status");
              const statusText = statusCell.querySelector("[data-status-text]");
              if (statusSpan && statusText) {
                statusSpan.className = `online-status ${status.class}`;
                statusText.textContent = status.text;
              }
            }
          }
        }
      } catch (e) {
        console.error("Erro ao processar mensagem WebSocket:", e);
      }
    };

    ws.onclose = () => setTimeout(connectAdminWs, 5000);
    ws.onerror = () => ws.close();
  };

  setupLoginForm();
  setupCompanyModal();
  setupDeviceModal();
  setupCampaignModal();
  setupDetailsModal();
  setupConfirmationModal();
  setupGlobalListeners();
  connectAdminWs();
});
