const campeaoService = require("../services/campeao.service");
const productServiceFactory = require("../services/product.service");
const productService = productServiceFactory(campeaoService);
const logger = require("../utils/logger");

const getProduct = async (req, res) => {
  const { barcode } = req.params;
  try {
    const product = await productService.getProductByBarcode(barcode);
    if (!product) {
      return res
        .status(404)
        .json({ message: "Produto não encontrado no banco." });
    }
    res.json(product);
  } catch (err) {
    logger.error(
      `Erro ao buscar produto com código de barras ${barcode}.`,
      err
    );
    res.status(500).json({ message: "Erro ao buscar produto." });
  }
};

const addSector = async (req, res) => {
  res.status(501).json({ message: "Not implemented. See company routes." });
};

const deleteSector = async (req, res) => {
  res.status(501).json({ message: "Not implemented. See company routes." });
};

module.exports = {
  getProduct,
};
