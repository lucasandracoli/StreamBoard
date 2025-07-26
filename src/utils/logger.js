const logger = {
  info: (message) => {
    console.log(`[${new Date().toISOString()}] [INFO] ${message}`);
  },
  error: (message, error) => {
    console.error(
      `[${new Date().toISOString()}] [ERROR] ${message}`,
      error || ""
    );
  },
};

module.exports = logger;