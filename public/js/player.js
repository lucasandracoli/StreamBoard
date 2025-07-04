document.addEventListener("DOMContentLoaded", () => {
  const campaignContainer = document.getElementById("campaign-container");
  let playlist = [];
  let currentCampaignIndex = -1;

  let eventSource = null;
  let heartbeatIntervalId = null;

  const disconnectDevice = () => {
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    campaignContainer.innerHTML =
      '<div id="waiting-message" style="text-align: center;"><h1>Acesso Revogado</h1><p>Este dispositivo será redirecionado para a tela de pareamento.</p></div>';

    setTimeout(() => {
      window.location.href = "/pair";
    }, 5000);
  };

  const clearDisplay = () => {
    campaignContainer.innerHTML =
      '<p id="waiting-message">Aguardando campanha...</p>';
  };

  const displayCampaign = (campaign) => {
    campaignContainer.innerHTML = "";
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
      playNext();
    }
  };

  const playNext = () => {
    if (!eventSource) return;

    if (playlist.length === 0) {
      clearDisplay();
      return;
    }
    currentCampaignIndex = (currentCampaignIndex + 1) % playlist.length;
    displayCampaign(playlist[currentCampaignIndex]);
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
      playlist.sort((a, b) => a.execution_order - b.execution_order);
      playNext();
    } catch (error) {
      console.error("Erro ao buscar playlist inicial:", error);
    }
  };

  const handleUpdate = (data) => {
    const { type, payload } = data;
    let playlistChanged = false;

    if (type === "NEW_CAMPAIGN") {
      playlist.push(payload);
      playlistChanged = true;
    } else if (type === "DELETE_CAMPAIGN") {
      const initialLength = playlist.length;
      playlist = playlist.filter((c) => c.id !== Number(payload.campaignId));
      if (playlist.length < initialLength) playlistChanged = true;
    } else if (type === "DEVICE_REVOKED") {
      disconnectDevice();
      return;
    }

    if (playlistChanged) {
      playlist.sort((a, b) => a.execution_order - b.execution_order);
      currentCampaignIndex = -1;
      playNext();
    }
  };

  const connectToStream = () => {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource("/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleUpdate(data);
      } catch (e) {
        console.log("Mensagem informativa do servidor:", event.data);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(connectToStream, 5000);
    };
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
