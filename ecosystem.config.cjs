module.exports = {
  apps: [
    {
      name: 'matkaking-backend',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '512M',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
