import { notyf } from "./utils.js";
import { showConfirmationModal } from "./confirmationModal.js";

export function setupGlobalListeners(modalHandlers) {
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.style.display = "none";
      if (e.target.id === "deviceDetailsModal" && modalHandlers.details) {
        modalHandlers.details.hideOtpView();
      }
    }
  });

  document.body.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-device-id]");
    if (row && !e.target.closest(".actions-cell")) {
      if (modalHandlers.details) {
        modalHandlers.details.openDetailsModal(row.dataset.deviceId);
      }
      return;
    }

    const editButton = e.target.closest(".action-icon-editar");
    if (editButton) {
      e.stopPropagation();
      const { id } = editButton.dataset;
      const pageId = document.body.id;

      if (pageId === "campaigns-page" && modalHandlers.campaign) {
        modalHandlers.campaign.openEditCampaignModal(id);
      } else if (pageId === "devices-page" && modalHandlers.device) {
        modalHandlers.device.openEditModal(id);
      } else if (pageId === "companies-page" && modalHandlers.company) {
        modalHandlers.company.openEditModal(id);
      }
      return;
    }

    const deleteButton = e.target.closest(".action-icon-excluir");
    if (deleteButton) {
      e.stopPropagation();
      const { id } = deleteButton.dataset;
      const pageId = document.body.id;
      let apiConfig = {};

      if (pageId === "campaigns-page") {
        apiConfig = {
          url: `/campaigns/${id}/delete`,
          title: "Confirmar Exclusão",
          msg: "Deseja realmente excluir esta campanha? Esta ação não pode ser desfeita.",
          confirmText: "Excluir",
          type: "danger",
        };
      } else if (pageId === "devices-page") {
        apiConfig = {
          url: `/devices/${id}/delete`,
          title: "Confirmar Exclusão",
          msg: "Deseja realmente excluir este dispositivo?",
          confirmText: "Excluir",
          type: "danger",
        };
      } else if (pageId === "companies-page") {
        apiConfig = {
          url: `/companies/${id}/delete`,
          title: "Atenção!",
          msg: "Excluir esta empresa removerá todos os dispositivos e campanhas associados. Confirma?",
          confirmText: "Excluir Tudo",
          type: "warning",
        };
      } else if (pageId === "products-page") {
        apiConfig = {
          url: `/products/${id}/delete`,
          title: "Confirmar Exclusão",
          msg: "Deseja realmente excluir este produto da lista local?",
          confirmText: "Excluir",
          reload: true,
          type: "danger",
        };
      } else return;

      const onConfirm = async () => {
        try {
          const res = await fetch(apiConfig.url, { method: "POST" });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.message || `Erro ${res.status}`);
          }
          if (apiConfig.reload) {
            setTimeout(() => window.location.reload(), 1200);
          }
        } catch (err) {
          notyf.error(err.message || "Falha na comunicação.");
        } finally {
          document.getElementById("confirmationModal").style.display = "none";
        }
      };

      showConfirmationModal({
        title: apiConfig.title,
        message: apiConfig.msg,
        confirmText: apiConfig.confirmText,
        type: apiConfig.type,
        onConfirm: onConfirm,
      });
    }
  });
}
