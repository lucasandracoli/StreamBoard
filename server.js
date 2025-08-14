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
const productSyncService = require("./src/services/productSync.service");

const logger = {
  info: (message) => {
    console.log(`[${new Date().toISOString()}] [INFO] ${message}`);
  },
  error: (message, error) => {
    console.error(
      `[${new Date().toISOString()}] [ERROR] ${message}`,
      error || ""
    );
  },
};

Settings.defaultZone = "America/Sao_Paulo";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

webSocketManager.initializeWebSocket(server);

app.locals.wss = webSocketManager.getWss();
app.locals.clients = webSocketManager.getClients();
app.locals.sendUpdateToDevice = webSocketManager.sendUpdateToDevice;
app.locals.broadcastToAdmins = webSocketManager.broadcastToAdmins;

app.use(cookieParser());

const sessionStore = new pgSession({
  pool: dbPool,
  tableName: "user_sessions",
  createTableIfMissing: true,
});

app.use(
  session({
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
  })
);

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

const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const startProductSyncScheduler = () => {
  productSyncService.syncAllProducts();
  setInterval(() => {
    productSyncService.syncAllProducts();
  }, ONE_HOUR_IN_MS);
};

server.listen(PORT, () => {
  logger.info(`🔥 Server Running in http://127.0.0.1:${PORT}`);
  startProductSyncScheduler();
});