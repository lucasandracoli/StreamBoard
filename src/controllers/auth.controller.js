const authService = require("../services/auth.service");
const logger = require("../utils/logger");

const renderLoginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }
  // A notificação agora é tratada pelo script do lado do cliente
  res.render("login");
};

const handleLogin = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      message: "Usuário e senha são obrigatórios.",
    });
  }

  try {
    const user = await authService.findAndValidateUser(username, password);
    if (user) {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.userRole = user.user_role;
      return res.status(200).json({
        message: "Logado com Sucesso.",
      });
    }
    return res.status(401).json({
      message: "Usuário ou senha incorretos.",
    });
  } catch (err) {
    logger.error("Erro no processo de login.", err);
    res.status(500).json({
      message: "Erro interno do servidor.",
    });
  }
};

const handleLogout = (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (refreshToken) {
    authService.revokeRefreshToken(refreshToken);
  }
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  req.session.destroy(() => {
    res.redirect("/login?logout=true");
  });
};

module.exports = {
  renderLoginPage,
  handleLogin,
  handleLogout,
};
