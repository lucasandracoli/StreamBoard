const express = require("express");
const router = express.Router();
const productController = require("../controllers/product.controller");
const { isAuthenticated, isAdmin } = require("../middlewares/auth.middleware");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get(
  "/products",
  isAuthenticated,
  isAdmin,
  productController.listCompaniesPage
);
router.get(
  "/products/template",
  isAuthenticated,
  isAdmin,
  productController.downloadTemplate
);
router.get(
  "/products/:companyId",
  isAuthenticated,
  isAdmin,
  productController.listProductsByCompanyPage
);
router.get(
  "/products/preview/:companyId/:productCode",
  isAuthenticated,
  isAdmin,
  productController.previewSingleProduct
);

router.post(
  "/products/sync/:companyId",
  isAuthenticated,
  isAdmin,
  productController.triggerSyncForCompany
);
router.post(
  "/products/upload/:companyId",
  isAuthenticated,
  isAdmin,
  upload.single("productsSheet"),
  productController.uploadProducts
);
router.post(
  "/products/add-single/:companyId",
  isAuthenticated,
  isAdmin,
  productController.addSingleProduct
);
router.post(
  "/products/:id/delete",
  isAuthenticated,
  isAdmin,
  productController.deleteProduct
);

module.exports = router;
