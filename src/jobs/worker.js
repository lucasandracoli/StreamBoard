require("dotenv").config();
const { Worker } = require("bullmq");
const connection = require("./connection");
const productSyncService = require("../services/productSync.service");
const logger = require("../utils/logger");

const worker = new Worker(
  "Product Sync",
  async (job) => {
    logger.info(`Processando job '${job.name}' com dados:`, job.data);
    try {
      if (job.name === "sync-all-companies") {
        return await productSyncService.syncAllProducts();
      } else if (job.name === "sync-single-company") {
        return await productSyncService.syncProductsForCompany(
          job.data.companyId
        );
      }
    } catch (error) {
      logger.error(
        `Falha ao processar job '${job.name}' (ID: ${job.id}).`,
        error
      );
      throw error;
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  logger.info(`Job '${job.name}' (ID: ${job.id}) concluído com sucesso.`);
});

worker.on("failed", (job, err) => {
  logger.error(
    `Job '${job.name}' (ID: ${job.id}) falhou. Erro: ${err.message}`
  );
});

logger.info(
  "🚀 Worker de sincronização de produtos iniciado e aguardando jobs..."
);
