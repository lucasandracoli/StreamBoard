const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const companyController = require("../controllers/company.controller");
const { isAuthenticated, isAdmin } = require("../middlewares/auth.middleware");

router.get(
  "/companies",
  isAuthenticated,
  isAdmin,
  companyController.listCompaniesPage
);

router.post(
  "/companies",
  isAuthenticated,
  isAdmin,
  body("name")
    .trim()
    .notEmpty()
    .withMessage("O nome da empresa é obrigatório."),
  body("cnpj")
    .trim()
    .customSanitizer((value) => value.replace(/[^\d]/g, ""))
    .notEmpty()
    .withMessage("O CNPJ é obrigatório.")
    .isLength({ min: 14, max: 14 })
    .withMessage("O CNPJ deve ter 14 dígitos."),
  body("city").trim().optional(),
  body("address").trim().optional(),
  body("state").trim().optional(),
  body("sectors.*")
    .trim()
    .notEmpty()
    .withMessage("O nome do setor não pode ser vazio."),
  companyController.createCompany
);

router.post(
  "/companies/:id/edit",
  isAuthenticated,
  isAdmin,
  companyController.editCompany
);

router.post(
  "/companies/:id/delete",
  isAuthenticated,
  isAdmin,
  companyController.deleteCompany
);

router.get(
  "/api/companies/:id",
  isAuthenticated,
  isAdmin,
  companyController.getCompanyDetails
);

router.get(
  "/api/companies/:companyId/sectors",
  isAuthenticated,
  isAdmin,
  companyController.getCompanySectors
);

router.get(
  "/api/companies/:companyId/devices",
  isAuthenticated,
  isAdmin,
  companyController.getCompanyDevices
);

router.post(
  "/api/sectors",
  isAuthenticated,
  isAdmin,
  companyController.addSectorToCompany
);

router.post(
  "/api/sectors/:id/delete",
  isAuthenticated,
  isAdmin,
  companyController.removeSector
);

module.exports = router;
