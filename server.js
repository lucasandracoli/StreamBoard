require("dotenv").config();
const express = require("express");
const http = require("http");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const dbPool = require("./config/streamboard");
const bodyParser = require("body-parser");
const { Settings } = require("luxon");
const cookieParser = require("cookie-parser");
const path = require("path");
const mainRouter = require("./src/routes");
const webSocketManager = require("./src/websocket/manager");
const productSyncQueue = require("./src/jobs/productSyncQueue");
const logger = require("./src/utils/logger");
const { QueueEvents } = require("bullmq");
const connection = require("./src/jobs/connection");
const localProductService = require("./src/services/localProduct.service");

Settings.defaultZone = "America/Sao_Paulo";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const sessionStore = new pgSession({
  pool: dbPool,
  tableName: "user_sessions",
  createTableIfMissing: true,
});

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});

webSocketManager.initializeWebSocket(server, sessionMiddleware);

app.locals.wss = webSocketManager.getWss();
app.locals.clients = webSocketManager.getClients();
app.locals.sendUpdateToDevice = webSocketManager.sendUpdateToDevice;
app.locals.broadcastToAdmins = webSocketManager.broadcastToAdmins;
app.locals.sendNotificationToUser = webSocketManager.sendNotificationToUser;

app.use(cookieParser());
app.use(sessionMiddleware);

const packageJson = require("./package.json");
app.use((req, res, next) => {
  res.locals.appVersion = packageJson.version;
  res.locals.currentRoute = req.path;
  next();
});

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use("/", mainRouter);

const queueEvents = new QueueEvents("Product Sync", { connection });

queueEvents.on("completed", async ({ jobId, returnvalue }) => {
  const job = await productSyncQueue.getJob(jobId);
  if (!job) return;

  const { companyId } = job.data;
  let message = "";

  if (job.name === "sync-single-company") {
    const { updatedCount } = returnvalue;
    message = `Sincronização concluída! ${updatedCount} produtos foram atualizados.`;
  } else if (job.name === "import-products-from-sheet") {
    const { importedCount } = returnvalue;
    message = `Importação concluída! ${importedCount} produtos foram importados/atualizados.`;
  }

  if (message) {
    webSocketManager.broadcastToAdmins({
      type: "PRODUCT_OPERATION_SUCCESS",
      payload: { companyId, message },
    });
  }

  const productData = await localProductService.getProductsByCompany(
    companyId,
    1,
    1
  );
  webSocketManager.broadcastToAdmins({
    type: "PRODUCT_COUNT_UPDATED",
    payload: {
      companyId: companyId,
      productCount: productData.totalProducts,
    },
  });
});

queueEvents.on("failed", async ({ jobId, failedReason }) => {
  logger.error(`Job ${jobId} falhou: ${failedReason}`);
  const job = await productSyncQueue.getJob(jobId);
  if (!job) return;

  const { companyId } = job.data;
  webSocketManager.broadcastToAdmins({
    type: "PRODUCT_OPERATION_FAILURE",
    payload: {
      companyId,
      message: "A operação em segundo plano falhou. Verifique os logs.",
    },
  });
});

const scheduleHourlySync = async () => {
  await productSyncQueue.removeRepeatableByKey(
    "sync-all-companies:hourly:0 * * * *:"
  );

  await productSyncQueue.add(
    "sync-all-companies",
    {},
    {
      repeat: {
        cron: "0 * * * *",
      },
      jobId: "sync-all-hourly",
    }
  );

  logger.info(
    "Job de sincronização de produtos agendado para rodar a cada hora."
  );
};

server.listen(PORT, () => {
  logger.info(`🔥 Server Running in http://127.0.0.1:${PORT}`);
  scheduleHourlySync();
});
