document.addEventListener("DOMContentLoaded", () => {
  const campaignContainer = document.getElementById("campaign-container");
  const DEVICE_NAME = document.title.split("•")[0].trim();

  let playlist = [];
  let currentCampaignIndex = -1;
  let eventSource = null;
  let heartbeatIntervalId = null;

  const showWaitingScreen = () => {
    campaignContainer.style.backgroundColor = "var(--color-background)";
    campaignContainer.innerHTML = `
      <div class="player-placeholder">
        <div class="spinner"></div>
        <p>Aguardando Campanha...</p>
      </div>
    `;
  };

  const displayMedia = (campaign) => {
    campaignContainer.innerHTML = "";
    campaignContainer.style.backgroundColor = "#000";
    const fileExtension = campaign.midia?.split(".").pop().toLowerCase() || "";

    if (["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension)) {
      const img = document.createElement("img");
      img.src = campaign.midia;
      img.onerror = () => playNext();
      campaignContainer.appendChild(img);
      setTimeout(playNext, 10000);
    } else if (["mp4", "webm", "mov"].includes(fileExtension)) {
      const video = document.createElement("video");
      video.src = campaign.midia;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.onended = () => playNext();
      video.onerror = () => playNext();
      campaignContainer.appendChild(video);
    } else {
      console.warn("Formato de mídia não suportado:", fileExtension);
      playNext();
    }
  };

  const playNext = () => {
    if (playlist.length === 0) {
      showWaitingScreen();
      return;
    }
    currentCampaignIndex = (currentCampaignIndex + 1) % playlist.length;
    displayMedia(playlist[currentCampaignIndex]);
  };

  const resetAndPlay = () => {
    playlist.sort((a, b) => a.execution_order - b.execution_order);
    currentCampaignIndex = -1;
    playNext();
  };

  const handleUpdate = (data) => {
    const { type, payload } = data;

    switch (type) {
      case "NEW_CAMPAIGN":
        playlist.push(payload);
        resetAndPlay();
        break;

      case "DELETE_CAMPAIGN":
        const initialLength = playlist.length;
        playlist = playlist.filter((c) => c.id !== Number(payload.campaignId));
        if (playlist.length < initialLength) {
          resetAndPlay();
        }
        break;

      case "DEVICE_REVOKED":
        7;
        disconnectDevice();
        break;
    }
  };

  const disconnectDevice = () => {
    if (eventSource) eventSource.close();
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
    window.location.href = "/pair";
  };

  const connectToStream = () => {
    if (eventSource) eventSource.close();

    eventSource = new EventSource("/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleUpdate(data);
      } catch (e) {}
    };

    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(connectToStream, 5000);
    };
  };

  const fetchInitialPlaylist = async () => {
    try {
      const response = await fetch("/api/device/playlist");
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          disconnectDevice();
        }
        return;
      }
      playlist = await response.json();
      resetAndPlay();
    } catch (error) {
      console.error("Erro ao buscar playlist inicial:", error);
      setTimeout(fetchInitialPlaylist, 10000);
    }
  };

  const getLocalIpAddress = () => {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.createOffer().then(pc.setLocalDescription.bind(pc));
      let foundLocalAddress = null;
      let timeoutId;
      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) {
          return;
        }
        const candidateStr = ice.candidate.candidate;
        if (candidateStr.includes("typ host")) {
          const parts = candidateStr.split(" ");
          if (parts.length >= 5) {
            const address = parts[4];
            const numericalIpRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
            if (numericalIpRegex.test(address)) {
              foundLocalAddress = address;
              clearTimeout(timeoutId);
              pc.close();
              resolve(foundLocalAddress);
            } else if (address.endsWith(".local")) {
              foundLocalAddress = address;
            }
          }
        }
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          pc.close();
          clearTimeout(timeoutId);
          resolve(foundLocalAddress);
        }
      };
      timeoutId = setTimeout(() => {
        pc.close();
        resolve(foundLocalAddress);
      }, 2000);
    });
  };

  const sendDeviceHeartbeat = async () => {
    try {
      const connection = navigator.connection || {};
      const localIp = await getLocalIpAddress();
      const payload = {
        localIp: localIp || "N/A",
        effectiveType: connection.effectiveType || "unknown",
        downlink: connection.downlink || 0,
      };
      await fetch("/api/deviceHeartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Falha ao enviar heartbeat:", error);
    }
  };

  fetchInitialPlaylist();
  connectToStream();
  sendDeviceHeartbeat();
  heartbeatIntervalId = setInterval(sendDeviceHeartbeat, 60000);
});
