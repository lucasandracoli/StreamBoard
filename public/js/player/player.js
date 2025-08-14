import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isNewlyPaired = urlParams.has("paired");

  if (isNewlyPaired) {
    const newUrl = window.location.pathname;
    history.replaceState({}, document.title, newUrl);
  }

  const playerWrapper = document.getElementById("player-wrapper");
  const backgroundCanvas = document.getElementById("background-canvas");
  const bgCtx = backgroundCanvas.getContext("2d");

  let playlists = { main: [], secondary: [] };
  let currentCampaignId = null;
  let currentIndices = { main: -1, secondary: -1 };
  let mediaTimers = { main: null, secondary: null };
  let playlistInterval = null;
  let clockInterval = null;
  let backgroundAnimationRequest = null;

  const resizeCanvas = () => {
    backgroundCanvas.width = window.innerWidth;
    backgroundCanvas.height = window.innerHeight;
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const updateBlurredBackground = (mediaElement) => {
    if (backgroundAnimationRequest) {
      cancelAnimationFrame(backgroundAnimationRequest);
    }
    const draw = () => {
      bgCtx.drawImage(
        mediaElement,
        0,
        0,
        backgroundCanvas.width,
        backgroundCanvas.height
      );
      if (mediaElement.tagName === "VIDEO" && !mediaElement.paused) {
        backgroundAnimationRequest = requestAnimationFrame(draw);
      }
    };
    draw();
    backgroundCanvas.style.opacity = "1";
  };

  const hideBlurredBackground = () => {
    backgroundCanvas.style.opacity = "0";
    if (backgroundAnimationRequest) {
      cancelAnimationFrame(backgroundAnimationRequest);
      backgroundAnimationRequest = null;
    }
  };

  const logPlayback = async (uploadId, campaignId) => {
    if (!uploadId || !campaignId) return;
    try {
      await fetch("/api/logs/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uploadId, campaignId }),
      });
    } catch (err) {
      console.error("Falha ao registrar log de exibição.", err);
    }
  };

  const setupLayout = (layoutType = "fullscreen") => {
    playerWrapper.innerHTML = "";
    playerWrapper.className = `player-wrapper layout-${layoutType}`;

    const mainZone = document.createElement("div");
    mainZone.id = "zone-main";
    mainZone.className = "player-zone";
    playerWrapper.appendChild(mainZone);

    if (layoutType.startsWith("split-80-20")) {
      const secondaryZone = document.createElement("div");
      secondaryZone.id = "zone-secondary";
      secondaryZone.className = "player-zone";
      playerWrapper.appendChild(secondaryZone);
    }
  };

  const showWaitingScreen = (
    title = "Aguardando Campanha",
    subtitle = "O player está online e pronto para receber conteúdo.",
    state = "info"
  ) => {
    Object.values(mediaTimers).forEach(clearTimeout);
    hideBlurredBackground();
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

  const displayMediaInZone = (zone) => {
    if (mediaTimers[zone]) clearTimeout(mediaTimers[zone]);

    const zoneContainer = document.getElementById(`zone-${zone}`);
    if (!zoneContainer) return;

    const playlist = playlists[zone];
    if (!playlist || playlist.length === 0) {
      zoneContainer.innerHTML = "";
      zoneContainer.style.backgroundColor = "transparent";
      if (zone === "main") hideBlurredBackground();
      return;
    }

    currentIndices[zone] = (currentIndices[zone] + 1) % playlist.length;
    const mediaItem = playlist[currentIndices[zone]];

    if (!mediaItem || !mediaItem.file_path) {
      playNextInZone(zone);
      return;
    }

    logPlayback(mediaItem.id, currentCampaignId);

    const isImage = mediaItem.file_type.startsWith("image/");
    const isVideo = mediaItem.file_type.startsWith("video/");
    let newElement;

    const setupNext = () => playNextInZone(zone);

    if (isImage) {
      newElement = document.createElement("img");
      newElement.crossOrigin = "anonymous";
    } else if (isVideo) {
      newElement = document.createElement("video");
      newElement.crossOrigin = "anonymous";
      newElement.autoplay = true;
      newElement.muted = true;
      newElement.playsInline = true;
    } else {
      setupNext();
      return;
    }

    newElement.src = mediaItem.file_path;
    newElement.className = "media-element";

    zoneContainer.innerHTML = "";
    zoneContainer.appendChild(newElement);

    const onMediaReady = () => {
      if (zone === "main") {
        updateBlurredBackground(newElement);
      }
      requestAnimationFrame(() => {
        newElement.classList.add("active");
      });
    };

    if (isImage) {
      const duration = (mediaItem.duration || 10) * 1000;
      mediaTimers[zone] = setTimeout(setupNext, duration);
      if (newElement.complete) {
        onMediaReady();
      } else {
        newElement.onload = onMediaReady;
        newElement.onerror = setupNext;
      }
    } else if (isVideo) {
      newElement.oncanplay = () => {
        const playPromise = newElement.play();
        if (playPromise !== undefined) {
          playPromise.then(onMediaReady).catch((error) => {
            console.error("Video play failed:", error);
            setupNext();
          });
        }
      };
      newElement.onended = setupNext;
      newElement.onerror = setupNext;
    }
  };

  const playNextInZone = (zone) => {
    displayMediaInZone(zone);
  };

  const startPlayback = (data) => {
    if (clockInterval) clearInterval(clockInterval);
    Object.values(mediaTimers).forEach(clearTimeout);

    if (!data) {
      playlists = { main: [], secondary: [] };
      currentCampaignId = null;
      showWaitingScreen();
      return;
    }

    setupLayout(data.layout_type);
    currentCampaignId = data.campaign_id;

    playlists.main = (data.uploads || []).filter(
      (u) => u.zone === "main" || !u.zone
    );
    playlists.secondary = (data.uploads || []).filter(
      (u) => u.zone === "secondary"
    );
    currentIndices = { main: -1, secondary: -1 };

    if (data.layout_type === "split-80-20-weather") {
      renderWeather(data.weather, data.city);
    } else if (playlists.secondary.length > 0) {
      playNextInZone("secondary");
    }

    if (playlists.main.length > 0) {
      playNextInZone("main");
    }

    const mainZone = document.getElementById("zone-main");
    if (playlists.main.length === 0 && mainZone) {
      mainZone.innerHTML = "";
      hideBlurredBackground();
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
    if (code >= 200 && code < 300)
      return {
        iconClass: "bi-cloud-lightning-rain-fill",
        colorClass: "weather-stormy",
      };
    if (code >= 300 && code < 400)
      return {
        iconClass: "bi-cloud-drizzle-fill",
        colorClass: "weather-rainy",
      };
    if (code >= 500 && code < 600)
      return {
        iconClass: "bi-cloud-rain-heavy-fill",
        colorClass: "weather-rainy",
      };
    if (code >= 600 && code < 700)
      return { iconClass: "bi-cloud-snow-fill", colorClass: "weather-snowy" };
    if (code >= 700 && code < 800)
      return { iconClass: "bi-cloud-fog2-fill", colorClass: "weather-misty" };
    if (code === 800)
      return { iconClass: "bi-sun-fill", colorClass: "weather-sunny" };
    if (code === 801)
      return { iconClass: "bi-cloud-sun-fill", colorClass: "weather-sunny" };
    if (code > 801 && code < 805)
      return { iconClass: "bi-cloud-fill", colorClass: "weather-cloudy" };
    return { iconClass: "bi-thermometer-half", colorClass: "weather-cloudy" };
  };

  const getCurrentTime = () => {
    const now = new Date();
    const options = {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    const timeString = now.toLocaleTimeString("pt-BR", options);
    const dateOptions = {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "long",
    };
    const dateString = new Intl.DateTimeFormat("pt-BR", dateOptions).format(
      now
    );
    return {
      time: timeString,
      date: dateString.charAt(0).toUpperCase() + dateString.slice(1),
    };
  };

  const renderClock = () => {
    const clockContainer = document.getElementById("clock-container");
    if (!clockContainer) return;

    if (clockInterval) clearInterval(clockInterval);

    const updateClock = () => {
      const { time, date } = getCurrentTime();
      clockContainer.innerHTML = `
            <div class="clock-time">${time}</div>
            <div class="clock-date">${date}</div>
        `;
    };
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  };

  const renderWeather = (weatherData, city) => {
    const weatherContainer = document.getElementById("zone-secondary");
    if (!weatherContainer) return;

    let weatherContentHtml;

    if (weatherData) {
      const { current, daily } = weatherData;
      const temp = Math.round(current.temperature_2m);
      const maxTemp = Math.round(daily.temperature_2m_max[0]);
      const minTemp = Math.round(daily.temperature_2m_min[0]);
      const { iconClass, colorClass } = getWeatherIcon(current.weather_code);

      weatherContentHtml = `
          <div class="weather-city">${city || ""}</div>
          <i class="bi ${iconClass} weather-icon ${colorClass}"></i>
          <div class="weather-temp">${temp}°C</div>
          <div class="weather-minmax">
            <i class="bi bi-arrow-up"></i> ${maxTemp}° <i class="bi bi-arrow-down"></i> ${minTemp}°
          </div>
      `;
    } else {
      weatherContentHtml = `
          <div class="weather-error">Não foi possível carregar o clima.</div>
      `;
    }

    weatherContainer.innerHTML = `
        <div class="weather-widget">
            <div class="weather-main-content">
                ${weatherContentHtml}
            </div>
            <div id="clock-container" class="clock-display"></div>
        </div>
    `;

    renderClock();
  };

  const requestPlaylist = () => {
    wsManager.sendMessage({ type: "REQUEST_PLAYLIST" });
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "CONNECTION_ESTABLISHED":
        requestPlaylist();
        if (playlistInterval) clearInterval(playlistInterval);
        playlistInterval = setInterval(requestPlaylist, 30 * 60 * 1000);
        break;
      case "PLAYLIST_UPDATE":
        startPlayback(data.payload);
        break;
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        requestPlaylist();
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect(false);
        if (playlistInterval) clearInterval(playlistInterval);
        showWaitingScreen(
          "Dispositivo Desconectado",
          "Este dispositivo foi revogado e não pode mais receber conteúdo.",
          "error"
        );
        setTimeout(() => {
          window.location.href = "/pair?error=revoked";
        }, 4000);
        break;
      case "FORCE_REFRESH":
      case "REMOTE_COMMAND":
        if (data.payload?.command === "RELOAD_PAGE") {
          wsManager.disconnect(false);
          window.location.reload(true);
        } else if (data.payload?.command === "REFRESH_PLAYLIST") {
          requestPlaylist();
        }
        break;
      case "TYPE_CHANGED":
        wsManager.disconnect(false);
        const newType = data.payload.newType;
        if (newType === "terminal_consulta") {
          window.location.href = "/price";
        } else if (newType === "digital_menu") {
          window.location.href = "/menu";
        } else {
          window.location.href = "/player";
        }
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
