import { deviceTypeNames, handleFetchError, notyf } from "./utils.js";

export function setupDetailsModal() {
  const detailsModal = document.getElementById("deviceDetailsModal");
  if (!detailsModal) return;

  let otpCountdownInterval = null;
  const otpView = document.getElementById("otpView");
  const otpCodeEl = document.getElementById("otpCode");
  const otpExpiryEl = document.getElementById("otpExpiry");

  const hideOtpView = () => {
    if (otpCountdownInterval) {
      clearInterval(otpCountdownInterval);
      otpCountdownInterval = null;
    }
    if (otpView) {
      otpView.style.display = "none";
    }
  };

  const displayOtp = (otp, expiresAt) => {
    if (!otpView || !otpCodeEl || !otpExpiryEl) {
      notyf.error("Elementos da OTP não encontrados no HTML.");
      return;
    }

    hideOtpView();

    otpView.style.display = "flex";
    otpCodeEl.textContent = otp.match(/.{1,3}/g).join(" ");

    const expiryTime = new Date(expiresAt).getTime();

    otpCountdownInterval = setInterval(() => {
      const now = new Date().getTime();
      const distance = expiryTime - now;

      if (distance < 0) {
        hideOtpView();
        otpExpiryEl.textContent = "Expirado";
      } else {
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000)
          .toString()
          .padStart(2, "0");
        otpExpiryEl.textContent = `Expira em ${minutes}:${seconds}`;
      }
    });
  };

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

    const revokeBtn = getEl("modalRevokeButton");
    const reactivateBtn = getEl("modalReactivateButton");
    const magicLinkBtn = getEl("modalGenerateMagicLinkButton");
    const otpBtn = getEl("modalGenerateOtpButton");

    revokeBtn.dataset.id = device.id;
    reactivateBtn.dataset.id = device.id;
    magicLinkBtn.dataset.id = device.id;
    otpBtn.dataset.id = device.id;

    const isInactive = device.status.text === "Inativo";
    revokeBtn.style.display = device.is_active ? "inline-flex" : "none";
    reactivateBtn.style.display = device.is_active ? "none" : "inline-flex";
    magicLinkBtn.style.display =
      device.is_active && isInactive ? "inline-flex" : "none";
    otpBtn.style.display =
      device.is_active && isInactive ? "inline-flex" : "none";
  };

  const openDetailsModal = async (deviceId) => {
    hideOtpView();
    detailsModal.dataset.showingDeviceId = deviceId;
    detailsModal.style.display = "flex";
    detailsModal.querySelector(".details-modal-content").style.display = "none";
    detailsModal.querySelector(".details-modal-loader").style.display = "flex";
    try {
      const res = await fetch(`/api/deviceDetails/${deviceId}`);
      if (!res.ok) throw new Error("Falha ao carregar dados do dispositivo.");
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
  };

  document
    .getElementById("closeDetailsModal")
    ?.addEventListener("click", () => {
      hideOtpView();
      detailsModal.style.display = "none";
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
        `/devices/${this.dataset.id}/revoke`,
        "Dispositivo revogado."
      );
    });

  document
    .getElementById("modalReactivateButton")
    ?.addEventListener("click", function () {
      handleDeviceAction(
        `/devices/${this.dataset.id}/reactivate`,
        "Dispositivo reativado."
      );
    });

  document
    .getElementById("modalGenerateOtpButton")
    ?.addEventListener("click", async function (e) {
      e.stopPropagation();
      this.disabled = true;
      try {
        const res = await fetch(`/devices/${this.dataset.id}/otp`, {
          method: "POST",
        });
        if (!res.ok)
          throw new Error((await res.json()).message || "Falha ao gerar OTP.");
        const { otp, expiresAt } = await res.json();
        displayOtp(otp, expiresAt);
      } catch (err) {
        notyf.error(err.message || "Não foi possível gerar o OTP.");
      } finally {
        this.disabled = false;
      }
    });

  document
    .getElementById("modalGenerateMagicLinkButton")
    ?.addEventListener("click", async function (e) {
      e.stopPropagation();
      this.disabled = true;
      try {
        const res = await fetch(`/devices/${this.dataset.id}/magicLink`, {
          method: "POST",
        });
        if (!res.ok)
          throw new Error((await res.json()).message || "Falha ao gerar link.");
        const { magicLink } = await res.json();
        await navigator.clipboard.writeText(magicLink);
        notyf.success("Link mágico copiado!");
      } catch (err) {
        notyf.error(err.message || "Não foi possível copiar o link.");
      } finally {
        this.disabled = false;
      }
    });

  return { openDetailsModal, hideOtpView, element: detailsModal };
}
