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
  let currentCampaign = -1;
  const mediaCache = {};
  let playlistInterval = null;
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
  window.speechSynthesis.onvoiceschanged = initVoices;

  const showMessageScreen = (
    title = "Aguardando",
    subtitle = "O terminal está pronto.",
    state = "info"
  ) => {
    clearTimeout(mediaTimer);
    clearTimeout(priceViewTimeout);
    idleScreen.style.display = "none";
    priceCheckCard.style.display = "none";
    footer.style.display = "none";
    if (messageCardEl) messageCardEl.remove();
    const icons = {
      info: "bi-clock-history",
      reconnecting: "bi-wifi-off",
      error: "bi-shield-lock-fill",
    };
    const iconClass = icons[state] || "bi-info-circle-fill";
    const spinner =
      state === "reconnecting" ? '<div class="spinner"></div>' : "";
    viewWrapper.insertAdjacentHTML(
      "beforeend",
      `<div class="player-message-card ${state}"><i class="icon bi ${iconClass}"></i><div class="message-content"><p class="message-title">${title}</p><p class="message-subtitle">${subtitle}</p></div>${spinner}</div>`
    );
    messageCardEl = viewWrapper.querySelector(".player-message-card");
  };

  const hasPlayableMedia = () => playlist.some((c) => c.midia);

  const speakPrice = (price, onComplete) => {
    if (!("speechSynthesis" in window)) return onComplete();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`O preço é R$ ${price}`);
    u.lang = "pt-BR";
    if (selectedVoice) u.voice = selectedVoice;
    u.pitch = 1.0;
    u.rate = 1.3;
    u.onend = onComplete;
    speechSynthesis.speak(u);
  };

  const preloadMedia = () => {
    playlist.forEach((c) => {
      if (!c.midia || mediaCache[c.midia]) return;
      const ext = c.midia.split(".").pop().toLowerCase();
      let el;
      if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) el = new Image();
      else if (["mp4", "webm", "mov"].includes(ext))
        el = document.createElement("video");
      if (el) {
        el.src = c.midia;
        mediaCache[c.midia] = el;
      }
    });
  };

  const displayMedia = (campaign) => {
    clearTimeout(mediaTimer);
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
    } else playNextMedia();
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
    let next = (currentCampaign + 1) % playlist.length;
    let tries = 0;
    while (!playlist[next].midia && tries < playlist.length) {
      next = (next + 1) % playlist.length;
      tries++;
    }
    currentCampaign = next;
    displayMedia(playlist[next]);
  };

  const fetchAndResetPlaylist = async () => {
    try {
      const res = await fetch("/api/device/playlist", { cache: "no-cache" });
      if (!res.ok) {
        if ([401, 403].includes(res.status)) {
          wsManager.disconnect(false);
          location.href = "/pair?error=session_expired";
        }
        return;
      }
      playlist = await res.json();
      currentCampaign = -1;
      if (hasPlayableMedia()) preloadMedia();
      showIdleScreen();
    } catch {
      setTimeout(fetchAndResetPlaylist, 10000);
    }
  };

  function showIdleScreen() {
    if (messageCardEl) {
      messageCardEl.remove();
      messageCardEl = null;
    }
    priceCheckCard.style.display = "none";
    idleScreen.style.display = "flex";
    footer.style.display = "flex";
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    playNextMedia();
  }

  function showPriceCard() {
    if (messageCardEl) {
      messageCardEl.remove();
      messageCardEl = null;
    }
    idleScreen.style.display = "none";
    priceCheckCard.style.display = "flex";
    footer.style.display = "none";
    clearTimeout(mediaTimer);
  }

  const fetchProduct = async (barcode) => {
    console.log(`Buscando produto para barcode: ${barcode}`);
    const res = await fetch(`/api/product/${barcode}`);
    if (!res.ok) throw new Error();
    const json = await res.json();
    console.log("Resposta completa do produto:", json);
    return json;
  };

  const productSvg = priceContent.querySelector("svg");
  const productImage = document.createElement("img");
  productImage.style.display = "none";
  productImage.style.maxWidth = "100%";
  productImage.style.height = "auto";
  productSvg.parentNode.insertBefore(productImage, productSvg);

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
        console.log("Imagem válida recebida:", image);
        productSvg.style.display = "none";
        productImage.src = image;
        productImage.style.display = "block";
      } else {
        console.log("Nenhuma imagem recebida, exibindo SVG padrão.");
        productImage.style.display = "none";
        productSvg.style.display = "block";
      }
      loader.style.display = "none";
      priceContent.style.display = "flex";
      setTimeout(() => {
        speakPrice(pv2.toString().replace(".", ","), () => {
          priceViewTimeout = setTimeout(showIdleScreen, 1000);
        });
      }, 500);
    } catch (e) {
      console.log("Erro ao buscar produto:", e);
      loader.style.display = "none";
      showMessageScreen("Produto não encontrado", "", "error");
      const msg = new SpeechSynthesisUtterance("Produto não encontrado");
      msg.lang = "pt-BR";
      if (selectedVoice) msg.voice = selectedVoice;
      msg.pitch = 1.0;
      msg.rate = 1.3;
      msg.onend = () => {
        priceViewTimeout = setTimeout(showIdleScreen, 1000);
      };
      speechSynthesis.speak(msg);
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
        console.log("WebSocket token válido:", accessToken);
        this.stopProbing();
        this.establishConnection(accessToken);
      } catch (e) {
        console.log("Erro ao obter WebSocket token:", e);
      }
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
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    establishConnection(token) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${proto}//${location.host}?token=${token}`);
      this.ws.onopen = () => {
        console.log("WebSocket conectado.");
        fetchAndResetPlaylist();
      };
      this.ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case "NEW_CAMPAIGN":
          case "UPDATE_CAMPAIGN":
          case "DELETE_CAMPAIGN":
            fetchAndResetPlaylist();
            break;
          case "FORCE_REFRESH":
            this.disconnect(false);
            location.reload(true);
            break;
          case "DEVICE_REVOKED":
            this.disconnect(false);
            clearInterval(playlistInterval);
            location.href = "/pair?error=revoked";
            break;
          case "TYPE_CHANGED":
            this.disconnect(false);
            location.href =
              data.payload.newType === "busca_preco" ? "/price" : "/player";
        }
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
  showIdleScreen();
  fetchAndResetPlaylist();
});
