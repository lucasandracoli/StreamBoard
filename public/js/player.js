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
          wsManager.disconnect();
          if (playlistInterval) clearInterval(playlistInterval);
          window.location.href = "/pair?error=session_expired";
        }
        return;
      }
      const newPlaylist = await response.json();
      const isPlaylistDifferent =
        JSON.stringify(playlist.map((p) => p.id)) !==
        JSON.stringify(newPlaylist.map((p) => p.id));

      if (isPlaylistDifferent) {
        playlist = newPlaylist;
        currentCampaignIndex = -1;
        playNext();
      } else if (playlist.length === 0) {
        showWaitingScreen();
      }
    } catch (error) {}
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        fetchAndResetPlaylist();
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect();
        if (playlistInterval) clearInterval(playlistInterval);
        window.location.href = "/pair?error=revoked";
        break;
      case "FORCE_REFRESH":
        wsManager.disconnect();
        window.location.reload(true);
        break;
    }
  };

  class WebSocketManager {
    constructor() {
      this.ws = null;
      this.reconnectAttempts = 0;
      this.maxReconnectDelay = 30000;
      this.shouldReconnect = true;
    }

    async getToken() {
      try {
        const response = await fetch("/api/wsToken");
        if (!response.ok)
          throw new Error("Falha ao obter token de autenticação.");
        const data = await response.json();
        return data.accessToken;
      } catch (error) {
        showWaitingScreen(
          "Falha de Autenticação",
          "Não foi possível validar o dispositivo. Redirecionando...",
          "error"
        );
        setTimeout(() => {
          window.location.href = "/pair?error=token_fetch_failed";
        }, 4000);
        return null;
      }
    }

    async connect() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

      this.shouldReconnect = true;
      const token = await this.getToken();

      if (!token) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}?token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        fetchAndResetPlaylist();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (e) {}
      };

      this.ws.onclose = (event) => {
        if (!this.shouldReconnect) return;
        showWaitingScreen(
          "Conexão Perdida",
          "Tentando reconectar ao servidor...",
          "reconnecting"
        );
        const delay = Math.min(
          1000 * Math.pow(2, this.reconnectAttempts),
          this.maxReconnectDelay
        );
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), delay);
      };

      this.ws.onerror = (error) => {
        this.ws.close();
      };
    }

    disconnect() {
      this.shouldReconnect = false;
      if (this.ws) {
        this.ws.close(1000, "Desconexão intencional.");
      }
    }
  }

  const wsManager = new WebSocketManager();
  wsManager.connect();

  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 60000);
});
