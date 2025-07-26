const getDeviceStatus = (device, onlineClients) => {
  const isOnline = onlineClients.hasOwnProperty(device.id);

  if (!device.is_active) {
    return { text: "Revogado", class: "revoked" };
  }
  if (isOnline) {
    return { text: "Online", class: "online" };
  }
  if (device.has_tokens) {
    return { text: "Offline", class: "offline" };
  }
  return { text: "Inativo", class: "inactive" };
};

module.exports = {
  getDeviceStatus,
};