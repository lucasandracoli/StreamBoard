import DeviceConnector from "../utils/connector.js";

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
  const barcodeInput = document.getElementById("barcode-input");
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

  const hasPlayableMedia = () => playlist.some((c) => c.file_path);

  const speakPrice = (price, onComplete) => {
    if (!("speechSynthesis" in window)) return onComplete();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`O preço é R$ ${price}`);
    u.lang = "pt-BR";
    if (selectedVoice) u.voice = selectedVoice;
    u.pitch = 1.0;
    u.rate = 1.0;
    u.onend = onComplete;
    speechSynthesis.speak(u);
  };

  const preloadMedia = () => {
    playlist.forEach((c) => {
      if (!c.file_path || mediaCache[c.file_path]) return;
      const ext = c.file_path.split(".").pop().toLowerCase();
      let el;
      if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) el = new Image();
      else if (["mp4", "webm", "mov"].includes(ext))
        el = document.createElement("video");
      if (el) {
        el.src = c.file_path;
        mediaCache[c.file_path] = el;
      }
    });
  };

  const displayMedia = (campaign) => {
    if (mediaTimer) clearTimeout(mediaTimer);
    offerContainer.innerHTML = "";
    offerContainer.style.backgroundColor = "#000";
    offerContainer.style.display = "block";
    backgroundImage.style.display = "none";

    if (!campaign || !campaign.file_path) {
      playNextMedia();
      return;
    }

    const url = campaign.file_path;
    const isImage = campaign.file_type.startsWith("image/");
    const isVideo = campaign.file_type.startsWith("video/");
    const cached = mediaCache[url];

    if (cached && isImage) {
      const img = cached.cloneNode();
      img.onerror = playNextMedia;
      offerContainer.appendChild(img);
      const duration = (campaign.duration || 10) * 1000;
      mediaTimer = setTimeout(playNextMedia, duration);
    } else if (cached && isVideo) {
      const vid = cached.cloneNode();
      vid.muted = true;
      vid.playsInline = true;
      vid.onended = playNextMedia;
      vid.onerror = playNextMedia;
      offerContainer.appendChild(vid);
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          playNextMedia();
        });
      }
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
    offerContainer.style.display = "block";
    backgroundImage.style.display = "none";
    let next = (currentCampaign + 1) % playlist.length;
    let tries = 0;
    while (!playlist[next].file_path && tries < playlist.length) {
      next = (next + 1) % playlist.length;
      tries++;
    }
    currentCampaign = next;
    displayMedia(playlist[currentCampaign]);
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

    if (hasPlayableMedia()) {
      offerContainer.style.display = "block";
      backgroundImage.style.display = "none";
      playNextMedia();
    } else {
      offerContainer.style.display = "none";
      backgroundImage.style.display = "block";
    }
    barcodeInput.focus();
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
    const res = await fetch(`/api/product/${barcode}`);
    if (!res.ok) throw new Error();
    const json = await res.json();
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
          priceViewTimeout = setTimeout(showIdleScreen, 1000);
        });
      }, 500);
    } catch (e) {
      loader.style.display = "none";
      showMessageScreen("Produto não encontrado", "", "error");
      const msg = new SpeechSynthesisUtterance("Produto não encontrado");
      msg.lang = "pt-BR";
      if (selectedVoice) msg.voice = selectedVoice;
      msg.pitch = 1.0;
      msg.rate = 1.0;
      msg.onend = () => {
        priceViewTimeout = setTimeout(showIdleScreen, 1000);
      };
      speechSynthesis.speak(msg);
    }
  }

  barcodeInput.addEventListener("change", () => {
    const barcode = barcodeInput.value.trim();
    if (barcode.length > 3) {
      displayProduct(barcode);
    }
    barcodeInput.value = "";
  });

  barcodeInput.addEventListener("blur", () => {
    setTimeout(() => barcodeInput.focus(), 10);
  });

  const connector = new DeviceConnector({
    onOpen: () => {
      fetchAndResetPlaylist();
    },
    onMessage: (data) => {
      switch (data.type) {
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
          location.href = "/pair?error=revoked";
          break;
        case "TYPE_CHANGED":
          connector.disconnect(false);
          location.href =
            data.payload.newType === "busca_preco" ? "/price" : "/player";
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
  playlistInterval = setInterval(fetchAndResetPlaylist, 60000);

  showIdleScreen();
  fetchAndResetPlaylist();
});
