const { validationResult } = require("express-validator");
const companyService = require("../services/company.service");
const logger = require("../utils/logger");
const formatUtils = require("../utils/format.utils");

const listCompaniesPage = async (req, res) => {
  try {
    const companies = await companyService.getAllCompanies();
    res.render("companies", { companies, formatUtils });
  } catch (err) {
    logger.error("Erro ao carregar empresas.", err);
    res.status(500).send("Erro ao carregar a página de empresas.");
  }
};

const createCompany = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { sectors, ...companyData } = req.body;

  try {
    const newCompany = await companyService.createCompanyWithSectors(
      companyData,
      sectors
    );
    const { broadcastToAdmins } = req.app.locals;
    broadcastToAdmins({
      type: "COMPANY_CREATED",
      payload: {
        companyId: newCompany.companyId,
        message: "Empresa cadastrada com sucesso.",
      },
    });
    res.status(201).json({
      status: "success",
      companyId: newCompany.companyId,
      message: "Empresa cadastrada com sucesso.",
    });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ message: "CNPJ ou setor já cadastrado para esta empresa." });
    }
    res.status(500).json({ message: "Erro ao cadastrar empresa." });
  }
};

const editCompany = async (req, res) => {
  const { id } = req.params;
  const { name, cnpj } = req.body;

  if (!name || !cnpj) {
    return res.status(400).json({ message: "Nome e CNPJ são obrigatórios." });
  }

  try {
    await companyService.updateCompany(id, req.body);
    const { broadcastToAdmins } = req.app.locals;
    broadcastToAdmins({
      type: "COMPANY_UPDATED",
      payload: {
        companyId: id,
        message: "Empresa atualizada com sucesso.",
      },
    });
    res
      .status(200)
      .json({ status: "success", message: "Empresa atualizada com sucesso." });
  } catch (err) {
    logger.error(`Erro ao editar empresa ${id}.`, err);
    res.status(500).json({ message: "Erro ao atualizar empresa." });
  }
};

const deleteCompany = async (req, res) => {
  const { id } = req.params;
  try {
    await companyService.deleteCompany(id);
    const { broadcastToAdmins } = req.app.locals;
    broadcastToAdmins({
      type: "COMPANY_DELETED",
      payload: {
        companyId: id,
        message: "Empresa excluída com sucesso.",
      },
    });
    res
      .status(200)
      .json({ status: "success", message: "Empresa excluída com sucesso." });
  } catch (err) {
    logger.error(`Erro ao excluir empresa ${id}.`, err);
    res.status(500).json({ message: "Erro ao excluir empresa." });
  }
};

const getCompanyDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const company = await companyService.getCompanyById(id);
    if (!company) {
      return res.status(404).json({ message: "Empresa não encontrada." });
    }
    res.json(company);
  } catch (err) {
    logger.error(`Erro ao buscar detalhes da empresa ${id}.`, err);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

const getCompanySectors = async (req, res) => {
  const { companyId } = req.params;
  try {
    const sectors = await companyService.getSectorsByCompanyId(companyId);
    res.json(sectors);
  } catch (err) {
    logger.error(`Erro ao buscar setores da empresa ${companyId}.`, err);
    res.status(500).json({ message: "Erro ao buscar setores." });
  }
};

const getCompanyDevices = async (req, res) => {
  const { companyId } = req.params;
  try {
    const devices = await companyService.getDevicesByCompanyId(companyId);
    res.json(devices);
  } catch (err) {
    logger.error(`Erro ao buscar dispositivos da empresa ${companyId}.`, err);
    res.status(500).json({ message: "Erro ao buscar dispositivos." });
  }
};

const addSectorToCompany = async (req, res) => {
  const { company_id, name } = req.body;
  if (!company_id || !name) {
    return res
      .status(400)
      .json({ message: "ID da empresa e nome do setor são obrigatórios." });
  }
  try {
    const newSector = await companyService.createSector(company_id, name);
    res.status(201).json(newSector);
  } catch (err) {
    logger.error("Erro ao adicionar setor.", err);
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ message: "Este setor já existe para esta empresa." });
    }
    res.status(500).json({ message: "Erro ao adicionar novo setor." });
  }
};

const removeSector = async (req, res) => {
  const { id } = req.params;
  try {
    await companyService.deleteSector(id);
    res.status(200).json({ message: "Setor excluído com sucesso." });
  } catch (err) {
    logger.error(`Erro ao excluir setor ${id}.`, err);
    res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Erro ao excluir setor." });
  }
};

module.exports = {
  listCompaniesPage,
  createCompany,
  editCompany,
  deleteCompany,
  getCompanyDetails,
  getCompanySectors,
  getCompanyDevices,
  addSectorToCompany,
  removeSector,
};
