require("dotenv").config();
const express = require("express");
const http = require("http");
const session = require("express-session");
const bodyParser = require("body-parser");
const { Settings } = require("luxon");
const cookieParser = require("cookie-parser");
const path = require("path");
const mainRouter = require("./src/routes");
const webSocketManager = require("./src/websocket/manager");
const campaignScheduler = require("./src/services/campaignScheduler.service");
const logger = require("./src/utils/logger");

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
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
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

server.listen(PORT, () => {
  logger.info(`🔥 Server Running in http://127.0.0.1:${PORT}`);
  campaignScheduler.initializeScheduler(webSocketManager.broadcastToAdmins);
});
