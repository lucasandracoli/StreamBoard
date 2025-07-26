export default class DeviceConnector {
  constructor(handlers) {
    this.ws = null;
    this.probeTimer = null;
    this.probeInterval = 5000;
    this.shouldReconnect = true;

    this.handlers = {
      onOpen: () => {},
      onMessage: () => {},
      onReconnecting: () => {},
      onAuthFailure: () => {},
      ...handlers,
    };
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
      console.error("Falha ao sondar/obter token WebSocket:", err);
    }
  }

  startProbing() {
    if (this.probeTimer || !this.shouldReconnect) return;

    this.handlers.onReconnecting();

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

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${protocol}//${location.host}?token=${token}`);

    this.ws.onopen = this.handlers.onOpen;

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.onMessage(data);
      } catch (err) {
        console.error("Erro ao processar mensagem WebSocket:", err);
      }
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) this.startProbing();
    };

    this.ws.onerror = () => this.ws.close();
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