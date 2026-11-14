const path = require('path');

module.exports = {
  apps: [
    {
      name: 'travellog',
      cwd: __dirname,
      script: path.resolve(__dirname, 'server.ts'),
      interpreter: 'node',
      node_args: '--import=tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      time: true,
      merge_logs: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3002,
      },
    },
  ],
};
