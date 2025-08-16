import { notyf, handleFetchError } from "./utils.js";

export function setupCampaignModal() {
  const campaignModal = document.getElementById("campaignModal");
  if (!campaignModal) return;

  let tomSelectDevices, tomSelectSectors;
  let stagedFiles = { main: [], secondary: [] };
  let sortableInstances = { main: null, secondary: null };
  let mediaHasBeenTouched = false;
  const thumbnailCache = new Map();

  const elements = {
    openBtn: document.getElementById("openCampaignModal"),
    cancelBtn: document.getElementById("cancelCampaignModal"),
    form: campaignModal.querySelector(".modal-form"),
    submitButton: campaignModal.querySelector('button[type="submit"]'),
    modalTitle: campaignModal.querySelector(".modal-title"),
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
    layoutRadios: document.querySelectorAll('input[name="layout_type"]'),
    mainZoneContainer: document.getElementById("zone-main-container"),
    secondaryZoneContainer: document.getElementById("zone-secondary-container"),
    mainPreviewWrapper: document.getElementById("file-preview-wrapper-main"),
    secondaryPreviewWrapper: document.getElementById(
      "file-preview-wrapper-secondary"
    ),
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
    const fileKey =
      file instanceof File ? `${file.name}-${file.size}` : file.file_path;
    if (thumbnailCache.has(fileKey)) {
      return Promise.resolve(thumbnailCache.get(fileKey));
    }

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
          thumbnailCache.set(fileKey, dataUrl);
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

  const renderWeatherWidget = () => {
    return `
      <div class="weather-widget-preview">
        <svg class="weather-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
          <g>
            <path d="M41.5,16.12A12.5,12.5,0,0,0,19.33,21.5a12.45,12.45,0,0,0,.17,2c-6.63.83-11.5,5-11.5,10.25a10.4,10.4,0,0,0,10.5,9.63H41.5a10.5,10.5,0,0,0,0-21Z" fill="#a6adc8" stroke="#a6adc8" stroke-linejoin="round" stroke-width="3"/>
            <path d="M29.5,16.12A12.5,12.5,0,0,0,7.33,21.5a12.45,12.45,0,0,0,.17,2c-6.63.83-11.5,5-11.5,10.25a10.4,10.4,0,0,0,10.5,9.63H29.5a10.5,10.5,0,0,0,0-21Z" fill="#a6adc8" stroke="#a6adc8" stroke-linejoin="round" stroke-width="3" transform="translate(22, 0)"/>
          </g>
          <path d="M32.5,23.5a9,9,0,1,1,9-9,9,9,0,0,1-9,9Z" fill="#f8e187" stroke="#f8e187" stroke-miterlimit="10" stroke-width="3"/>
        </svg>
        <div class="weather-temp">25°C</div>
        <div class="weather-minmax">
          <span><i class="bi bi-arrow-up"></i> 28°</span>
          <span><i class="bi bi-arrow-down"></i> 19°</span>
        </div>
      </div>
    `;
  };

  const handleLayoutChange = () => {
    const selectedLayout = document.querySelector(
      'input[name="layout_type"]:checked'
    ).value;

    elements.secondaryZoneContainer.classList.add("hidden");
    elements.mainZoneContainer.style.flex = "1";
    elements.secondaryPreviewWrapper.innerHTML = "";
    elements.secondaryPreviewWrapper.style.display = "flex";

    if (selectedLayout === "fullscreen") {
      if (stagedFiles.secondary.length > 0) {
        stagedFiles.main.push(...stagedFiles.secondary);
        stagedFiles.secondary = [];
      }
    } else if (selectedLayout === "split-80-20") {
      elements.secondaryZoneContainer.classList.remove("hidden");
      elements.mainZoneContainer.style.flex = "4";
      elements.secondaryZoneContainer.style.flex = "1";
    } else if (selectedLayout === "split-80-20-weather") {
      elements.secondaryZoneContainer.classList.remove("hidden");
      elements.mainZoneContainer.style.flex = "4";
      elements.secondaryZoneContainer.style.flex = "1";
      elements.secondaryPreviewWrapper.innerHTML = renderWeatherWidget();
      if (stagedFiles.secondary.length > 0) {
        stagedFiles.main.push(...stagedFiles.secondary);
        stagedFiles.secondary = [];
      }
    }

    renderStagedFiles();
  };

  elements.layoutRadios.forEach((radio) => {
    radio.addEventListener("change", handleLayoutChange);
  });

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

  const createAddCard = (zone) => {
    const addItem = document.createElement("li");
    addItem.className = "add-media-card";
    addItem.innerHTML = `
        <div class="add-media-label" data-zone="${zone}">
            <i class="bi bi-plus-lg"></i>
            <span>Adicionar Mídia</span>
        </div>`;
    return addItem;
  };

  const renderStagedFiles = () => {
    Object.keys(stagedFiles).forEach((zone) => {
      const wrapper = elements[`${zone}PreviewWrapper`];
      const selectedLayout = document.querySelector(
        'input[name="layout_type"]:checked'
      ).value;

      if (zone === "secondary" && selectedLayout === "split-80-20-weather") {
        return;
      }

      if (sortableInstances[zone]) {
        sortableInstances[zone].destroy();
      }
      wrapper.innerHTML = "";

      const list = document.createElement("ul");
      list.className = "file-preview-list";
      list.dataset.zone = zone;

      stagedFiles[zone].forEach((file, index) => {
        const fileName = file.name || file.file_name;
        const fileType = file.type || file.file_type || "";
        const isImage = fileType.startsWith("image/");
        const isVideo = fileType.startsWith("video/");
        let thumbnailHtml = `<i class="bi bi-file-earmark"></i>`;

        const item = document.createElement("li");
        item.className = "file-preview-item";
        item.dataset.id = file.id || `new-${index}`;
        item.dataset.zone = zone;

        const durationInputHtml =
          isImage && zone !== "secondary"
            ? `<div class="media-duration-group">
                    <input type="number" class="media-duration-input" data-index="${index}" data-zone="${zone}" value="${
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
                <button type="button" class="remove-file-btn" data-index="${index}" data-zone="${zone}">&times;</button>`;

        list.appendChild(item);

        const thumbnailContainer = item.querySelector(".media-thumbnail");

        if (isImage) {
          const src =
            file instanceof File ? URL.createObjectURL(file) : file.file_path;
          thumbnailContainer.innerHTML = `<img src="${src}" alt="preview">`;
        } else if (isVideo) {
          thumbnailContainer.innerHTML = `<div class="spinner spinner-thumbnail"></div>`;
          generateVideoThumbnail(file)
            .then((thumbnailSrc) => {
              if (thumbnailSrc) {
                thumbnailContainer.innerHTML = `<img src="${thumbnailSrc}" alt="video preview">`;
              } else {
                thumbnailContainer.innerHTML = `<i class="bi bi-film"></i>`;
              }
            })
            .catch(() => {
              thumbnailContainer.innerHTML = `<i class="bi bi-film"></i>`;
            });
        }
      });

      const isSecondaryZone = zone === "secondary";

      if (
        !isSecondaryZone ||
        (isSecondaryZone && stagedFiles.secondary.length === 0)
      ) {
        list.appendChild(createAddCard(zone));
      }

      wrapper.appendChild(list);

      sortableInstances[zone] = new Sortable(list, {
        group: "shared-media",
        animation: 150,
        filter: ".add-media-card",
        onAdd: (evt) => {
          if (
            evt.to.dataset.zone === "secondary" &&
            evt.to.querySelectorAll(".file-preview-item").length > 1
          ) {
            notyf.error("A zona secundária só pode conter uma mídia.");
            evt.from.appendChild(evt.item);
          }
        },
        onEnd: (evt) => {
          mediaHasBeenTouched = true;
          const fromZone = evt.from.dataset.zone;
          const toZone = evt.to.dataset.zone;

          if (
            fromZone !== toZone &&
            toZone === "secondary" &&
            stagedFiles.secondary.length >= 1
          ) {
            notyf.error("A zona secundária só pode conter uma mídia.");
            renderStagedFiles();
            return;
          }

          const [movedItem] = stagedFiles[fromZone].splice(evt.oldIndex, 1);
          stagedFiles[toZone].splice(evt.newIndex, 0, movedItem);

          renderStagedFiles();
        },
      });
    });
  };

  const resetModal = () => {
    elements.form.reset();
    stagedFiles = { main: [], secondary: [] };
    mediaHasBeenTouched = false;

    Object.keys(sortableInstances).forEach((zone) => {
      if (sortableInstances[zone]) {
        sortableInstances[zone].destroy();
        sortableInstances[zone] = null;
      }
      elements[`${zone}PreviewWrapper`].innerHTML = "";
    });

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
    document.getElementById("layout-fullscreen").checked = true;
    handleLayoutChange();
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

      const videoFiles = (campaign.uploads || []).filter((file) =>
        file.file_type.startsWith("video/")
      );
      const thumbnailPromises = videoFiles.map((file) =>
        generateVideoThumbnail(file)
      );
      await Promise.all(thumbnailPromises);

      elements.modalTitle.textContent = "Editar Campanha";
      elements.form.action = `/campaigns/${campaign.id}/edit`;
      elements.idInput.value = campaign.id;
      elements.nameInput.value = campaign.name;
      elements.companySelect.value = campaign.company_id;

      const layoutRadio = document.querySelector(
        `input[name="layout_type"][value="${
          campaign.layout_type || "fullscreen"
        }"]`
      );
      if (layoutRadio) {
        layoutRadio.checked = true;
      } else {
        document.getElementById("layout-fullscreen").checked = true;
      }

      fpStart.setDate(campaign.start_date, true);
      fpEnd.setDate(campaign.end_date, true);

      stagedFiles = { main: [], secondary: [] };
      (campaign.uploads || []).forEach((file) => {
        const zone = file.zone || "main";
        if (stagedFiles[zone]) {
          stagedFiles[zone].push({
            ...file,
            name: file.file_name,
            type: file.file_type,
          });
        }
      });

      handleLayoutChange();

      await populateCampaignSelectors(campaign.company_id);

      if (campaign.sector_ids && campaign.sector_ids.length > 0) {
        document.getElementById("seg-sectors").checked = true;
        tomSelectSectors.setValue(campaign.sector_ids);
      } else if (campaign.device_ids && campaign.device_ids.length > 0) {
        document.getElementById("seg-devices").checked = true;
        tomSelectDevices.setValue(campaign.device_ids);
      } else {
        document.getElementById("seg-all").checked = true;
      }
      handleSegmentationChange();

      campaignModal.style.display = "flex";
    } catch (error) {
      notyf.error(error.message || "Erro ao carregar campanha.");
    }
  };

  let currentUploadZone = "main";

  document.body.addEventListener("click", (e) => {
    const addMediaLabel = e.target.closest(".add-media-label");
    if (addMediaLabel) {
      e.preventDefault();
      currentUploadZone = addMediaLabel.dataset.zone;
      elements.fileInput.click();
    }
  });

  elements.fileInput?.addEventListener("change", (e) => {
    mediaHasBeenTouched = true;
    const newFiles = Array.from(e.target.files).map((f) =>
      Object.assign(f, { duration: 10 })
    );

    if (
      currentUploadZone === "secondary" &&
      stagedFiles.secondary.length + newFiles.length > 1
    ) {
      notyf.error("A zona secundária só pode conter uma mídia.");
      elements.fileInput.value = "";
      return;
    }

    stagedFiles[currentUploadZone].push(...newFiles);

    renderStagedFiles();
    elements.fileInput.value = "";
  });

  const handleInputOrClick = (e) => {
    const target = e.target;
    if (target.classList.contains("media-duration-input")) {
      mediaHasBeenTouched = true;
      const index = parseInt(target.dataset.index, 10);
      const zone = target.dataset.zone;
      if (stagedFiles[zone][index]) {
        stagedFiles[zone][index].duration = parseInt(target.value, 10) || 10;
      }
    }
    const removeBtn = e.target.closest(".remove-file-btn");
    if (removeBtn) {
      mediaHasBeenTouched = true;
      const index = parseInt(removeBtn.dataset.index, 10);
      const zone = removeBtn.dataset.zone;
      stagedFiles[zone].splice(index, 1);
      renderStagedFiles();
    }
  };

  elements.mainPreviewWrapper.addEventListener("input", handleInputOrClick);
  elements.mainPreviewWrapper.addEventListener("click", handleInputOrClick);
  elements.secondaryPreviewWrapper.addEventListener(
    "input",
    handleInputOrClick
  );
  elements.secondaryPreviewWrapper.addEventListener(
    "click",
    handleInputOrClick
  );

  elements.openBtn?.addEventListener("click", openCreateCampaignModal);
  elements.cancelBtn?.addEventListener(
    "click",
    () => (campaignModal.style.display = "none")
  );

  const submitForm = async (force = false) => {
    elements.submitButton.disabled = true;
    elements.submitButton.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;

    const formData = new FormData();

    formData.append("name", elements.nameInput.value);
    formData.append("company_id", elements.companySelect.value);
    formData.append("start_date", elements.startDateInput.value);
    formData.append("end_date", elements.endDateInput.value);
    formData.append(
      "layout_type",
      document.querySelector('input[name="layout_type"]:checked').value
    );

    if (force) {
      formData.append("force", "true");
    }

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

      const mediaMetadata = [];
      const newFilesToUpload = [];

      Object.keys(stagedFiles).forEach((zone) => {
        stagedFiles[zone].forEach((file, index) => {
          const isNewFile = file instanceof File;
          mediaMetadata.push({
            id: isNewFile ? null : file.id,
            name: isNewFile ? file.name : file.file_name || file.name,
            order: index,
            duration: file.duration || 10,
            zone: zone,
          });
          if (isNewFile) {
            newFilesToUpload.push(file);
          }
        });
      });

      formData.append("media_metadata", JSON.stringify(mediaMetadata));
      newFilesToUpload.forEach((file) => formData.append("media", file));
    }

    try {
      const res = await fetch(elements.form.action, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (res.status === 409 && json.conflict) {
        window.showConfirmationModal({
          title: "Aviso de Sobreposição",
          message: json.message,
          confirmText: "Salvar Mesmo Assim",
          type: "warning",
          onConfirm: () => {
            const modal = document.getElementById("confirmationModal");
            modal.style.display = "none";
            submitForm(true);
          },
        });
        return;
      }

      if (!res.ok) {
        notyf.error(json.message || `Erro ${res.status}`);
        return;
      }

      campaignModal.style.display = "none";
    } catch (err) {
      notyf.error("Falha na comunicação com o servidor.");
    } finally {
      elements.submitButton.disabled = false;
      elements.submitButton.innerHTML = "Salvar";
    }
  };

  elements.form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const selectedLayout = document.querySelector(
      'input[name="layout_type"]:checked'
    ).value;

    if (stagedFiles.main.length === 0) {
      notyf.error("A zona Principal deve conter pelo menos uma mídia.");
      return;
    }

    if (
      selectedLayout === "split-80-20" &&
      stagedFiles.secondary.length === 0
    ) {
      notyf.error(
        "Para o layout 80/20, a zona Secundária também deve conter ao menos uma mídia."
      );
      return;
    }

    if (
      fpStart.selectedDates[0] &&
      fpEnd.selectedDates[0] &&
      fpEnd.selectedDates[0] < fpStart.selectedDates[0]
    ) {
      notyf.error("A data de término não pode ser anterior à data de início.");
      return;
    }

    submitForm(false);
  });

  return { openEditCampaignModal };
}