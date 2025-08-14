import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const playerWrapper = document.getElementById("player-wrapper");
  const mainZone = document.getElementById("zone-main");
  const secondaryZone = document.getElementById("zone-secondary");
  const categoryTitle = document.getElementById("category-title");
  const header = document.getElementById("menu-header");

  let playlist = [];
  let secondaryMedia = null;
  let currentIndex = -1;
  let mediaTimer = null;

  const setupLayout = (layoutType = "fullscreen") => {
    playerWrapper.className = `player-wrapper layout-${layoutType}`;
  };

  const renderSecondaryMedia = () => {
    if (!secondaryZone || !secondaryMedia) {
      secondaryZone.innerHTML = "";
      return;
    }

    const mediaElement = document.createElement(
      secondaryMedia.file_type.startsWith("video/") ? "video" : "img"
    );
    mediaElement.src = secondaryMedia.file_path;
    if (mediaElement.tagName === "VIDEO") {
      mediaElement.autoplay = true;
      mediaElement.muted = true;
      mediaElement.loop = true;
      mediaElement.playsInline = true;
    }
    mediaElement.className = "media-element active";
    secondaryZone.innerHTML = "";
    secondaryZone.appendChild(mediaElement);
  };

  const renderProductTable = (item) => {
    header.style.display = "flex";
    mainZone.style.backgroundColor = "transparent";
    mainZone.innerHTML = `
            <div class="menu-table">
                <ul id="product-list"></ul>
            </div>
        `;
    const productListEl = document.getElementById("product-list");
    categoryTitle.textContent = item.category;

    const productsToShow = Array.isArray(item.products)
      ? item.products.slice(0, 8)
      : [];

    productsToShow.forEach((p, index) => {
      const li = document.createElement("li");
      li.style.opacity = "0";
      li.style.transform = "translateY(10px)";
      li.style.transition = "opacity 0.5s, transform 0.5s";
      li.innerHTML = `
                <span class="product-name">${p.name}</span>
                <span class="product-price">R$ ${p.price}</span>`;
      productListEl.appendChild(li);
      setTimeout(() => {
        li.style.opacity = "1";
        li.style.transform = "translateY(0)";
      }, index * 100);
    });
  };

  const renderMedia = (item) => {
    header.style.display = "none";
    mainZone.innerHTML = "";
    mainZone.style.backgroundColor = "#000";

    const isVideo = item.file_type && item.file_type.startsWith("video/");
    if (!item.file_path) {
      playNextItem();
      return;
    }

    const newElement = document.createElement(isVideo ? "video" : "img");
    newElement.src = item.file_path;
    newElement.className = "media-element";

    if (isVideo) {
      newElement.autoplay = true;
      newElement.muted = true;
      newElement.playsInline = true;
      newElement.onended = () => playNextItem();
    } else {
      mediaTimer = setTimeout(
        () => playNextItem(),
        (item.duration || 10) * 1000
      );
    }

    mainZone.appendChild(newElement);
    requestAnimationFrame(() => newElement.classList.add("active"));
  };

  const showWaitingScreen = () => {
    header.style.display = "none";
    mainZone.style.backgroundColor = "#000";
    secondaryZone.innerHTML = "";
    mainZone.innerHTML = `
      <div class="player-message-card info">
        <i class="icon bi bi-clock-history"></i>
        <div class="message-content">
          <p class="message-title">Aguardando Conteúdo</p>
          <p class="message-subtitle">Nenhuma campanha ou lista de produtos ativa foi encontrada.</p>
        </div>
      </div>
    `;
  };

  const playNextItem = () => {
    if (mediaTimer) clearTimeout(mediaTimer);
    if (playlist.length === 0) {
      showWaitingScreen();
      return;
    }

    currentIndex = (currentIndex + 1) % playlist.length;
    const currentItem = playlist[currentIndex];

    if (currentItem.type === "products") {
      renderProductTable(currentItem);
      mediaTimer = setTimeout(
        () => playNextItem(),
        currentItem.duration || 15000
      );
    } else if (currentItem.type === "media") {
      renderMedia(currentItem);
    }
  };

  const startPlayback = (data) => {
    if (!data || !data.playlist || data.playlist.length === 0) {
      playlist = [];
      secondaryMedia = null;
      showWaitingScreen();
      return;
    }

    playlist = data.playlist || [];
    secondaryMedia = data.secondary_media || null;
    currentIndex = -1;

    setupLayout(data.layout_type);
    renderSecondaryMedia();
    playNextItem();
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "CONNECTION_ESTABLISHED":
        connector.sendMessage({ type: "REQUEST_PLAYLIST" });
        break;
      case "PLAYLIST_UPDATE":
        if (data.payload) {
          startPlayback(data.payload);
        } else {
          connector.sendMessage({ type: "REQUEST_PLAYLIST" });
        }
        break;
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
        connector.sendMessage({ type: "REQUEST_PLAYLIST" });
        break;
      case "FORCE_REFRESH":
        connector.disconnect(false);
        window.location.reload(true);
        break;
      case "DEVICE_REVOKED":
        connector.disconnect(false);
        window.location.href = "/pair?error=revoked";
        break;
      case "TYPE_CHANGED":
        connector.disconnect(false);
        const newType = data.payload.newType;
        if (newType === "terminal_consulta") {
          window.location.href = "/price";
        } else if (newType === "midia_indoor") {
          window.location.href = "/player";
        }
        break;
    }
  };

  const connector = new DeviceConnector({
    onMessage: handleServerMessage,
    onReconnecting: () => {},
    onAuthFailure: () => {
      window.location.href = "/pair?error=session_expired";
    },
  });

  connector.connect();
});
