document.addEventListener("DOMContentLoaded", () => {
  const deviceModal = document.getElementById("deviceModal");
  const openBtn = document.getElementById("openDeviceModal");
  const cancelBtn = document.getElementById("cancelDeviceModal");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      deviceModal.style.display = "flex";
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      deviceModal.style.display = "none";
    });
  }

  const connectionModal = document.getElementById("connectionModal");
  const closeConnectionBtn = document.getElementById("closeConnectionModal");
  const inputId = document.getElementById("modalDeviceId");
  const inputKey = document.getElementById("modalDeviceKey");

  document.querySelectorAll(".show-connection").forEach((button) => {
    button.addEventListener("click", () => {
      const identifier = button.getAttribute("data-identifier");
      const key = button.getAttribute("data-key");
      inputId.value = identifier;
      inputKey.value = key;
      connectionModal.style.display = "flex";
    });
  });

  if (closeConnectionBtn) {
    closeConnectionBtn.addEventListener("click", () => {
      connectionModal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === deviceModal) {
      deviceModal.style.display = "none";
    }
    if (e.target === connectionModal) {
      connectionModal.style.display = "none";
    }
  });
});
