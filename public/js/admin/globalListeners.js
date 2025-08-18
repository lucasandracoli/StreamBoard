import { showSuccess, showError } from "./notification.js";
import { showConfirmationModal } from "./confirmationModal.js";

let isInitialized = false;

export function setupGlobalListeners(modalHandlers) {
  if (isInitialized) return;

  document.body.addEventListener("click", async (e) => {
    const target = e.target;
    const pageId = document.body.id;

    const openModalButton = target.closest(
      "#openDeviceModal, #openCompanyModal, #openCampaignModal, #openAddProductModalBtn"
    );
    if (openModalButton) {
      e.preventDefault();
      switch (openModalButton.id) {
        case "openDeviceModal":
          modalHandlers.device?.openCreateModal();
          break;
        case "openCompanyModal":
          modalHandlers.company?.openCreateModal();
          break;
        case "openCampaignModal":
          modalHandlers.campaign?.openCreateCampaignModal();
          break;
        case "openAddProductModalBtn":
          document.getElementById("addProductModal").style.display = "flex";
          break;
      }
      return;
    }

    const row = target.closest("tr[data-device-id]");
    if (row && !target.closest(".actions-cell")) {
      modalHandlers.details?.openDetailsModal(row.dataset.deviceId);
      return;
    }

    const editButton = target.closest(".action-icon-editar");
    if (editButton) {
      e.preventDefault();
      e.stopPropagation();
      const { id } = editButton.dataset;
      if (pageId === "devices-page") modalHandlers.device?.openEditModal(id);
      if (pageId === "companies-page") modalHandlers.company?.openEditModal(id);
      if (pageId === "campaigns-page")
        modalHandlers.campaign?.openEditCampaignModal(id);
      return;
    }

    const deleteButton = target.closest(".action-icon-excluir");
    if (deleteButton) {
      e.preventDefault();
      e.stopPropagation();
      const { id } = deleteButton.dataset;
      let apiConfig = {};

      if (pageId === "devices-page") {
        apiConfig = {
          url: `/devices/${id}/delete`,
          title: "Confirmar Exclusão",
          msg: "Deseja realmente excluir este dispositivo?",
        };
      } else if (pageId === "campaigns-page") {
        apiConfig = {
          url: `/campaigns/${id}/delete`,
          title: "Confirmar Exclusão",
          msg: "Deseja realmente excluir esta campanha?",
        };
      } else if (pageId === "companies-page") {
        apiConfig = {
          url: `/companies/${id}/delete`,
          title: "Atenção!",
          msg: "Excluir esta empresa removerá todos os dispositivos e campanhas associados.",
        };
      } else if (pageId === "products-page") {
        apiConfig = {
          url: `/products/${id}/delete`,
          title: "Confirmar Exclusão",
          msg: "Deseja realmente excluir este produto da lista local?",
        };
      } else return;

      showConfirmationModal({
        title: apiConfig.title,
        message: apiConfig.msg,
        confirmText: "Excluir",
        type: "danger",
        onConfirm: async () => {
          try {
            const res = await fetch(apiConfig.url, { method: "POST" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message);
          } catch (err) {
            showError(err.message || "Falha na comunicação.");
          }
        },
      });
    }
  });

  isInitialized = true;
}