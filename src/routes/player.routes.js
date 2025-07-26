const express = require("express");
const router = express.Router();
const playerController = require("../controllers/player.controller");
const { deviceAuth } = require("../middlewares/auth.middleware");

router.get("/pair", playerController.renderPairPage);
router.post("/pair", playerController.handleOtpPairing);
router.get("/pair/magic", playerController.handleMagicLinkPairing);

router.get("/player", deviceAuth, playerController.renderPlayerPage);
router.get("/price", deviceAuth, playerController.renderPricePage);

module.exports = router;