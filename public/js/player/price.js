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
  let isDisplayingPrice = false;
  let playlists = { main: [], secondary: [] };
  let currentIndices = { main: -1, secondary: -1 };
  let mediaTimers = { main: null, secondary: null };
  let playlistInterval = null;

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
    viewWrapper.innerHTML = `<div id="idle-screen" style="width: 100%; height: 100%;"><div class="background-image"></div></div>`;
    viewWrapper.className = "player-wrapper-centered";
    const bgImage = viewWrapper.querySelector(".background-image");
    bgImage.style.backgroundImage = "url('/assets/price.jpg')";
    bgImage.style.display = "block";
    footer.style.display = "flex";
  };

  const showMessageScreen = (title, subtitle, state = "info") => {
    Object.values(mediaTimers).forEach(clearTimeout);
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

  const startPlayback = (data) => {
    if (isDisplayingPrice) return;
    Object.values(mediaTimers).forEach(clearTimeout);
    if (!data || !data.uploads || data.uploads.length === 0) {
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
    if (playlists.secondary.length > 0) playNextInZone("secondary");
    if (playlists.main.length > 0) playNextInZone("main");
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

  const connector = new DeviceConnector({
    onOpen: fetchAndResetPlaylist,
    onMessage: (data) => {
      switch (data.type) {
        case "PLAYLIST_UPDATE":
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
          location.href =
            data.payload.newType === "terminal_consulta" ? "/price" : "/player";
          break;
      }
    },
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
