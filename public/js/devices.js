document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("deviceModal");
  const openBtn = document.getElementById("openDeviceModal");
  const closeBtn = document.getElementById("closeDeviceModal");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      modal.style.display = "flex";
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
});
