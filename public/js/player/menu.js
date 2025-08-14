import DeviceConnector from "../utils/connector.js";

document.addEventListener("DOMContentLoaded", () => {
  const playerWrapper = document.getElementById("player-wrapper");
  const mainZone = document.getElementById("zone-main");
  const secondaryZone = document.getElementById("zone-secondary");
  const categoryTitle = document.getElementById("category-title");
  const header = document.getElementById("menu-header");
  let clockInterval = null;

  let productGroups = [];
  let primaryMedia = [];
  let secondaryMedia = null;
  let productIndex = 0;
  let mediaIndex = 0;
  let mediaTimer = null;
  let isDisplayingProducts = true;

  const setupLayout = (layoutType = "fullscreen") => {
    playerWrapper.className = `player-wrapper layout-${layoutType}`;
    header.classList.toggle("split", layoutType !== "fullscreen");
    secondaryZone.style.display = layoutType === "fullscreen" ? "none" : "flex";
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
    let weatherContentHtml;
    if (weatherData) {
      const { current, daily } = weatherData;
      const temp = Math.round(current.temperature_2m);
      const maxTemp = Math.round(daily.temperature_2m_max[0]);
      const minTemp = Math.round(daily.temperature_2m_min[0]);
      const { iconClass, colorClass } = getWeatherIcon(current.weather_code);
      weatherContentHtml = `
          <div class="weather-city">${city || ""}</div>
          <i class="bi ${iconClass} weather-icon ${colorClass}"></i>
          <div class="weather-temp">${temp}°C</div>
          <div class="weather-minmax">
            <i class="bi bi-arrow-up"></i> ${maxTemp}° <i class="bi bi-arrow-down"></i> ${minTemp}°
          </div>`;
    } else {
      weatherContentHtml = `<div class="weather-error">Não foi possível carregar o clima.</div>`;
    }
    secondaryZone.innerHTML = `
        <div class="weather-widget">
            <div class="weather-main-content">${weatherContentHtml}</div>
            <div id="clock-container" class="clock-display"></div>
        </div>`;
    renderClock();
  };

  const renderSecondaryMedia = () => {
    if (!secondaryMedia) {
      secondaryZone.innerHTML = "";
      return;
    }

    if (secondaryMedia.type === "weather") {
      renderWeather(secondaryMedia.weather, secondaryMedia.city);
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
    mainZone.style.paddingTop = "var(--header-height)";
    mainZone.style.backgroundColor = "#f0f0f0";
    mainZone.innerHTML = `
            <div class="menu-table">
                <ul id="product-list"></ul>
            </div>
        `;
    const productListEl = document.getElementById("product-list");
    categoryTitle.textContent = item.category;

    const productsToShow = Array.isArray(item.products)
      ? item.products.slice(0, 6)
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
    mainZone.style.paddingTop = "0";
    mainZone.innerHTML = "";
    mainZone.style.backgroundColor = "#000";

    if (!item.file_path) {
      playNextItem();
      return;
    }
    const isVideo = item.file_type && item.file_type.startsWith("video/");
    const newElement = document.createElement(isVideo ? "video" : "img");
    newElement.src = item.file_path;
    newElement.className = "media-element";

    const oldElement = mainZone.querySelector(".media-element.active");
    mainZone.appendChild(newElement);

    const onMediaReady = () => {
      requestAnimationFrame(() => {
        newElement.classList.add("active");
        if (oldElement) {
          oldElement.classList.remove("active");
          oldElement.addEventListener(
            "transitionend",
            () => {
              if (oldElement.tagName === "VIDEO") {
                oldElement.pause();
                oldElement.src = "";
              }
              oldElement.remove();
            },
            { once: true }
          );
          setTimeout(() => {
            if (oldElement && oldElement.parentNode) {
              if (oldElement.tagName === "VIDEO") {
                oldElement.pause();
                oldElement.src = "";
              }
              oldElement.remove();
            }
          }, 1000);
        }
      });
    };

    if (isVideo) {
      newElement.autoplay = true;
      newElement.muted = true;
      newElement.playsInline = true;
      newElement.onloadeddata = onMediaReady;
      newElement.onended = () => playNextItem();
      newElement.onerror = () => playNextItem();
    } else {
      newElement.onload = onMediaReady;
      mediaTimer = setTimeout(
        () => playNextItem(),
        (item.duration || 10) * 1000
      );
    }
  };

  const showWaitingScreen = () => {
    header.style.display = "none";
    mainZone.style.paddingTop = "0";
    mainZone.style.backgroundColor = "#000";
    secondaryZone.innerHTML = "";
    setupLayout("fullscreen");
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
    if (productGroups.length === 0 && primaryMedia.length === 0) {
      showWaitingScreen();
      return;
    }

    if (isDisplayingProducts && productGroups.length > 0) {
      const currentProductGroup = productGroups[productIndex];
      renderProductTable(currentProductGroup);
      mediaTimer = setTimeout(
        () => playNextItem(),
        currentProductGroup.duration || 15000
      );

      productIndex++;
      if (productIndex >= productGroups.length) {
        isDisplayingProducts = false;
        productIndex = 0;
      }
    } else if (primaryMedia.length > 0) {
      const currentMediaItem = primaryMedia[mediaIndex];
      renderMedia({ type: "media", ...currentMediaItem });

      mediaIndex = (mediaIndex + 1) % primaryMedia.length;
      isDisplayingProducts = true;
    } else if (productGroups.length > 0) {
      isDisplayingProducts = true;
      productIndex = 0;
      playNextItem();
    } else {
      showWaitingScreen();
    }
  };

  const startPlayback = (data) => {
    if (
      !data ||
      (!data.product_groups?.length && !data.primary_media?.length)
    ) {
      productGroups = [];
      primaryMedia = [];
      secondaryMedia = null;
      showWaitingScreen();
      return;
    }

    productGroups = data.product_groups || [];
    primaryMedia = data.primary_media || [];
    secondaryMedia = data.secondary_media || null;
    productIndex = 0;
    mediaIndex = 0;
    isDisplayingProducts = productGroups.length > 0;

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
        startPlayback(data.payload);
        break;
      case "NEW_CAMPAIGN":
      case "UPDATE_CAMPAIGN":
      case "DELETE_CAMPAIGN":
      case "PRODUCT_UPDATE_NOTIFICATION":
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
