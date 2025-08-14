const express = require("express");
const router = express.Router();
const reportController = require("../controllers/report.controller");
const { isAuthenticated, isAdmin } = require("../middlewares/auth.middleware");

router.get("/reports", isAuthenticated, isAdmin, reportController.renderReportsPage);
router.get("/api/reports/data", isAuthenticated, isAdmin, reportController.getReportData);

module.exports = router;