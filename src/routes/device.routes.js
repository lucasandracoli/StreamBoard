const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/device.controller");
const {
  isAuthenticated,
  isAdmin,
  deviceAuth,
} = require("../middlewares/auth.middleware");

router.get(
  "/devices",
  isAuthenticated,
  isAdmin,
  deviceController.listDevicesPage
);
router.post(
  "/devices",
  isAuthenticated,
  isAdmin,
  deviceController.createDevice
);
router.post(
  "/devices/:id/edit",
  isAuthenticated,
  isAdmin,
  deviceController.editDevice
);
router.post(
  "/devices/:id/delete",
  isAuthenticated,
  isAdmin,
  deviceController.deleteDevice
);
router.post(
  "/devices/:id/otp",
  isAuthenticated,
  isAdmin,
  deviceController.generateOtp
);
router.post(
  "/devices/:id/magicLink",
  isAuthenticated,
  isAdmin,
  deviceController.generateMagicLink
);
router.post(
  "/devices/:id/revoke",
  isAuthenticated,
  isAdmin,
  deviceController.revokeDevice
);
router.post(
  "/devices/:id/reactivate",
  isAuthenticated,
  isAdmin,
  deviceController.reactivateDevice
);
router.post(
  "/api/devices/:id/command",
  isAuthenticated,
  isAdmin,
  deviceController.sendDeviceCommand
);

router.get(
  "/api/deviceDetails/:id",
  isAuthenticated,
  isAdmin,
  deviceController.getDeviceDetails
);
router.get(
  "/api/device/playlist",
  deviceAuth,
  deviceController.getDevicePlaylist
);
router.get(
  "/api/device/weather",
  deviceAuth,
  deviceController.getDeviceWeather
);
router.get("/api/wsToken", deviceAuth, deviceController.getWsToken);

module.exports = router;
