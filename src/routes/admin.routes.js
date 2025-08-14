const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { isAuthenticated, isAdmin } = require("../middlewares/auth.middleware");

router.get("/", adminController.rootRedirect);
router.get(
  "/dashboard",
  isAuthenticated,
  isAdmin,
  adminController.renderDashboard
);
router.post(
  "/api/broadcastRefresh",
  isAuthenticated,
  isAdmin,
  adminController.broadcastRefresh
);
router.get(
  "/api/reports/data",
  isAuthenticated,
  isAdmin,
  adminController.getReportData
);

module.exports = router;