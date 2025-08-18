import { handleFetchError } from "./utils.js";
import { showSuccess, showError } from "./notification.js";

let isInitialized = false;

export function setupDeviceModal() {
  const deviceModal = document.getElementById("deviceModal");
  if (!deviceModal) return { openCreateModal: () => {}, openEditModal: () => {} };

  const cancelBtn = document.getElementById("cancelDeviceModal");
  const form = document.getElementById("deviceForm");
  const modalTitle = document.getElementById("deviceModalTitle");
  const submitButton = document.getElementById("deviceSubmitButton");
  const companySelect = document.getElementById("newDeviceCompany");
  const sectorSelect = document.getElementById("newDeviceSector");

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
      showError(error.message || "Erro ao carregar dispositivo.");
    }
  };

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
      showError("Não foi possível carregar setores.");
      sectorSelect.innerHTML =
        '<option value="" disabled selected>Erro ao carregar</option>';
    }
  };

  if (!isInitialized) {
    companySelect?.addEventListener("change", () =>
      populateSectors(companySelect.value)
    );

    cancelBtn?.addEventListener(
      "click",
      () => (deviceModal.style.display = "none")
    );

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const originalButtonText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;

      try {
        const res = await fetch(this.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(this))),
        });
        const json = await res.json();
        if (!res.ok) {
          showError(json.message || `Erro ${res.status}`);
          return;
        }
        deviceModal.style.display = "none";
      } catch (err) {
        showError("Falha na comunicação com o servidor.");
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
      }
    });

    isInitialized = true;
  }

  return { openCreateModal, openEditModal };
}