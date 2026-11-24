import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env, validateEnvironment } from './config/env.js';
import { expireUnpaidOrders } from './modules/orders/order-payments.service.js';

try {
  validateEnvironment();
  await connectDatabase();
  const server = app.listen(env.port, () =>
    console.log(`BuyNow API listening on port ${env.port}`),
  );

  // Release stock held by Paystack orders that were never paid. unref() lets shutdown proceed.
  const sweepExpiredOrders = () =>
    expireUnpaidOrders().catch((error) =>
      console.error(`Order expiry sweep failed (${error.code || error.name})`),
    );
  sweepExpiredOrders();
  const expiryTimer = setInterval(sweepExpiredOrders, 5 * 60 * 1000).unref();
  server.on('close', () => clearInterval(expiryTimer));

  server.on('error', async (error) => {
    console.error(`HTTP listener failed (${error.code || error.name}). Check port availability.`);
    await disconnectDatabase();
    process.exit(1);
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
} catch (error) {
  console.error(
    `Startup failed (${error.name}). Check environment settings and database connectivity.`,
  );
  await disconnectDatabase();
  process.exit(1);
}
