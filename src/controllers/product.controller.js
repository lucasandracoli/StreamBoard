const localProductService = require("../services/localProduct.service");
const sysmoService = require("../services/sysmo.service");
const companyService = require("../services/company.service");
const deviceService = require("../services/device.service");
const logger = require("../utils/logger");
const xlsx = require("xlsx");
const formatUtils = require("../utils/format.utils");
const productSyncQueue = require("../jobs/productSyncQueue");

const notifyPlayers = async (companyId, { sendUpdateToDevice }) => {
  const deviceIds = await deviceService.getActiveDigitalMenuDevicesByCompany(
    companyId
  );
  deviceIds.forEach((deviceId) => {
    sendUpdateToDevice(deviceId, { type: "PRODUCT_UPDATE_NOTIFICATION" });
  });
};

const listCompaniesPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 8;
    const companyData = await companyService.getAllCompanies(page, limit);
    res.render("products_companies", {
      companies: companyData.companies,
      formatUtils,
      currentPage: companyData.currentPage,
      totalPages: companyData.totalPages,
    });
  } catch (err) {
    logger.error("Erro ao carregar a página de empresas com produtos.", err);
    res.status(500).send("Erro ao carregar a página.");
  }
};

const listProductsByCompanyPage = async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 8;
    const productData = await localProductService.getProductsByCompany(
      companyId,
      page,
      limit
    );

    res.render("products", {
      products: productData.products,
      currentPage: productData.currentPage,
      totalPages: productData.totalPages,
      companyId: productData.companyId,
      companyName: productData.companyName,
      formatUtils,
    });
  } catch (err) {
    logger.error(
      `Erro ao carregar produtos para a empresa ${req.params.companyId}.`,
      err
    );
    res.status(500).send("Erro ao carregar a página de produtos.");
  }
};

const deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await localProductService.getProductById(id);
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    await localProductService.deleteProduct(id);

    const { sendUpdateToDevice, broadcastToAdmins, sendNotificationToUser } =
      req.app.locals;
    notifyPlayers(product.company_id, { sendUpdateToDevice });

    sendNotificationToUser(req.user.id, {
      type: "OPERATION_SUCCESS",
      payload: {
        message: "Produto excluído com sucesso.",
      },
    });

    broadcastToAdmins({
      type: "PRODUCT_LIST_UPDATED",
      payload: { companyId: product.company_id },
    });

    const productData = await localProductService.getProductsByCompany(
      product.company_id,
      1,
      1
    );
    broadcastToAdmins({
      type: "PRODUCT_COUNT_UPDATED",
      payload: {
        companyId: product.company_id,
        productCount: productData.totalProducts,
      },
    });

    res.status(200).json({ message: "Produto excluído com sucesso." });
  } catch (err) {
    logger.error(`Erro ao excluir o produto ${id}.`, err);
    res.status(500).json({ message: "Erro ao excluir produto." });
  }
};

const triggerSyncForCompany = async (req, res) => {
  const { companyId } = req.params;
  try {
    await productSyncQueue.add("sync-single-company", {
      companyId: parseInt(companyId, 10),
    });
    res.status(202).json({
      message:
        "Sincronização da loja iniciada. Você será notificado quando terminar.",
    });
  } catch (err) {
    logger.error(
      `Erro ao adicionar job de sincronização para a empresa ${companyId}.`,
      err
    );
    res.status(500).json({ message: "Erro ao iniciar a sincronização." });
  }
};

const downloadTemplate = (req, res) => {
  const data = [["sysmo_product_code"], ["12345"], ["67890"]];
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Produtos");
  const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=template_importacao_produtos.xlsx"
  );
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
};

const uploadProducts = async (req, res) => {
  const { companyId } = req.params;
  if (!req.file) {
    return res.status(400).json({ message: "Nenhum arquivo enviado." });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const products = xlsx.utils.sheet_to_json(worksheet);

    if (
      !products.every((p) => "sysmo_product_code" in p && p.sysmo_product_code)
    ) {
      return res.status(400).json({
        message:
          "A planilha está fora do padrão. Verifique se a coluna 'sysmo_product_code' existe e está preenchida.",
      });
    }

    const productCodes = products.map((p) => String(p.sysmo_product_code));

    await productSyncQueue.add("import-products-from-sheet", {
      companyId: parseInt(companyId, 10),
      productCodes,
    });

    res.status(202).json({
      message: "Importação iniciada. Você será notificado quando terminar.",
    });
  } catch (error) {
    logger.error("Erro ao processar a planilha de produtos.", error);
    res.status(500).json({ message: "Erro interno ao processar o arquivo." });
  }
};

const previewSingleProduct = async (req, res) => {
  const { companyId, productCode } = req.params;
  try {
    const productData = await sysmoService.fetchProductFromSysmoByCode(
      productCode,
      companyId
    );
    if (!productData) {
      return res
        .status(404)
        .json({ message: "Produto não encontrado no Sysmo." });
    }
    res.status(200).json(productData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addSingleProduct = async (req, res) => {
  const { companyId } = req.params;
  const { productCode } = req.body;

  if (!productCode) {
    return res
      .status(400)
      .json({ message: "O código do produto é obrigatório." });
  }

  try {
    const productData = await sysmoService.fetchProductFromSysmoByCode(
      productCode,
      companyId
    );
    if (!productData) {
      return res.status(404).json({
        message: "Produto não encontrado no sistema Sysmo com este código.",
      });
    }

    const sectionMap = { 1: "AVES", 2: "BOVINO", 3: "SUINO" };

    const newProduct = await localProductService.addProduct({
      company_id: companyId,
      product_name: productData.dsc,
      sysmo_product_code: productCode,
      price: productData.pv2,
      section_id: productData.sec,
      section_name: sectionMap[productData.sec] || `SEÇÃO ${productData.sec}`,
    });

    const { broadcastToAdmins, sendNotificationToUser } = req.app.locals;
    sendNotificationToUser(req.user.id, {
      type: "OPERATION_SUCCESS",
      payload: {
        message: `Produto "${newProduct.product_name}" foi adicionado.`,
      },
    });

    broadcastToAdmins({
      type: "PRODUCT_ADDED",
      payload: newProduct,
    });

    const productsData = await localProductService.getProductsByCompany(
      companyId,
      1,
      1
    );
    broadcastToAdmins({
      type: "PRODUCT_COUNT_UPDATED",
      payload: {
        companyId: companyId,
        productCount: productsData.totalProducts,
      },
    });

    res.status(201).json({
      message: "Produto adicionado.",
      product: newProduct,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Este produto já existe nesta loja." });
    }
    logger.error(
      `Erro ao adicionar produto único com código ${productCode}.`,
      error
    );
    res.status(500).json({
      message: error.message || "Erro interno ao adicionar o produto.",
    });
  }
};

module.exports = {
  listCompaniesPage,
  listProductsByCompanyPage,
  deleteProduct,
  triggerSyncForCompany,
  downloadTemplate,
  uploadProducts,
  previewSingleProduct,
  addSingleProduct,
};
