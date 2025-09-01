const db = require("../../config/streamboard");

const getCompaniesWithProducts = async (page = 1, limit = 8) => {
  const offset = (page - 1) * limit;
  const query = `
        SELECT DISTINCT c.id, c.name, c.cnpj
        FROM companies c
        JOIN butcher_products bp ON c.id = bp.company_id
        ORDER BY c.name
        LIMIT $1 OFFSET $2;
    `;

  const countQuery = `SELECT COUNT(DISTINCT c.id) FROM companies c JOIN butcher_products bp ON c.id = bp.company_id;`;

  const companiesResult = await db.query(query, [limit, offset]);
  const countResult = await db.query(countQuery);

  const totalCompanies = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalCompanies / limit);

  return {
    companies: companiesResult.rows,
    totalPages,
    currentPage: page,
  };
};

const getProductById = async (id) => {
  const result = await db.query(
    "SELECT * FROM butcher_products WHERE id = $1",
    [id]
  );
  return result.rows[0];
};

const getProductsByCompany = async (companyId, page = 1, limit = 8) => {
  const offset = (page - 1) * limit;

  const productsQuery = `
        SELECT p.id, p.product_name, p.price, p.section_name, p.last_updated, c.name as company_name
        FROM butcher_products p
        JOIN companies c ON p.company_id = c.id
        WHERE p.company_id = $1
        ORDER BY p.section_name, p.product_name
        LIMIT $2 OFFSET $3;
    `;

  const countQuery = `SELECT COUNT(*) FROM butcher_products WHERE company_id = $1;`;

  const productsResult = await db.query(productsQuery, [
    companyId,
    limit,
    offset,
  ]);
  const countResult = await db.query(countQuery, [companyId]);
  const companyResult = await db.query(
    "SELECT name FROM companies WHERE id = $1",
    [companyId]
  );

  const totalProducts = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalProducts / limit);
  const companyName =
    companyResult.rows.length > 0
      ? companyResult.rows[0].name
      : "Loja não encontrada";

  return {
    products: productsResult.rows,
    totalPages: totalPages,
    currentPage: page,
    companyId: companyId,
    companyName: companyName,
  };
};

const deleteProduct = async (id) => {
  const result = await db.query("DELETE FROM butcher_products WHERE id = $1", [
    id,
  ]);
  return result.rowCount;
};

const addProduct = async (productData) => {
  const {
    company_id,
    product_name,
    sysmo_product_code,
    price,
    section_id,
    section_name,
  } = productData;
  const query = `
        INSERT INTO butcher_products (company_id, product_name, sysmo_product_code, price, section_id, section_name, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *;
    `;
  const result = await db.query(query, [
    company_id,
    product_name,
    sysmo_product_code,
    price,
    section_id,
    section_name,
  ]);
  return result.rows[0];
};

const upsertProductsFromSheet = async (products, companyId) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const sectionMap = { 1: "AVES", 2: "BOVINO", 3: "SUINO" };

    for (const product of products) {
      const sectionName =
        sectionMap[product.section_id] || `SEÇÃO ${product.section_id}`;
      const query = `
                INSERT INTO butcher_products (company_id, product_name, sysmo_product_code, price, section_id, section_name, last_updated)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (company_id, sysmo_product_code) 
                DO UPDATE SET product_name = EXCLUDED.product_name, price = EXCLUDED.price, section_id = EXCLUDED.section_id, section_name = EXCLUDED.section_name, last_updated = NOW();
            `;
      await client.query(query, [
        companyId,
        product.product_name,
        product.sysmo_product_code,
        product.price,
        product.section_id,
        sectionName,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getCompaniesWithProducts,
  getProductById,
  getProductsByCompany,
  deleteProduct,
  addProduct,
  upsertProductsFromSheet,
};
