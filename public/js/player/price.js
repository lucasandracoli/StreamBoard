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

  const viewWrapper = document.getElementById("price-view-wrapper");
  const priceCheckCard = document.getElementById("price-check-card");
  const loader = document.getElementById("loader");
  const priceContent = document.getElementById("price-content");
  const productNameEl = document.getElementById("product-name");
  const productPriceEl = document.getElementById("product-price");
  const productBarcodeEl = document.getElementById("product-barcode");
  const footer = document.querySelector(".price-check-footer");

  let priceViewTimeout;
  let playlists = { main: [], secondary: [] };
  let currentIndices = { main: -1, secondary: -1 };
  let mediaTimers = { main: null, secondary: null };
  let playlistInterval = null;
  let weatherRetryInterval = null;
  let clockInterval = null;

  let messageCardEl = null;
  let selectedVoice = null;

  const initVoices = () => {
    const voices = speechSynthesis.getVoices();
    selectedVoice =
      voices.find((v) => v.name === "Google português do Brasil") ||
      voices.find(
        (v) => v.lang === "pt-BR" && v.name.toLowerCase().includes("brasil")
      ) ||
      voices.find((v) => v.lang === "pt-BR");
  };
  initVoices();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = initVoices;
  }

  const setupLayout = (layoutType = "fullscreen") => {
    viewWrapper.innerHTML = "";
    viewWrapper.className = `player-wrapper layout-${layoutType}`;
    footer.style.display = "flex";

    const mainZone = document.createElement("div");
    mainZone.id = "zone-main";
    mainZone.className = "player-zone";
    viewWrapper.appendChild(mainZone);

    if (layoutType.startsWith("split-80-20")) {
      const secondaryZone = document.createElement("div");
      secondaryZone.id = "zone-secondary";
      secondaryZone.className = "player-zone";
      viewWrapper.appendChild(secondaryZone);
    }
  };

  const showIdleWithBackground = () => {
    Object.values(mediaTimers).forEach(clearTimeout);
    viewWrapper.innerHTML = `<div id="idle-screen" style="width: 100%; height: 100%;"><div class="background-image"></div></div>`;
    viewWrapper.className = "player-wrapper-centered";
    const bgImage = viewWrapper.querySelector(".background-image");
    bgImage.style.backgroundImage = "url('/assets/price.jpg')";
    bgImage.style.display = "block";
    footer.style.display = "flex";
  };

  const showMessageScreen = (
    title = "Aguardando",
    subtitle = "O terminal está pronto.",
    state = "info"
  ) => {
    Object.values(mediaTimers).forEach(clearTimeout);
    viewWrapper.innerHTML = "";
    viewWrapper.className = "player-wrapper-centered";
    if (messageCardEl) messageCardEl.remove();

    const icons = {
      info: "bi-clock-history",
      reconnecting: "bi-wifi-off",
      error: "bi-shield-lock-fill",
    };
    const iconClass = icons[state] || "bi-info-circle-fill";
    const spinner =
      state === "reconnecting" ? '<div class="spinner"></div>' : "";

    const messageHtml = `<div class="player-message-card ${state}"><i class="icon bi ${iconClass}"></i><div class="message-content"><p class="message-title">${title}</p><p class="message-subtitle">${subtitle}</p></div>${spinner}</div>`;
    viewWrapper.innerHTML = messageHtml;
    messageCardEl = viewWrapper.querySelector(".player-message-card");
    footer.style.display = "none";
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
      oldElement.addEventListener("transitionend", () => oldElement.remove(), {
        once: true,
      });
      oldElement.classList.remove("active");
    }

    zoneContainer.appendChild(newElement);
    const setupNext = () => playNextInZone(zone);

    const onMediaReady = () => {
      requestAnimationFrame(() => newElement.classList.add("active"));
    };

    if (isImage) {
      newElement.onerror = setupNext;
      const duration = (mediaItem.duration || 10) * 1000;
      mediaTimers[zone] = setTimeout(setupNext, duration);
      if (newElement.complete) onMediaReady();
      else newElement.onload = onMediaReady;
    } else if (isVideo) {
      newElement.onloadeddata = onMediaReady;
      newElement.onended = setupNext;
      newElement.onerror = setupNext;
    }
  };

  const playNextInZone = (zone) => displayMediaInZone(zone);

  const fetchWeather = async () => {
    try {
      const res = await fetch("/api/device/weather");
      if (!res.ok) throw new Error("Falha ao buscar dados do clima.");
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

    if (!data || !data.uploads || data.uploads.length === 0) {
      playlists = { main: [], secondary: [] };
      showIdleWithBackground();
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
      fetchWeather();
      weatherRetryInterval = setInterval(fetchWeather, 300000);
    } else if (playlists.secondary.length > 0) {
      playNextInZone("secondary");
    }

    if (playlists.main.length > 0) {
      playNextInZone("main");
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
      clockContainer.innerHTML = `<div class="clock-time">${time}</div><div class="clock-date">${date}</div>`;
    };
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  };

  const renderWeather = (weatherData, city) => {
    const weatherContainer = document.getElementById("zone-secondary");
    if (!weatherContainer) return;

    let weatherContentHtml;
    if (weatherData) {
      if (weatherRetryInterval) {
        clearInterval(weatherRetryInterval);
        weatherRetryInterval = null;
      }
      const { current, daily } = weatherData;
      const temp = Math.round(current.temperature_2m);
      const maxTemp = Math.round(daily.temperature_2m_max[0]);
      const minTemp = Math.round(daily.temperature_2m_min[0]);
      const { iconClass, colorClass } = getWeatherIcon(current.weather_code);
      weatherContentHtml = `<div class="weather-city">${
        city || ""
      }</div><i class="bi ${iconClass} weather-icon ${colorClass}"></i><div class="weather-temp">${temp}°C</div><div class="weather-minmax"><i class="bi bi-arrow-up"></i> ${maxTemp}° <i class="bi bi-arrow-down"></i> ${minTemp}°</div>`;
    } else {
      weatherContentHtml = `<div class="weather-error">Não foi possível carregar o clima.</div>`;
    }
    weatherContainer.innerHTML = `<div class="weather-widget"><div class="weather-main-content">${weatherContentHtml}</div><div id="clock-container" class="clock-display"></div></div>`;
    renderClock();
  };

  const fetchAndResetPlaylist = async () => {
    try {
      const res = await fetch("/api/device/playlist", { cache: "no-cache" });
      if (!res.ok) {
        if ([401, 403].includes(res.status)) {
          connector.disconnect(false);
          location.href = "/pair?error=session_expired";
        }
        return;
      }
      const data = await res.json();
      startPlayback(data);
    } catch {
      setTimeout(fetchAndResetPlaylist, 10000);
    }
  };

  const returnToIdleState = () => {
    fetchAndResetPlaylist();
  };

  const showPriceCard = () => {
    Object.values(mediaTimers).forEach(clearTimeout);
    viewWrapper.innerHTML = "";
    viewWrapper.className = "player-wrapper-centered";
    viewWrapper.appendChild(priceCheckCard);
    priceCheckCard.style.display = "flex";
    footer.style.display = "none";
  };

  const fetchProduct = async (barcode) => {
    const res = await fetch(`/api/product/${barcode}`);
    if (!res.ok) throw new Error();
    return res.json();
  };

  const productSvg = priceContent.querySelector("svg");
  const productImage = document.createElement("img");
  productImage.style.display = "none";
  productImage.style.maxWidth = "100%";
  productImage.style.height = "auto";
  productSvg.parentNode.insertBefore(productImage, productSvg);

  const speakPrice = (price, onComplete) => {
    if (!("speechSynthesis" in window)) {
      if (onComplete) onComplete();
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`O preço é R$ ${price}`);
    u.lang = "pt-BR";
    if (selectedVoice) u.voice = selectedVoice;
    u.pitch = 1.0;
    u.rate = 1.3;
    u.onend = onComplete;
    speechSynthesis.speak(u);
  };

  async function displayProduct(barcode) {
    showPriceCard();
    loader.style.display = "flex";
    priceContent.style.display = "none";
    clearTimeout(priceViewTimeout);
    try {
      const { dsc, pv2, bar, image } = await fetchProduct(barcode);
      productNameEl.textContent = dsc;
      productPriceEl.textContent = pv2.toString().replace(".", ",");
      productBarcodeEl.textContent = bar;
      if (image) {
        productSvg.style.display = "none";
        productImage.src = image;
        productImage.style.display = "block";
      } else {
        productImage.style.display = "none";
        productSvg.style.display = "block";
      }
      loader.style.display = "none";
      priceContent.style.display = "flex";
      setTimeout(() => {
        speakPrice(pv2.toString().replace(".", ","), () => {
          priceViewTimeout = setTimeout(returnToIdleState, 1000);
        });
      }, 500);
    } catch (e) {
      loader.style.display = "none";
      priceCheckCard.style.display = "none";
      showMessageScreen("Produto não encontrado", "", "error");
      speakPrice("Produto não encontrado", () => {
        priceViewTimeout = setTimeout(returnToIdleState, 1000);
      });
    }
  }

  let buf = "";
  let bufTimeout = null;
  document.addEventListener("keydown", (e) => {
    clearTimeout(bufTimeout);
    if (e.key === "Enter") {
      if (buf.length > 3) displayProduct(buf);
      buf = "";
    } else if (e.key.length === 1 && /^[0-9]$/.test(e.key)) {
      buf += e.key;
    }
    bufTimeout = setTimeout(() => (buf = ""), 200);
  });

  const connector = new DeviceConnector({
    onOpen: () => {
      fetchAndResetPlaylist();
    },
    onMessage: (data) => {
      switch (data.type) {
        case "CONNECTION_ESTABLISHED":
          if (playlistInterval) clearInterval(playlistInterval);
          playlistInterval = setInterval(
            () => connector.sendMessage({ type: "REQUEST_PLAYLIST" }),
            30 * 60 * 1000
          );
          break;
        case "PLAYLIST_UPDATE":
          startPlayback(data.payload);
          break;
        case "NEW_CAMPAIGN":
        case "UPDATE_CAMPAIGN":
        case "DELETE_CAMPAIGN":
          fetchAndResetPlaylist();
          break;
        case "FORCE_REFRESH":
          connector.disconnect(false);
          location.reload(true);
          break;
        case "DEVICE_REVOKED":
          connector.disconnect(false);
          clearInterval(playlistInterval);
          if (weatherRetryInterval) clearInterval(weatherRetryInterval);
          showMessageScreen(
            "Dispositivo Desconectado",
            "Este terminal foi revogado.",
            "error"
          );
          setTimeout(() => {
            location.href = "/pair?error=revoked";
          }, 4000);
          break;
        case "TYPE_CHANGED":
          connector.disconnect(false);
          if (weatherRetryInterval) clearInterval(weatherRetryInterval);
          location.href =
            data.payload.newType === "terminal_consulta" ? "/price" : "/player";
          break;
      }
    },
    onReconnecting: () => {
      showMessageScreen(
        "Conexão Perdida",
        "Tentando reconectar...",
        "reconnecting"
      );
    },
    onAuthFailure: () => {
      showMessageScreen("Sessão Inválida", "Redirecionando...", "error");
      setTimeout(() => (location.href = "/pair?error=session_expired"), 4000);
    },
  });

  connector.connect();
  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 60 * 1000);

  fetchAndResetPlaylist();
});
