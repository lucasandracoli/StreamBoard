// player.js
document.addEventListener("DOMContentLoaded", () => {
  const campaignContainer = document.getElementById("campaign-container");
  let playlist = [];
  let currentCampaignIndex = -1;
  let mediaTimer = null;
  let playlistInterval = null;

  const showWaitingScreen = (
    title = "Aguardando Campanha",
    subtitle = "O player está online e pronto para receber conteúdo.",
    state = "info"
  ) => {
    if (mediaTimer) clearTimeout(mediaTimer);
    campaignContainer.style.backgroundColor = "var(--color-background)";
    const icons = {
      info: "bi-clock-history",
      reconnecting: "bi-wifi-off",
      error: "bi-shield-lock-fill",
    };
    const iconClass = icons[state] || "bi-info-circle-fill";
    const spinnerHtml =
      state === "reconnecting" ? '<div class="spinner"></div>' : "";
    campaignContainer.innerHTML = `
      <div class="player-message-card ${state}">
        <i class="icon bi ${iconClass}"></i>
        <div class="message-content">
          <p class="message-title">${title}</p>
          <p class="message-subtitle">${subtitle}</p>
        </div>
        ${spinnerHtml}
      </div>
    `;
  };

  const displayMedia = (campaign) => {
    if (mediaTimer) clearTimeout(mediaTimer);
    campaignContainer.innerHTML = "";
    campaignContainer.style.backgroundColor = "#000";
    if (!campaign || !campaign.midia) {
      playNext();
      return;
    }
    const ext = campaign.midia.split(".").pop().toLowerCase();
    const url = campaign.midia;
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      const img = document.createElement("img");
      img.src = url;
      img.onerror = () => playNext();
      campaignContainer.appendChild(img);
      mediaTimer = setTimeout(playNext, 10000);
    } else if (["mp4", "webm", "mov"].includes(ext)) {
      const video = document.createElement("video");
      video.src = url;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.onended = playNext;
      video.onerror = () => playNext();
      campaignContainer.appendChild(video);
    } else {
      playNext();
    }
  };

  const playNext = () => {
    if (playlist.length === 0) {
      showWaitingScreen();
      return;
    }
    currentCampaignIndex = (currentCampaignIndex + 1) % playlist.length;
    displayMedia(playlist[currentCampaignIndex]);
  };

  const fetchAndResetPlaylist = async () => {
    try {
      const res = await fetch("/api/device/playlist", { cache: "no-cache" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          wsManager.disconnect(false);
          if (playlistInterval) clearInterval(playlistInterval);
          window.location.href = "/pair?error=session_expired";
        }
        return;
      }
      playlist = await res.json();
      if (playlist.length > 0) {
        currentCampaignIndex = -1;
        playNext();
      } else {
        showWaitingScreen();
      }
    } catch {
      setTimeout(fetchAndResetPlaylist, 10000);
    }
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        fetchAndResetPlaylist();
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect(false);
        if (playlistInterval) clearInterval(playlistInterval);
        window.location.href = "/pair?error=revoked";
        break;
      case "FORCE_REFRESH":
        wsManager.disconnect(false);
        window.location.reload(true);
        break;
      case "TYPE_CHANGED":
        wsManager.disconnect(false);
        window.location.href =
          data.payload.newType === "busca_preco" ? "/price" : "/player";
        break;
    }
  };

  class WebSocketManager {
    constructor() {
      this.ws = null;
      this.probeTimer = null;
      this.probeInterval = 5000;
      this.shouldReconnect = true;
    }
    async probeAndConnect() {
      try {
        const res = await fetch("/api/wsToken");
        if (res.status === 401 || res.status === 403) {
          this.disconnect(false);
          showWaitingScreen("Sessão Inválida", "Redirecionando...", "error");
          setTimeout(
            () => (window.location.href = "/pair?error=session_expired"),
            4000
          );
          return;
        }
        if (!res.ok) throw new Error();
        const { accessToken } = await res.json();
        this.stopProbing();
        this.establishConnection(accessToken);
      } catch {}
    }
    startProbing() {
      if (this.probeTimer || !this.shouldReconnect) return;
      showWaitingScreen(
        "Conexão Perdida",
        "Tentando reconectar...",
        "reconnecting"
      );
      this.probeAndConnect();
      this.probeTimer = setInterval(
        () => this.probeAndConnect(),
        this.probeInterval
      );
    }
    stopProbing() {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    establishConnection(token) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${protocol}//${location.host}?token=${token}`);
      this.ws.onopen = fetchAndResetPlaylist;
      this.ws.onmessage = (e) => {
        try {
          handleServerMessage(JSON.parse(e.data));
        } catch {}
      };
      this.ws.onclose = () => {
        if (this.shouldReconnect) this.startProbing();
      };
      this.ws.onerror = () => this.ws.close();
    }
    connect() {
      this.startProbing();
    }
    disconnect(shouldReconnect = true) {
      this.shouldReconnect = shouldReconnect;
      this.stopProbing();
      if (this.ws) this.ws.close(1000, "Intentional");
    }
  }

  const wsManager = new WebSocketManager();
  wsManager.connect();
  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 45000);
});
