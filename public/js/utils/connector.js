export default class DeviceConnector {
  constructor(handlers) {
    this.ws = null;
    this.probeTimer = null;
    this.probeInterval = 5000;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectInterval = 30000;

    this.handlers = {
      onOpen: () => {},
      onMessage: () => {},
      onReconnecting: () => {},
      onAuthFailure: () => {},
      ...handlers,
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (this.ws === null || this.ws.readyState === WebSocket.CLOSED) {
          this.connect();
        }
      }
    });
  }

  async probeAndConnect() {
    try {
      const res = await fetch("/api/wsToken");
      if (res.status === 401 || res.status === 403) {
        this.disconnect(false);
        this.handlers.onAuthFailure();
        return;
      }
      if (!res.ok) throw new Error(`Status da resposta: ${res.status}`);

      const { accessToken } = await res.json();
      this.stopProbing();
      this.establishConnection(accessToken);
    } catch (err) {
      if (this.shouldReconnect) {
        console.error(
          "Falha ao sondar/obter token WebSocket, tentando novamente:",
          err
        );
      }
    }
  }

  startProbing() {
    if (this.probeTimer || !this.shouldReconnect) return;

    this.handlers.onReconnecting();

    this.probeAndConnect();
    this.probeTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.probeAndConnect();
      }
    }, this.probeInterval);
  }

  stopProbing() {
    clearInterval(this.probeTimer);
    this.probeTimer = null;
  }

  establishConnection(token) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${protocol}//${location.host}?token=${token}`);

    this.ws.onopen = () => {
      this.stopProbing();
      this.handlers.onOpen();
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.onMessage(data);
      } catch (err) {
        console.error("Erro ao processar mensagem WebSocket:", err);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        const delay = Math.min(
          this.maxReconnectInterval,
          1000 * Math.pow(2, this.reconnectAttempts)
        );
        this.reconnectAttempts++;
        setTimeout(() => this.startProbing(), delay);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.ws.close();
    };
  }

  connect() {
    this.shouldReconnect = true;
    this.startProbing();
  }

  disconnect(shouldReconnect = true) {
    this.shouldReconnect = shouldReconnect;
    this.stopProbing();
    if (this.ws) {
      this.ws.close(1000, "Desconexão intencional");
    }
  }
}
