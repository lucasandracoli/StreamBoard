import { setupLoginForm } from "./admin/loginForm.js";
import { setupCompanyModal } from "./admin/companyModal.js";
import { setupDeviceModal } from "./admin/deviceModal.js";
import { setupCampaignModal } from "./admin/campaignModal.js";
import { setupDetailsModal } from "./admin/detailsModal.js";
import { setupConfirmationModal } from "./admin/confirmationModal.js";
import { setupGlobalListeners } from "./admin/globalListeners.js";
import { connectAdminWs } from "./admin/adminWs.js";

document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  setupCompanyModal();
  setupDeviceModal();
  setupCampaignModal();
  const detailsModalHandler = setupDetailsModal();
  setupConfirmationModal();
  setupGlobalListeners(detailsModalHandler);
  connectAdminWs(detailsModalHandler);
});
