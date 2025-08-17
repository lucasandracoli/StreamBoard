const db = require("../../config/streamboard");
const logger = require("../utils/logger");

const getAllCompanies = async (page, limit) => {
  if (page && limit) {
    const offset = (page - 1) * limit;
    const query = `
    SELECT id, name, cnpj, address, city, state, cep 
    FROM companies 
    ORDER BY name ASC
    LIMIT $1 OFFSET $2`;

    const countQuery = `SELECT COUNT(*) FROM companies;`;

    const companiesResult = await db.query(query, [limit, offset]);
    const countResult = await db.query(countQuery);
    const totalCompanies = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalCompanies / limit);

    return {
      companies: companiesResult.rows,
      totalPages: totalPages,
      currentPage: page,
    };
  } else {
    const result = await db.query(
      "SELECT id, name, cnpj, address, city, state, cep FROM companies ORDER BY name ASC"
    );
    return result.rows;
  }
};

const getCompanyById = async (id) => {
  const result = await db.query(
    "SELECT id, name, cnpj, address, city, state, cep FROM companies WHERE id = $1",
    [id]
  );
  return result.rows[0];
};

const createCompanyWithSectors = async (companyData, sectors) => {
  const { name, cnpj, city, address, state, cep } = companyData;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const companyResult = await client.query(
      "INSERT INTO companies (name, cnpj, city, address, state, cep) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [name, cnpj, city, address, state, cep]
    );
    const newCompanyId = companyResult.rows[0].id;

    if (sectors && Array.isArray(sectors) && sectors.length > 0) {
      for (const sectorName of sectors) {
        await client.query(
          "INSERT INTO sectors (name, company_id) VALUES ($1, $2)",
          [sectorName, newCompanyId]
        );
      }
    }
    await client.query("COMMIT");
    return { success: true, companyId: newCompanyId };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro ao cadastrar empresa no serviço.", err);
    throw err;
  } finally {
    client.release();
  }
};

const updateCompany = async (id, companyData) => {
  const { name, cnpj, city, address, state, cep } = companyData;
  await db.query(
    "UPDATE companies SET name = $1, cnpj = $2, city = $3, address = $4, state = $5, cep = $6 WHERE id = $7",
    [name, cnpj, city, address, state, cep, id]
  );
};

const deleteCompany = async (id) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM butcher_products WHERE company_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM companies WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`Erro ao excluir empresa ${id} e dados associados.`, err);
    throw err;
  } finally {
    client.release();
  }
};

const getSectorsByCompanyId = async (companyId) => {
  const result = await db.query(
    "SELECT id, name FROM sectors WHERE company_id = $1 ORDER BY name",
    [companyId]
  );
  return result.rows;
};

const getDevicesByCompanyId = async (companyId) => {
  const result = await db.query(
    "SELECT id, name FROM devices WHERE company_id = $1 AND is_active = TRUE ORDER BY name",
    [companyId]
  );
  return result.rows;
};

const createSector = async (company_id, name) => {
  const result = await db.query(
    "INSERT INTO sectors (company_id, name) VALUES ($1, $2) RETURNING *",
    [company_id, name]
  );
  return result.rows[0];
};

const deleteSector = async (sectorId) => {
  const devicesCountResult = await db.query(
    "SELECT COUNT(*) FROM devices WHERE sector_id = $1",
    [sectorId]
  );
  const devicesCount = parseInt(devicesCountResult.rows[0].count, 10);
  if (devicesCount > 0) {
    const error = new Error(
      "Não é possível excluir este setor pois existem dispositivos associados a ele."
    );
    error.statusCode = 400;
    throw error;
  }
  await db.query("DELETE FROM sectors WHERE id = $1", [sectorId]);
};

module.exports = {
  getAllCompanies,
  getCompanyById,
  createCompanyWithSectors,
  updateCompany,
  deleteCompany,
  getSectorsByCompanyId,
  getDevicesByCompanyId,
  createSector,
  deleteSector,
};