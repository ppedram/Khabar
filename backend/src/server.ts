import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { setupWebSocket } from './websocket/socket.js';
import { startJobWorkers, stopJobWorkers } from './jobs/queue.js';

async function main(): Promise<void> {
  try {
    // Connect to databases
    await connectDatabase();
    await connectRedis();

    // Build Fastify app
    const app = await buildApp();

    // Setup WebSocket
    setupWebSocket(app);

    // Start job workers
    await startJobWorkers();

    // Start server
    await app.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        docs: `http://localhost:${config.port}/docs`,
      },
      'Server started'
    );

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info({ signal }, 'Received shutdown signal');
        try {
          await app.close();
          await stopJobWorkers();
          await disconnectDatabase();
          await disconnectRedis();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error during shutdown');
          process.exit(1);
        }
      });
    }
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
