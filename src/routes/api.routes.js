const express = require("express");
const router = express.Router();
const apiController = require("../controllers/api.controller");
const { isAuthenticated, isAdmin } = require("../middlewares/auth.middleware");

router.get("/api/product/:barcode", apiController.getProduct);

module.exports = router;