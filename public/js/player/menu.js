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
    if (!secondaryZone || !secondaryMedia) return;

    const mediaElement = document.createElement(
      secondaryMedia.file_type.startsWith("video/") ? "video" : "img"
    );
    mediaElement.src = secondaryMedia.file_path;
    if (mediaElement.tagName === "VIDEO") {
      mediaElement.autoplay = true;
      mediaElement.muted = true;
      mediaElement.loop = true;
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

    const productsToShow = item.products.slice(0, 8);

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

    const isVideo = item.file_type.startsWith("video/");
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

  const playNextItem = () => {
    if (mediaTimer) clearTimeout(mediaTimer);
    if (playlist.length === 0) {
      header.style.display = "flex";
      categoryTitle.textContent = "Aguardando conteúdo";
      mainZone.innerHTML = `
                <div class="menu-table">
                    <ul id="product-list"></ul>
                </div>
            `;
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
    if (!data) return;

    playlist = data.playlist || [];
    secondaryMedia = data.secondary_media || null;
    currentIndex = -1;

    setupLayout(data.layout_type);
    if (secondaryMedia) {
      renderSecondaryMedia();
    }
    playNextItem();
  };

  const fetchAndResetPlaylist = async () => {
    try {
      const res = await fetch("/api/device/playlist", { cache: "no-store" });
      if (!res.ok) {
        if ([401, 403].includes(res.status)) {
          connector.disconnect(false);
          location.href = "/pair?error=session_expired";
        }
        return;
      }
      const data = await res.json();
      startPlayback(data);
    } catch (e) {
      setTimeout(fetchAndResetPlaylist, 10000);
    }
  };

  const connector = new DeviceConnector({
    onOpen: () => fetchAndResetPlaylist(),
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
          setTimeout(() => {
            location.href = "/pair?error=revoked";
          }, 4000);
          break;
        case "TYPE_CHANGED":
          connector.disconnect(false);
          location.href =
            data.payload.newType === "digital_menu"
              ? "/menu"
              : data.payload.newType === "terminal_consulta"
              ? "/price"
              : "/player";
          break;
      }
    },
    onReconnecting: () => {},
    onAuthFailure: () => {
      setTimeout(() => (location.href = "/pair?error=session_expired"), 4000);
    },
  });

  connector.connect();
});
