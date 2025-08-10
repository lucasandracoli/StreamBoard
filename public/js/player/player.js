import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("paired")) {
    const notyf = new Notyf({
      duration: 5000,
      position: { x: "right", y: "top" },
      dismissible: true,
    });
    notyf.success("Dispositivo conectado com sucesso!");
    const newUrl = window.location.pathname;
    history.replaceState({}, document.title, newUrl);
  }

  const playerWrapper = document.getElementById("player-wrapper");
  let playlists = { main: [], secondary: [] };
  let currentIndices = { main: -1, secondary: -1 };
  let mediaTimers = { main: null, secondary: null };
  let playlistInterval = null;
  let weatherRetryInterval = null;
  let currentPlaylistETag = null;

  const showWaitingScreen = (
    title = "Aguardando Campanha",
    subtitle = "O player está online e pronto para receber conteúdo.",
    state = "info"
  ) => {
    Object.values(mediaTimers).forEach(clearTimeout);
    playerWrapper.innerHTML = "";
    playerWrapper.className = "player-wrapper-centered";

    const icons = {
      info: "bi-clock-history",
      reconnecting: "bi-wifi-off",
      error: "bi-shield-lock-fill",
    };
    const iconClass = icons[state] || "bi-info-circle-fill";
    const spinnerHtml =
      state === "reconnecting" ? '<div class="spinner"></div>' : "";
    playerWrapper.innerHTML = `
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

  const setupLayout = (layoutType = "fullscreen") => {
    playerWrapper.innerHTML = "";
    playerWrapper.className = `player-wrapper layout-${layoutType}`;

    const mainZone = document.createElement("div");
    mainZone.id = "zone-main";
    mainZone.className = "player-zone";

    const secondaryZone = document.createElement("div");
    secondaryZone.id = "zone-secondary";
    secondaryZone.className = "player-zone";

    if (layoutType.startsWith("split-80-20")) {
      playerWrapper.appendChild(mainZone);
      playerWrapper.appendChild(secondaryZone);
    } else {
      playerWrapper.appendChild(mainZone);
    }
  };

  const displayMediaInZone = (zone) => {
    if (mediaTimers[zone]) clearTimeout(mediaTimers[zone]);
    const zoneContainer = document.getElementById(`zone-${zone}`);
    if (!zoneContainer) return;

    zoneContainer.innerHTML = "";

    const playlist = playlists[zone];
    if (!playlist || playlist.length === 0) {
      zoneContainer.style.backgroundColor = "#000";
      return;
    }

    currentIndices[zone] = (currentIndices[zone] + 1) % playlist.length;
    const campaign = playlist[currentIndices[zone]];

    if (!campaign || !campaign.file_path) {
      playNextInZone(zone);
      return;
    }

    const url = campaign.file_path;
    const isImage = campaign.file_type.startsWith("image/");
    const isVideo = campaign.file_type.startsWith("video/");

    if (isImage) {
      const img = document.createElement("img");
      img.src = url;
      img.onerror = () => playNextInZone(zone);
      zoneContainer.appendChild(img);
      const duration = (campaign.duration || 10) * 1000;
      mediaTimers[zone] = setTimeout(() => playNextInZone(zone), duration);
    } else if (isVideo) {
      const video = document.createElement("video");
      video.src = url;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.onended = () => playNextInZone(zone);
      video.onerror = () => playNextInZone(zone);
      zoneContainer.appendChild(video);
    } else {
      playNextInZone(zone);
    }
  };

  const playNextInZone = (zone) => {
    displayMediaInZone(zone);
  };

  const fetchWeather = async () => {
    try {
      const res = await fetch("/api/device/weather");
      if (!res.ok) {
        throw new Error("Falha ao buscar dados do clima.");
      }
      const { weather, city } = await res.json();
      if (weather) {
        renderWeather(weather, city);
        if (weatherRetryInterval) {
          clearInterval(weatherRetryInterval);
          weatherRetryInterval = null;
        }
      }
    } catch (err) {
      console.error(err.message);
    }
  };

  const startPlayback = (data) => {
    Object.values(mediaTimers).forEach(clearTimeout);
    if (weatherRetryInterval) {
      clearInterval(weatherRetryInterval);
      weatherRetryInterval = null;
    }

    if (!data) {
      playlists = { main: [], secondary: [] };
      showWaitingScreen();
      return;
    }

    setupLayout(data.layout_type);

    playlists.main = (data.uploads || []).filter(
      (u) => u.zone === "main" || !u.zone
    );
    playlists.secondary = (data.uploads || []).filter(
      (u) => u.zone === "secondary"
    );
    currentIndices = { main: -1, secondary: -1 };

    if (data.layout_type === "split-80-20-weather") {
      renderWeather(data.weather, data.city);
      if (!data.weather) {
        weatherRetryInterval = setInterval(fetchWeather, 30000);
      }
    } else if (playlists.secondary.length > 0) {
      playNextInZone("secondary");
    }

    if (playlists.main.length > 0) {
      playNextInZone("main");
    }

    const mainZone = document.getElementById("zone-main");
    if (playlists.main.length === 0 && mainZone) {
      mainZone.innerHTML = "";
    }

    if (
      playlists.main.length === 0 &&
      playlists.secondary.length === 0 &&
      data.layout_type !== "split-80-20-weather"
    ) {
      showWaitingScreen();
    }
  };

  const getWeatherIcon = (code) => {
    if (code >= 200 && code < 300) return "bi-cloud-lightning-rain-fill";
    if (code >= 300 && code < 400) return "bi-cloud-drizzle-fill";
    if (code >= 500 && code < 600) return "bi-cloud-rain-heavy-fill";
    if (code >= 600 && code < 700) return "bi-cloud-snow-fill";
    if (code >= 700 && code < 800) return "bi-cloud-fog2-fill";
    if (code === 800) return "bi-sun-fill";
    if (code === 801) return "bi-cloud-sun-fill";
    if (code > 801 && code < 805) return "bi-cloud-fill";
    return "bi-thermometer-half";
  };

  const renderWeather = (weatherData, city) => {
    const weatherContainer = document.getElementById("zone-secondary");
    if (!weatherContainer) return;
    if (!weatherData) {
      weatherContainer.innerHTML =
        '<div class="weather-widget"><div class="weather-error">Clima indisponível</div></div>';
      return;
    }

    const { current, daily } = weatherData;
    const temp = Math.round(current.temperature_2m);
    const maxTemp = Math.round(daily.temperature_2m_max[0]);
    const minTemp = Math.round(daily.temperature_2m_min[0]);
    const iconClass = getWeatherIcon(current.weather_code);

    const weatherHtml = `
      <div class="weather-widget">
        <div class="weather-city">${city || ""}</div>
        <i class="bi ${iconClass} weather-icon"></i>
        <div class="weather-temp">${temp}°C</div>
        <div class="weather-minmax">
          <i class="bi bi-arrow-up"></i> ${maxTemp}° <i class="bi bi-arrow-down"></i> ${minTemp}°
        </div>
      </div>
    `;
    weatherContainer.innerHTML = weatherHtml;
  };

  const fetchAndResetPlaylist = async (force = false) => {
    const headers = {};
    if (currentPlaylistETag && !force) {
      headers["If-None-Match"] = currentPlaylistETag;
    }

    try {
      const res = await fetch("/api/device/playlist", { headers });

      if (res.status === 304) {
        return;
      }

      if (res.status === 401 || res.status === 403) {
        wsManager.disconnect(false);
        if (playlistInterval) clearInterval(playlistInterval);
        window.location.href = "/pair?error=session_expired";
        return;
      }
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      currentPlaylistETag = res.headers.get("ETag");
      const data = await res.json();
      startPlayback(data);
    } catch (err) {
      showWaitingScreen(
        "Erro ao carregar",
        "Não foi possível buscar a playlist. Tentando novamente...",
        "error"
      );
      setTimeout(() => fetchAndResetPlaylist(true), 10000);
    }
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "CONNECTION_ESTABLISHED":
        fetchAndResetPlaylist(true);
        if (playlistInterval) clearInterval(playlistInterval);
        playlistInterval = setInterval(fetchAndResetPlaylist, 30 * 60 * 1000);
        break;
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        fetchAndResetPlaylist(true);
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect(false);
        if (playlistInterval) clearInterval(playlistInterval);
        if (weatherRetryInterval) clearInterval(weatherRetryInterval);
        window.location.href = "/pair?error=revoked";
        break;
      case "FORCE_REFRESH":
        wsManager.disconnect(false);
        window.location.reload(true);
        break;
      case "TYPE_CHANGED":
        wsManager.disconnect(false);
        if (weatherRetryInterval) clearInterval(weatherRetryInterval);
        window.location.href =
          data.payload.newType === "terminal_consulta" ? "/price" : "/player";
        break;
    }
  };

  const wsManager = new DeviceConnector({
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
});
