export const statusCacheManager = {
  _cacheKey: "deviceStatusCache",
  getCache: function () {
    try {
      const cached = sessionStorage.getItem(this._cacheKey);
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      console.error("Erro ao ler cache de status:", e);
      return {};
    }
  },
  getStatus: function (deviceId) {
    const cache = this.getCache();
    return cache[deviceId] || null;
  },
  setStatus: function (deviceId, statusText) {
    const cache = this.getCache();
    cache[deviceId] = statusText;
    try {
      sessionStorage.setItem(this._cacheKey, JSON.stringify(cache));
    } catch (e) {
      console.error("Erro ao salvar cache de status:", e);
    }
  },
};