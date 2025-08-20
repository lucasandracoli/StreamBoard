import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isNewlyPaired = urlParams.has("paired");

  if (isNewlyPaired) {
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
  const backgroundCanvas = document.getElementById("background-canvas");
  const bgCtx = backgroundCanvas.getContext("2d");

  let priceViewTimeout;
  let isDisplayingPrice = false;
  let playlists = { main: [], secondary: [] };
  let currentIndices = { main: -1, secondary: -1 };
  let mediaTimers = { main: null, secondary: null };
  let clockInterval = null;
  let backgroundAnimationRequest = null;

  const resizeCanvas = () => {
    backgroundCanvas.width = window.innerWidth;
    backgroundCanvas.height = window.innerHeight;
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const updateBlurredBackground = (mediaElement) => {
    resizeCanvas();
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

  const configureFullyKioskVoice = () => {
    if (typeof fully !== "undefined") {
      try {
        const rhVoicePackageName = "com.github.olga_yakovleva.rhvoice.android";
        fully.setTtsEngine(rhVoicePackageName);
        fully.setTtsLocale("pt-BR");
      } catch (e) {
        console.error("Falha ao configurar o motor de voz do Fully.", e);
      }
    }
  };

  configureFullyKioskVoice();

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
    isDisplayingPrice = false;
    Object.values(mediaTimers).forEach(clearTimeout);
    viewWrapper.innerHTML = `<div id="idle-screen"><div class="background-image" style="background-image: url('/assets/price.jpg');"></div></div>`;
    viewWrapper.className = "";
    footer.style.display = "flex";
    hideBlurredBackground();
  };

  const showMessageScreen = (title, subtitle, state = "info") => {
    Object.values(mediaTimers).forEach(clearTimeout);
    hideBlurredBackground();
    viewWrapper.innerHTML = "";
    viewWrapper.className = "player-wrapper-centered";
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
    footer.style.display = "none";
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
      if (zone === "main") updateBlurredBackground(newElement);
      requestAnimationFrame(() => newElement.classList.add("active"));
    };

    if (isImage) {
      if (playlist.length > 1) {
        const duration = (mediaItem.duration || 10) * 1000;
        mediaTimers[zone] = setTimeout(setupNext, duration);
      }
      if (newElement.complete) {
        onMediaReady();
      } else {
        newElement.onload = onMediaReady;
        newElement.onerror = setupNext;
      }
    } else if (isVideo) {
      if (playlist.length > 1) {
        newElement.onended = setupNext;
      } else {
        newElement.loop = true;
      }

      newElement.oncanplay = () => {
        const playPromise = newElement.play();
        if (playPromise !== undefined) {
          playPromise.then(onMediaReady).catch((error) => {
            console.error("Video play failed:", error);
            setupNext();
          });
        }
      };
      newElement.onerror = setupNext;
    }
  };

  const playNextInZone = (zone) => displayMediaInZone(zone);

  const startPlayback = (data) => {
    if (isDisplayingPrice) return;
    if (clockInterval) clearInterval(clockInterval);
    Object.values(mediaTimers).forEach(clearTimeout);

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
      renderWeather(data.weather, data.city);
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
    isDisplayingPrice = false;
    fetchAndResetPlaylist();
  };

  const showPriceCard = () => {
    isDisplayingPrice = true;
    Object.values(mediaTimers).forEach(clearTimeout);
    hideBlurredBackground();
    viewWrapper.innerHTML = "";
    viewWrapper.className = "player-wrapper-centered";
    viewWrapper.appendChild(priceCheckCard);
    priceCheckCard.style.display = "flex";
    footer.style.display = "none";
  };

  const fetchProduct = async (barcode) => {
    const res = await fetch(`/api/product/${barcode}`);
    if (!res.ok) throw new Error("Produto não encontrado");
    return res.json();
  };

  const productSvg = priceContent.querySelector("svg");
  const productImage = document.createElement("img");
  productImage.style.display = "none";
  productImage.style.maxWidth = "100%";
  productImage.style.height = "auto";
  productSvg.parentNode.insertBefore(productImage, productSvg);

  const speakPrice = (price, onComplete) => {
    const textToSpeak = `O preço é R$ ${price}`;
    if (typeof fully !== "undefined" && fully.textToSpeech) {
      fully.textToSpeech(textToSpeak);
      if (onComplete) setTimeout(onComplete, 2000);
    } else {
      try {
        if (!("speechSynthesis" in window)) {
          if (onComplete) onComplete();
          return;
        }
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(textToSpeak);
        u.lang = "pt-BR";
        u.pitch = 1.0;
        u.rate = 1.3;
        u.onend = onComplete;
        speechSynthesis.speak(u);
      } catch (error) {
        console.error("Erro na síntese de voz da web:", error);
        if (onComplete) onComplete();
      }
    }
  };

  async function displayProduct(barcode) {
    if (isDisplayingPrice) return;
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
          priceViewTimeout = setTimeout(returnToIdleState, 4000);
        });
      }, 500);
    } catch (e) {
      loader.style.display = "none";
      priceCheckCard.style.display = "none";
      showMessageScreen("Produto não encontrado", "", "error");
      speakPrice("Produto não encontrado", () => {
        priceViewTimeout = setTimeout(returnToIdleState, 4000);
      });
    }
  }

  const processBarcode = (barcode) => {
    if (barcode && barcode.length > 3) {
      displayProduct(barcode);
    }
  };

  window.onBarcodeScan = processBarcode;

  let barcodeBuffer = "";
  let barcodeTimeout = null;
  document.addEventListener("keydown", (e) => {
    if (isDisplayingPrice) return;
    if (e.key === "Enter") {
      processBarcode(barcodeBuffer);
      barcodeBuffer = "";
      return;
    }
    if (e.key.length === 1 && /^[0-9]$/.test(e.key)) {
      barcodeBuffer += e.key;
    }
    clearTimeout(barcodeTimeout);
    barcodeTimeout = setTimeout(() => {
      if (barcodeBuffer.length > 3) {
        processBarcode(barcodeBuffer);
      }
      barcodeBuffer = "";
    }, 100);
  });

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "CONNECTION_ESTABLISHED":
        if (!isDisplayingPrice) {
          fetchAndResetPlaylist();
        }
        break;
      case "PLAYLIST_UPDATE":
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        if (!isDisplayingPrice) {
          fetchAndResetPlaylist();
        }
        break;
      case "FORCE_REFRESH":
        connector.disconnect(false);
        location.reload(true);
        break;
      case "DEVICE_REVOKED":
        connector.disconnect(false);
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
        const newType = data.payload.newType;
        if (newType === "digital_menu") {
          window.location.href = "/menu";
        } else if (newType === "terminal_consulta") {
          window.location.href = "/price";
        } else {
          window.location.href = "/player";
        }
        break;
    }
  };

  const connector = new DeviceConnector({
    onMessage: handleServerMessage,
    onReconnecting: () => {
      if (!isDisplayingPrice) {
        showMessageScreen(
          "Conexão Perdida",
          "Tentando reconectar...",
          "reconnecting"
        );
      }
    },
    onAuthFailure: () => {
      showMessageScreen("Sessão Inválida", "Redirecionando...", "error");
      setTimeout(() => (location.href = "/pair?error=session_expired"), 4000);
    },
  });

  connector.connect();
});
