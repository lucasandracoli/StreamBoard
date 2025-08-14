const express = require("express");
const router = express.Router();
const logController = require("../controllers/log.controller");
const { deviceAuth } = require("../middlewares/auth.middleware");

router.post("/logs/play", deviceAuth, logController.recordPlayback);

module.exports = router;