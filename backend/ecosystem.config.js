module.exports = {
  apps: [{
    name: 'kurye-backend',
    script: './src/index.js',
    cwd: '/home/pi/kuryeapp-backend',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      API_HOST: '0.0.0.0'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      API_HOST: '0.0.0.0'
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    ignore_watch: [
      'node_modules',
      'logs',
      'uploads',
      '.git'
    ]
  }]
}; 