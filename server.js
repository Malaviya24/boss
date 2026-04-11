import { bootstrapApp } from './src/app.js';

bootstrapApp().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'server_bootstrap_failed',
      error: error.message,
      stack: error.stack,
    }),
  );
  process.exit(1);
});
