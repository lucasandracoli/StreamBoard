export function setupGlobalListeners(detailsModalHandler) {
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.style.display = "none";
      if (e.target.id === "deviceDetailsModal" && detailsModalHandler) {
        detailsModalHandler.hideOtpView();
      }
    }
  });

  document.querySelectorAll(".device-table tbody tr").forEach((row) => {
    if (!row.dataset.deviceId) return;
    row.addEventListener("click", function (event) {
      if (event.target.closest(".actions-cell")) return;
      if (detailsModalHandler) {
        detailsModalHandler.openDetailsModal(this.dataset.deviceId);
      }
    });
  });
}