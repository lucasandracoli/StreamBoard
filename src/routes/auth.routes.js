const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.get("/login", authController.renderLoginPage);
router.post("/login", authController.handleLogin);
router.get("/logout", authController.handleLogout);

module.exports = router;
