import { setupLoginForm } from "./admin/loginForm.js";
import { setupCompanyModal } from "./admin/companyModal.js";
import { setupDeviceModal } from "./admin/deviceModal.js";
import { setupCampaignModal } from "./admin/campaignModal.js";
import { setupDetailsModal } from "./admin/detailsModal.js";
import { setupConfirmationModal } from "./admin/confirmationModal.js";
import { setupGlobalListeners } from "./admin/globalListeners.js";
import { connectAdminWs } from "./admin/adminWs.js";
import { setupProductModal } from "./admin/productModal.js";
import { setupTableSearch } from "./admin/tableSearch.js";

function initializePage() {
  setupLoginForm();

  const modalHandlers = {
    company: setupCompanyModal(),
    device: setupDeviceModal(),
    campaign: setupCampaignModal(),
    details: setupDetailsModal(),
  };

  setupConfirmationModal();
  setupGlobalListeners(modalHandlers);
  setupProductModal();

  setupTableSearch("companies-search-input", "companies-table-body");
  setupTableSearch("devices-search-input", "devices-table-body");
  setupTableSearch("campaigns-search-input", "campaigns-table-body");
}

document.addEventListener("DOMContentLoaded", () => {
  initializePage();
  setTimeout(() => {
    connectAdminWs();
  }, 1000);
});

document.addEventListener("page-content-refreshed", initializePage);
