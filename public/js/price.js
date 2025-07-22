document.addEventListener("DOMContentLoaded", () => {
  const viewWrapper = document.getElementById("price-view-wrapper");
  const idleScreen = document.getElementById("idle-screen");
  const priceCheckCard = document.getElementById("price-check-card");
  const offerContainer = document.getElementById("offer-container");
  const backgroundImage = document.querySelector(".background-image");
  const loader = document.getElementById("loader");
  const priceContent = document.getElementById("price-content");
  const productNameEl = document.getElementById("product-name");
  const productPriceEl = document.getElementById("product-price");
  const productBarcodeEl = document.getElementById("product-barcode");
  const footer = document.querySelector(".price-check-footer");
  let priceViewTimeout;
  let mediaTimer = null;
  let playlist = [];
  let currentCampaignIndex = -1;
  const mediaCache = {};
  let playlistInterval = null;
  let messageCardElement = null;
  let selectedVoice = null;

  window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    selectedVoice =
      voices.find((v) => v.name === "Google português do Brasil") ||
      voices.find(
        (v) => v.lang === "pt-BR" && v.name.toLowerCase().includes("brasil")
      ) ||
      voices.find((v) => v.lang === "pt-BR");
  };

  const showMessageScreen = (
    title = "Aguardando",
    subtitle = "O terminal está pronto.",
    state = "info"
  ) => {
    if (mediaTimer) clearTimeout(mediaTimer);
    if (priceViewTimeout) clearTimeout(priceViewTimeout);
    idleScreen.style.display = "none";
    priceCheckCard.style.display = "none";
    footer.style.display = "none";
    if (messageCardElement) messageCardElement.remove();
    const icons = {
      info: "bi-clock-history",
      reconnecting: "bi-wifi-off",
      error: "bi-shield-lock-fill",
    };
    const iconClass = icons[state] || "bi-info-circle-fill";
    const spinnerHtml =
      state === "reconnecting" ? '<div class="spinner"></div>' : "";
    const messageCardHtml = `<div class="player-message-card ${state}"><i class="icon bi ${iconClass}"></i><div class="message-content"><p class="message-title">${title}</p><p class="message-subtitle">${subtitle}</p></div>${spinnerHtml}</div>`;
    viewWrapper.insertAdjacentHTML("beforeend", messageCardHtml);
    messageCardElement = viewWrapper.querySelector(".player-message-card");
  };

  const hasPlayableMedia = () =>
    playlist && playlist.length > 0 && playlist.some((c) => c.midia);

  function speakProductDetails(name, price, onComplete) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const priceFloat = parseFloat(price.replace(",", "."));
      const reais = Math.floor(priceFloat);
      const centavos = Math.round((priceFloat - reais) * 100);
      let priceText = "";
      if (reais > 0) priceText += `${reais} ${reais === 1 ? "real" : "reais"}`;
      if (centavos > 0) {
        if (reais > 0) priceText += " e ";
        priceText += `${centavos} ${centavos === 1 ? "centavo" : "centavos"}`;
      }
      const textToSpeak = `${name}. ${priceText}.`;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "pt-BR";
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.pitch = 1.0;
      utterance.rate = 1.2;
      utterance.onend = () => {
        if (onComplete) onComplete();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      if (onComplete) onComplete();
    }
  }

  const preloadMedia = () => {
    playlist.forEach((campaign) => {
      if (campaign.midia && !mediaCache[campaign.midia]) {
        const fileExtension = campaign.midia.split(".").pop().toLowerCase();
        let mediaElement;
        if (["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension))
          mediaElement = new Image();
        else if (["mp4", "webm", "mov"].includes(fileExtension))
          mediaElement = document.createElement("video");
        if (mediaElement) {
          mediaElement.src = campaign.midia;
          mediaCache[campaign.midia] = mediaElement;
        }
      }
    });
  };

  const displayMedia = (campaign) => {
    if (mediaTimer) clearTimeout(mediaTimer);
    if (!offerContainer) return;
    offerContainer.innerHTML = "";
    offerContainer.style.backgroundColor = "#000";
    const mediaUrl = campaign.midia;
    const fileExtension = mediaUrl.split(".").pop().toLowerCase();
    const cachedMedia = mediaCache[mediaUrl];
    const mediaElement = cachedMedia ? cachedMedia.cloneNode(true) : null;
    if (
      mediaElement &&
      ["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension)
    ) {
      mediaElement.onerror = () => playNextMedia();
      offerContainer.appendChild(mediaElement);
      mediaTimer = setTimeout(playNextMedia, 10000);
    } else if (mediaElement && ["mp4", "webm", "mov"].includes(fileExtension)) {
      mediaElement.autoplay = true;
      mediaElement.muted = true;
      mediaElement.playsInline = true;
      mediaElement.onended = playNextMedia;
      mediaElement.onerror = () => playNextMedia();
      offerContainer.appendChild(mediaElement);
    } else {
      playNextMedia();
    }
  };

  const playNextMedia = () => {
    if (!hasPlayableMedia()) {
      if (mediaTimer) clearTimeout(mediaTimer);
      offerContainer.style.display = "none";
      backgroundImage.style.display = "block";
      return;
    }
    offerContainer.style.display = "flex";
    backgroundImage.style.display = "none";
    let nextIndex = (currentCampaignIndex + 1) % playlist.length;
    let attempts = 0;
    while (!playlist[nextIndex].midia && attempts < playlist.length) {
      nextIndex = (nextIndex + 1) % playlist.length;
      attempts++;
    }
    currentCampaignIndex = nextIndex;
    displayMedia(playlist[currentCampaignIndex]);
  };

  const fetchAndResetPlaylist = async () => {
    try {
      const response = await fetch("/api/device/playlist", {
        cache: "no-cache",
      });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          wsManager.disconnect(false);
          window.location.href = "/pair?error=session_expired";
        }
        return;
      }
      playlist = await response.json();
      currentCampaignIndex = -1;
      if (hasPlayableMedia()) preloadMedia();
      showIdleScreen();
    } catch (error) {
      setTimeout(fetchAndResetPlaylist, 10000);
    }
  };

  function showIdleScreen() {
    if (messageCardElement) {
      messageCardElement.remove();
      messageCardElement = null;
    }
    priceCheckCard.style.display = "none";
    idleScreen.style.display = "flex";
    footer.style.display = "flex";
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    playNextMedia();
  }

  function showPriceCard() {
    if (messageCardElement) {
      messageCardElement.remove();
      messageCardElement = null;
    }
    idleScreen.style.display = "none";
    priceCheckCard.style.display = "flex";
    footer.style.display = "none";
    if (mediaTimer) clearTimeout(mediaTimer);
  }

  function displayProduct(barcode) {
    showPriceCard();
    loader.style.display = "flex";
    priceContent.style.display = "none";
    if (priceViewTimeout) clearTimeout(priceViewTimeout);
    const productData = {
      name: "Produto Exemplo Extra Longo",
      price: "24,50",
      barcode: barcode,
    };
    productNameEl.textContent = productData.name;
    productPriceEl.textContent = productData.price;
    productBarcodeEl.textContent = productData.barcode;
    loader.style.display = "none";
    priceContent.style.display = "flex";
    speakProductDetails(productData.name, productData.price, () => {
      priceViewTimeout = setTimeout(showIdleScreen, 1000);
    });
  }

  let barcodeBuffer = "";
  let barcodeTimeout = null;
  document.addEventListener("keydown", (e) => {
    if (barcodeTimeout) clearTimeout(barcodeTimeout);
    if (e.key === "Enter") {
      if (barcodeBuffer.length > 3) displayProduct(barcodeBuffer);
      barcodeBuffer = "";
    } else if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key))
      barcodeBuffer += e.key;
    barcodeTimeout = setTimeout(() => {
      barcodeBuffer = "";
    }, 200);
  });

  function handleServerMessage(data) {
    switch (data.type) {
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        fetchAndResetPlaylist();
        break;
      case "FORCE_REFRESH":
        wsManager.disconnect(false);
        window.location.reload(true);
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect(false);
        if (playlistInterval) clearInterval(playlistInterval);
        window.location.href = "/pair?error=revoked";
        break;
    }
  }

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
          showMessageScreen(
            "Sessão Inválida",
            "Redirecionando para autenticação...",
            "error"
          );
          setTimeout(() => {
            window.location.href = "/pair?error=session_expired";
          }, 4000);
          return;
        }
        if (!response.ok) throw new Error("Servidor não está pronto.");
        const data = await response.json();
        if (data && data.accessToken) {
          this.stopProbing();
          this.establishConnection(data.accessToken);
        }
      } catch (error) {}
    }
    startProbing() {
      if (this.probeTimer || !this.shouldReconnect) return;
      showMessageScreen(
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
        if (this.shouldReconnect) this.startProbing();
      };
      this.ws.onerror = () => {
        this.ws.close();
      };
    }
    connect() {
      this.startProbing();
    }
    disconnect(shouldReconnect = true) {
      this.shouldReconnect = shouldReconnect;
      this.stopProbing();
      if (this.ws) this.ws.close(1000, "Desconexão intencional.");
    }
  }

  const wsManager = new WebSocketManager();
  wsManager.connect();
  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 60000);
});
