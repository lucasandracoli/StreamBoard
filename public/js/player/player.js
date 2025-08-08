import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('paired')) {
    const notyf = new Notyf({
      duration: 5000,
      position: { x: 'right', y: 'top' },
      dismissible: true
    });
    notyf.success('Dispositivo conectado com sucesso!');
    const newUrl = window.location.pathname;
    history.replaceState({}, document.title, newUrl);
  }

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

    if (!campaign || !campaign.file_path) {
      playNext();
      return;
    }

    const url = campaign.file_path;
    const isImage = campaign.file_type.startsWith("image/");
    const isVideo = campaign.file_type.startsWith("video/");

    if (isImage) {
      const img = document.createElement("img");
      img.src = url;
      img.onerror = () => playNext();
      campaignContainer.appendChild(img);
      const duration = (campaign.duration || 10) * 1000;
      mediaTimer = setTimeout(playNext, duration);
    } else if (isVideo) {
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

      const campaigns = await res.json();

      playlist = campaigns.filter(
        (campaign) => campaign.file_path && campaign.file_path.trim() !== ""
      );

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
          data.payload.newType === "terminal_consulta" ? "/price" : "/player";
        break;
    }
  };

  const wsManager = new DeviceConnector({
    onOpen: fetchAndResetPlaylist,
    onMessage: handleServerMessage,
    onReconnecting: () => {
      showWaitingScreen(
        "Conexão Perdida",
        "Tentando reconectar...",
        "reconnecting"
      );
    },
    onAuthFailure: () => {
      showWaitingScreen("Sessão Inválida", "Redirecionando...", "error");
      setTimeout(
        () => (window.location.href = "/pair?error=session_expired"),
        4000
      );
    },
  });

  wsManager.connect();
  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 45000);
});