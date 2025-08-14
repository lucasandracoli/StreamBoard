import { setupLoginForm } from "./admin/loginForm.js";
import { setupCompanyModal } from "./admin/companyModal.js";
import { setupDeviceModal } from "./admin/deviceModal.js";
import { setupCampaignModal } from "./admin/campaignModal.js";
import { setupDetailsModal } from "./admin/detailsModal.js";
import { setupConfirmationModal } from "./admin/confirmationModal.js";
import { setupGlobalListeners } from "./admin/globalListeners.js";
import { connectAdminWs } from "./admin/adminWs.js";
import { setupProductModal } from "./admin/productModal.js";
import { setupProductWs } from "./admin/productWs.js";
import { setupTableSearch } from "./admin/tableSearch.js";
import { setupDashboardCharts } from "./admin/reportsPage.js";

document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  const companyModalHandler = setupCompanyModal();
  const deviceModalHandler = setupDeviceModal();
  const campaignModalHandler = setupCampaignModal();
  const detailsModalHandler = setupDetailsModal();

  setupConfirmationModal();

  setupGlobalListeners({
    details: detailsModalHandler,
    device: deviceModalHandler,
    company: companyModalHandler,
    campaign: campaignModalHandler,
  });

  connectAdminWs(detailsModalHandler);
  setupProductModal();
  setupProductWs();

  setupTableSearch("companies-search-input", "companies-table-body");
  setupTableSearch("devices-search-input", "devices-table-body");
  setupTableSearch("campaigns-search-input", "campaigns-table-body");

  setupDashboardCharts();
});