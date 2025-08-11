import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isNewlyPaired = urlParams.has("paired");

  if (isNewlyPaired) {
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
  let clockInterval = null;

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
      zoneContainer.style.backgroundColor = "#000";
      return;
    }

    currentIndices[zone] = (currentIndices[zone] + 1) % playlist.length;
    const mediaItem = playlist[currentIndices[zone]];

    if (!mediaItem || !mediaItem.file_path) {
      playNextInZone(zone);
      return;
    }

    const isImage = mediaItem.file_type.startsWith("image/");
    const isVideo = mediaItem.file_type.startsWith("video/");
    let newElement;

    if (isImage) {
      newElement = document.createElement("img");
    } else if (isVideo) {
      newElement = document.createElement("video");
      newElement.autoplay = true;
      newElement.muted = true;
      newElement.playsInline = true;
    } else {
      playNextInZone(zone);
      return;
    }

    newElement.src = mediaItem.file_path;
    newElement.className = "media-element";

    const oldElement = zoneContainer.querySelector(".media-element.active");
    if (oldElement) {
      oldElement.addEventListener(
        "transitionend",
        () => {
          oldElement.remove();
        },
        { once: true }
      );
      oldElement.classList.remove("active");
    }

    zoneContainer.appendChild(newElement);

    const setupNext = () => playNextInZone(zone);

    const onMediaReady = () => {
      requestAnimationFrame(() => {
        newElement.classList.add("active");
      });
    };

    if (isImage) {
      newElement.onerror = setupNext;
      const duration = (mediaItem.duration || 10) * 1000;
      mediaTimers[zone] = setTimeout(setupNext, duration);
      if (newElement.complete) {
        onMediaReady();
      } else {
        newElement.onload = onMediaReady;
      }
    } else if (isVideo) {
      newElement.onloadeddata = onMediaReady;
      newElement.onended = setupNext;
      newElement.onerror = setupNext;
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
      renderWeather(weather, city);
    } catch (err) {
      console.error(err.message);
      renderWeather(null, null);
    }
  };

  const startPlayback = (data) => {
    if (clockInterval) clearInterval(clockInterval);
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
      renderClock();
      fetchWeather();
      weatherRetryInterval = setInterval(fetchWeather, 300000);
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
    const weatherContainer = document.getElementById("zone-secondary");
    if (!weatherContainer) return;

    if (clockInterval) clearInterval(clockInterval);

    const updateClock = () => {
      const { time, date } = getCurrentTime();
      const clockHtml = `
            <div class="weather-widget clock-display">
                <div class="clock-time">${time}</div>
                <div class="clock-date">${date}</div>
            </div>
        `;
      weatherContainer.innerHTML = clockHtml;
    };
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  };

  const renderWeather = (weatherData, city) => {
    const weatherContainer = document.getElementById("zone-secondary");
    if (!weatherContainer) return;

    if (weatherData) {
      if (clockInterval) clearInterval(clockInterval);
      if (weatherRetryInterval) {
        clearInterval(weatherRetryInterval);
        weatherRetryInterval = null;
      }

      const { current, daily } = weatherData;
      const temp = Math.round(current.temperature_2m);
      const maxTemp = Math.round(daily.temperature_2m_max[0]);
      const minTemp = Math.round(daily.temperature_2m_min[0]);
      const { iconClass, colorClass } = getWeatherIcon(current.weather_code);

      const weatherHtml = `
        <div class="weather-widget">
          <div class="weather-city">${city || ""}</div>
          <i class="bi ${iconClass} weather-icon ${colorClass}"></i>
          <div class="weather-temp">${temp}°C</div>
          <div class="weather-minmax">
            <i class="bi bi-arrow-up"></i> ${maxTemp}° <i class="bi bi-arrow-down"></i> ${minTemp}°
          </div>
        </div>
      `;
      weatherContainer.innerHTML = weatherHtml;
    }
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "CONNECTION_ESTABLISHED":
        wsManager.sendMessage({ type: "REQUEST_PLAYLIST" });
        if (playlistInterval) clearInterval(playlistInterval);
        playlistInterval = setInterval(
          () => wsManager.sendMessage({ type: "REQUEST_PLAYLIST" }),
          30 * 60 * 1000
        );
        break;
      case "PLAYLIST_UPDATE":
        startPlayback(data.payload);
        break;
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        wsManager.sendMessage({ type: "REQUEST_PLAYLIST" });
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect(false);
        if (playlistInterval) clearInterval(playlistInterval);
        if (weatherRetryInterval) clearInterval(weatherRetryInterval);
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
