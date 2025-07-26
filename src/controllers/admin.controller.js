const rootRedirect = (req, res) => {
    if (req.session.userId) {
        res.redirect("/dashboard");
    } else {
        res.redirect("/login");
    }
};

const renderDashboard = (req, res) => {
    res.render("dashboard", { user: req.user });
};

const broadcastRefresh = (req, res) => {
    const { wss } = req.app.locals;
    const message = JSON.stringify({ type: "FORCE_REFRESH" });
    wss.clients.forEach((ws) => {
        if (ws.isAlive) {
            ws.send(message);
        }
    });
    res.status(200).json({ message: "Comando de atualização enviado a todos os players." });
};

module.exports = {
    rootRedirect,
    renderDashboard,
    broadcastRefresh
};