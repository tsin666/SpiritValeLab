const path = require('node:path')

const root = __dirname

module.exports = {
  apps: [
    {
      name: 'spiritvale-redis',
      cwd: root,
      script: path.join(root, 'scripts/ensure-redis.mjs'),
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '120M',
      env: {
        NODE_ENV: 'production',
        SPIRITVALE_WSL_DISTRO: process.env.SPIRITVALE_WSL_DISTRO || 'Ubuntu'
      }
    },
    {
      name: 'spiritvale-api',
      cwd: root,
      script: path.join(root, 'apps/api/dist/server.js'),
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4100',
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spiritvale_lab',
        REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
      }
    },
    {
      name: 'spiritvale-web',
      cwd: root,
      script: path.join(root, 'apps/web/.output/server/index.mjs'),
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
        NUXT_PUBLIC_API_BASE: 'http://127.0.0.1:4100'
      }
    }
  ]
}
