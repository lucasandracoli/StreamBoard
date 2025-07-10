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

    const fileExtension = campaign.midia.split(".").pop().toLowerCase();
    const mediaUrl = campaign.midia;

    if (["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension)) {
      const img = document.createElement("img");
      img.src = mediaUrl;
      img.onerror = () => playNext();
      campaignContainer.appendChild(img);
      mediaTimer = setTimeout(playNext, 10000);
    } else if (["mp4", "webm", "mov"].includes(fileExtension)) {
      const video = document.createElement("video");
      video.src = mediaUrl;
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
      const response = await fetch("/api/device/playlist", {
        cache: "no-cache",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          wsManager.disconnect(false);
          if (playlistInterval) clearInterval(playlistInterval);
          window.location.href = "/pair?error=session_expired";
        }
        return;
      }

      playlist = await response.json();

      if (playlist.length > 0) {
        currentCampaignIndex = -1;
        playNext();
      } else {
        showWaitingScreen();
      }
    } catch (error) {
      console.error(
        "Falha ao buscar playlist. Tentando novamente em 10s.",
        error
      );
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
        const response = await fetch("/api/wsToken");
        if (response.status === 401 || response.status === 403) {
          this.disconnect(false);
          showWaitingScreen(
            "Sessão Inválida",
            "Redirecionando para autenticação...",
            "error"
          );
          setTimeout(() => {
            window.location.href = "/pair?error=session_expired";
          }, 4000);
          return;
        }

        if (!response.ok) {
          throw new Error("Servidor não está pronto.");
        }

        const data = await response.json();
        if (data && data.accessToken) {
          this.stopProbing();
          this.establishConnection(data.accessToken);
        }
      } catch (error) {
        // Erro de rede. O timer continua e tentará novamente.
      }
    }

    startProbing() {
      if (this.probeTimer || !this.shouldReconnect) return;
      showWaitingScreen(
        "Conexão Perdida",
        "Tentando reconectar ao servidor...",
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

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}?token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        fetchAndResetPlaylist();
      };

      this.ws.onmessage = (event) => {
        try {
          handleServerMessage(JSON.parse(event.data));
        } catch (e) {}
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.startProbing();
        }
      };

      this.ws.onerror = (err) => {
        this.ws.close();
      };
    }

    connect() {
      this.startProbing();
    }

    disconnect(shouldReconnect = true) {
      this.shouldReconnect = shouldReconnect;
      this.stopProbing();
      if (this.ws) {
        this.ws.close(1000, "Desconexão intencional.");
      }
    }
  }

  const wsManager = new WebSocketManager();
  wsManager.connect();

  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 45000);
});
