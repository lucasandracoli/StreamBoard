const db = require("../../config/streamboard");
const logger = require("../utils/logger");

const getButcherProducts = async (companyId) => {
  if (!companyId) {
    logger.error(
      "ID da empresa não fornecido para a busca de produtos do açougue."
    );
    return [];
  }

  const query = `
    SELECT product_name, price, section_name
    FROM butcher_products
    WHERE company_id = $1
    ORDER BY section_id, product_name;
  `;

  try {
    const result = await db.query(query, [companyId]);

    const productsByCategory = result.rows.reduce((acc, product) => {
      const category = product.section_name;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        name: product.product_name,
        price: parseFloat(product.price).toFixed(2).replace(".", ","),
      });
      return acc;
    }, {});

    return Object.keys(productsByCategory).map((category) => ({
      type: "products",
      category: category,
      products: productsByCategory[category],
      duration: 15000,
    }));
  } catch (err) {
    logger.error(
      `Erro ao buscar produtos locais do açougue para a empresa ${companyId}.`,
      err
    );
    return [];
  }
};

module.exports = {
  getButcherProducts,
};
