// price.js
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
    const voices = speechSynthesis.getVoices();
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
    viewWrapper.insertAdjacentHTML(
      "beforeend",
      `
      <div class="player-message-card ${state}">
        <i class="icon bi ${iconClass}"></i>
        <div class="message-content">
          <p class="message-title">${title}</p>
          <p class="message-subtitle">${subtitle}</p>
        </div>
        ${spinnerHtml}
      </div>
    `
    );
    messageCardElement = viewWrapper.querySelector(".player-message-card");
  };

  const hasPlayableMedia = () => playlist.some((c) => c.midia);

  const speakProductDetails = (name, price, onComplete) => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const priceFloat = parseFloat(price.replace(",", "."));
      const reais = Math.floor(priceFloat);
      const centavos = Math.round((priceFloat - reais) * 100);
      let text = `${name}. `;
      if (reais) text += `${reais} ${reais === 1 ? "real" : "reais"}`;
      if (centavos)
        text +=
          (reais ? " e " : "") +
          `${centavos} ${centavos === 1 ? "centavo" : "centavos"}`;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      if (selectedVoice) u.voice = selectedVoice;
      u.pitch = 1.0;
      u.rate = 1.2;
      u.onend = onComplete;
      speechSynthesis.speak(u);
    } else onComplete();
  };

  const preloadMedia = () => {
    playlist.forEach((c) => {
      if (c.midia && !mediaCache[c.midia]) {
        const ext = c.midia.split(".").pop().toLowerCase();
        let el;
        if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
          el = new Image();
        else if (["mp4", "webm", "mov"].includes(ext))
          el = document.createElement("video");
        if (el) {
          el.src = c.midia;
          mediaCache[c.midia] = el;
        }
      }
    });
  };

  const displayMedia = (campaign) => {
    if (mediaTimer) clearTimeout(mediaTimer);
    offerContainer.innerHTML = "";
    offerContainer.style.backgroundColor = "#000";
    const url = campaign.midia;
    const ext = url.split(".").pop().toLowerCase();
    const cached = mediaCache[url];
    if (cached && ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      const img = cached.cloneNode();
      img.onerror = playNextMedia;
      offerContainer.appendChild(img);
      mediaTimer = setTimeout(playNextMedia, 10000);
    } else if (cached && ["mp4", "webm", "mov"].includes(ext)) {
      const vid = cached.cloneNode();
      vid.autoplay = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.onended = playNextMedia;
      vid.onerror = playNextMedia;
      offerContainer.appendChild(vid);
    } else {
      playNextMedia();
    }
  };

  const playNextMedia = () => {
    if (!hasPlayableMedia()) {
      clearTimeout(mediaTimer);
      offerContainer.style.display = "none";
      backgroundImage.style.display = "block";
      return;
    }
    offerContainer.style.display = "flex";
    backgroundImage.style.display = "none";
    let next = (currentCampaignIndex + 1) % playlist.length;
    let tries = 0;
    while (!playlist[next].midia && tries < playlist.length) {
      next = (next + 1) % playlist.length;
      tries++;
    }
    currentCampaignIndex = next;
    displayMedia(playlist[next]);
  };

  const fetchAndResetPlaylist = async () => {
    try {
      const res = await fetch("/api/device/playlist", { cache: "no-cache" });
      if (!res.ok) {
        if ([401, 403].includes(res.status)) {
          wsManager.disconnect(false);
          window.location.href = "/pair?error=session_expired";
        }
        return;
      }
      playlist = await res.json();
      currentCampaignIndex = -1;
      if (hasPlayableMedia()) preloadMedia();
      showIdleScreen();
    } catch {
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
    if ("speechSynthesis" in window) speechSynthesis.cancel();
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
    clearTimeout(mediaTimer);
  }

  function displayProduct(barcode) {
    showPriceCard();
    loader.style.display = "flex";
    priceContent.style.display = "none";
    clearTimeout(priceViewTimeout);
    const data = {
      name: "Produto Exemplo Extra Longo",
      price: "2224,50",
      barcode,
    };
    productNameEl.textContent = data.name;
    productPriceEl.textContent = data.price;
    productBarcodeEl.textContent = data.barcode;
    loader.style.display = "none";
    priceContent.style.display = "flex";
    speakProductDetails(data.name, data.price, () => {
      priceViewTimeout = setTimeout(showIdleScreen, 1000);
    });
  }

  let buf = "";
  let bufTimeout = null;
  document.addEventListener("keydown", (e) => {
    clearTimeout(bufTimeout);
    if (e.key === "Enter") {
      if (buf.length > 3) displayProduct(buf);
      buf = "";
    } else if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
      buf += e.key;
    }
    bufTimeout = setTimeout(() => (buf = ""), 200);
  });

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        fetchAndResetPlaylist();
        break;
      case "FORCE_REFRESH":
        wsManager.disconnect(false);
        location.reload(true);
        break;
      case "DEVICE_REVOKED":
        wsManager.disconnect(false);
        clearInterval(playlistInterval);
        location.href = "/pair?error=revoked";
        break;
      case "TYPE_CHANGED":
        wsManager.disconnect(false);
        location.href =
          data.payload.newType === "busca_preco" ? "/price" : "/player";
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
        const res = await fetch("/api/wsToken");
        if ([401, 403].includes(res.status)) {
          this.disconnect(false);
          showMessageScreen("Sessão Inválida", "Redirecionando...", "error");
          setTimeout(
            () => (location.href = "/pair?error=session_expired"),
            4000
          );
          return;
        }
        if (!res.ok) throw new Error();
        const { accessToken } = await res.json();
        this.stopProbing();
        this.establishConnection(accessToken);
      } catch {}
    }
    startProbing() {
      if (this.probeTimer || !this.shouldReconnect) return;
      showMessageScreen(
        "Conexão Perdida",
        "Tentando reconectar...",
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
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${proto}//${location.host}?token=${token}`);
      this.ws.onopen = fetchAndResetPlaylist;
      this.ws.onmessage = (e) => {
        try {
          handleServerMessage(JSON.parse(e.data));
        } catch {}
      };
      this.ws.onclose = () => {
        if (this.shouldReconnect) this.startProbing();
      };
      this.ws.onerror = () => this.ws.close();
    }
    connect() {
      this.startProbing();
    }
    disconnect(shouldReconnect = true) {
      this.shouldReconnect = shouldReconnect;
      this.stopProbing();
      if (this.ws) this.ws.close(1000, "Intentional");
    }
  }

  const wsManager = new WebSocketManager();
  wsManager.connect();
  if (playlistInterval) clearInterval(playlistInterval);
  playlistInterval = setInterval(fetchAndResetPlaylist, 60000);
});
