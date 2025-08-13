const express = require("express");
const router = express.Router();

const adminRoutes = require("./admin.routes");
const authRoutes = require("./auth.routes");
const companyRoutes = require("./company.routes");
const deviceRoutes = require("./device.routes");
const campaignRoutes = require("./campaign.routes");
const playerRoutes = require("./player.routes");
const apiRoutes = require("./api.routes");
const productRoutes = require("./product.routes");

router.use(adminRoutes);
router.use(authRoutes);
router.use(companyRoutes);
router.use(deviceRoutes);
router.use(campaignRoutes);
router.use(playerRoutes);
router.use(apiRoutes);
router.use(productRoutes);

module.exports = router;
