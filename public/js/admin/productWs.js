export function setupProductWs() {
  const pageBody = document.querySelector("body.dashboard#products-page");
  if (!pageBody) return;

  const connect = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
    const ws = new WebSocket(wsUrl);

    ws.onclose = () => {
      setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  connect();
}
