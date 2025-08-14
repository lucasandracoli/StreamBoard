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

    const editBtn = e.target.closest(".action-icon-editar");
    if (editBtn) {
      const pageId = document.body.id;
      const entityId = editBtn.dataset.id;
      if (pageId === "devices-page" && modalHandlers.device) {
        modalHandlers.device.openEditModal(entityId);
      } else if (pageId === "companies-page" && modalHandlers.company) {
        modalHandlers.company.openEditModal(entityId);
      } else if (pageId === "campaigns-page" && modalHandlers.campaign) {
        modalHandlers.campaign.openEditModal(entityId);
      }
    }
  });
}
