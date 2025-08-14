const { Queue } = require("bullmq");
const connection = require("./connection");

const productSyncQueue = new Queue("Product Sync", { connection });

module.exports = productSyncQueue;