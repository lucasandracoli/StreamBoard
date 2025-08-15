const streamboardDb = require("../../config/streamboard");
const sysmoService = require("../services/sysmo.service");
const companyService = require("./company.service");
const logger = require("../utils/logger");

const syncProductsForCompany = async (companyId) => {
  const client = await streamboardDb.connect();
  let updatedCount = 0;

  try {
    logger.info(
      `Iniciando sincronização de produtos para a empresa ${companyId}...`
    );

    const localProductsResult = await client.query(
      "SELECT id, sysmo_product_code FROM butcher_products WHERE company_id = $1",
      [companyId]
    );
    const localProducts = localProductsResult.rows;

    if (localProducts.length === 0) {
      logger.info(
        `Nenhum produto local encontrado para a empresa ${companyId}. Sincronização encerrada.`
      );
      return { updatedCount: 0 };
    }

    await client.query("BEGIN");

    for (const localProduct of localProducts) {
      const productCode = localProduct.sysmo_product_code;

      if (!productCode) {
        logger.warn(
          `Sincronização ignorada para o produto com ID ${localProduct.id}. O código Sysmo não foi encontrado.`
        );
        continue;
      }

      console.log(
        `[DEBUG] SYNC: Buscando produto do Sysmo com código: ${productCode}`
      );

      const sysmoData = await sysmoService.fetchProductFromSysmoByCode(
        productCode,
        companyId
      );

      if (sysmoData) {
        await client.query(
          "UPDATE butcher_products SET price = $1, last_updated = NOW() WHERE id = $2",
          [sysmoData.pv2, localProduct.id]
        );
        updatedCount++;
      }
    }

    await client.query("COMMIT");
    logger.info(
      `Sincronização para a empresa ${companyId} concluída. ${updatedCount} produtos foram atualizados.`
    );
    return { updatedCount };
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(
      `Erro ao sincronizar produtos para a empresa ${companyId}.`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
};

const syncAllProducts = async () => {
  logger.info(
    "Iniciando a rotina de sincronização de produtos para todas as empresas..."
  );
  let totalUpdated = 0;
  try {
    const companies = await companyService.getAllCompanies();
    if (companies.length === 0) {
      logger.info(
        "Nenhuma empresa cadastrada para a sincronização automática."
      );
      return;
    }

    for (const company of companies) {
      const result = await syncProductsForCompany(company.id);
      totalUpdated += result.updatedCount;
    }
    logger.info(
      "Rotina de sincronização de produtos para todas as empresas finalizada."
    );
    return { totalUpdated };
  } catch (error) {
    logger.error(
      "Ocorreu um erro geral durante a rotina de sincronização de produtos.",
      error
    );
  }
};

module.exports = { syncAllProducts, syncProductsForCompany };
