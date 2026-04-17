import mongoose from 'mongoose';

export async function connectMongo({ uri, logger }) {
  if (!uri) {
    logger?.warn?.('mongo_disabled_missing_uri');
    return { enabled: false };
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
    });
    logger?.info?.('mongo_connected');
    return { enabled: true };
  } catch (error) {
    logger?.error?.('mongo_connect_failed', {
      message: error.message,
      stack: error.stack,
    });
    return { enabled: false, error };
  }
}

export async function disconnectMongo({ logger } = {}) {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger?.info?.('mongo_disconnected');
}
