const http = require('http');
const env = require('./config/env');
const { createApp } = require('./config/app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { redis } = require('./config/redis');
const { initIO } = require('./sockets/io');
const { startQRRotationWorker, stopQRRotationWorker } = require('./sockets/qrRotation');
const { startSessionScheduler, stopSessionScheduler } = require('./sockets/sessionScheduler');
const logger = require('./config/logger');

async function main() {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  initIO(server);
  startQRRotationWorker();
  startSessionScheduler();

  // Bind IPv4 explicitly so Android devices can reach the Windows LAN address.
  // Recent Windows/Node combinations may treat the IPv6 wildcard as v6-only.
  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    stopQRRotationWorker();
    stopSessionScheduler();
    server.close(async () => {
      await disconnectDatabase();
      await redis.quit();
      logger.info('Clean shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException',  (err) => { logger.error('Uncaught exception:', err); shutdown('uncaughtException'); });
  process.on('unhandledRejection', (err) => { logger.error('Unhandled rejection:', err); });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
