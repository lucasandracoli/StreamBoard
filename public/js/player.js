document.addEventListener("DOMContentLoaded", () => {
  const campaignContainer = document.getElementById("campaign-container");
  let playlist = [];
  let currentCampaignIndex = -1;

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
      if (!response.ok) return;
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
    }

    if (playlistChanged) {
      playlist.sort((a, b) => a.execution_order - b.execution_order);
      currentCampaignIndex = -1;
      playNext();
    }
  };

  const connectToStream = () => {
    const eventSource = new EventSource("/stream");

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

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) {
          resolve(null);
          return;
        }

        if (ice.candidate.candidate.includes("typ host")) {
          const ipRegex =
            /(192\.168(?:\.\d{1,3}){2}|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})/;
          const foundIp = ice.candidate.candidate.match(ipRegex);

          if (foundIp) {
            resolve(foundIp[0]);
            pc.onicecandidate = () => {};
            pc.close();
          }
        }
      };

      setTimeout(() => resolve(null), 1000);
    });
  };

  const sendDeviceHeartbeat = async () => {
    try {
      const ipResponse = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipResponse.json();

      const connection = navigator.connection || {};
      const localIp = await getLocalIpAddress();

      const payload = {
        ip: ipData.ip || "N/A",
        localIp: localIp || "N/A",
        effectiveType: connection.effectiveType || "unknown",
        downlink: connection.downlink || 0,
      };

      await fetch("/api/deviceHeartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("Heartbeat enviado:", payload);
    } catch (error) {
      console.error("Falha ao enviar heartbeat:", error);
    }
  };

  fetchInitialPlaylist();
  connectToStream();
  sendDeviceHeartbeat();
  setInterval(sendDeviceHeartbeat, 60000);
});
