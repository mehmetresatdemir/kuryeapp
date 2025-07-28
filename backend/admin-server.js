#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Backend root directory'yi belirle
const BACKEND_ROOT = path.resolve(__dirname);

// Require dotenv early to load environment variables
require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env') });

if (process.env.NODE_ENV !== 'production') {
  console.log('🚀 Kurye App - Full Stack Server Starting...');
  console.log('📁 Backend Root Directory:', BACKEND_ROOT);
}

// Environment variables validation
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required');
  console.error('Backend root directory:', BACKEND_ROOT);
  console.error('Looking for .env file at:', path.join(BACKEND_ROOT, '.env'));
  console.error('');
  console.error('📝 .env dosyası oluşturmak için:');
  console.error('cp .env.example .env');
  process.exit(1);
}

// Create necessary directories
const requiredDirs = ['logs', 'uploads', 'uploads/orders', 'public'];
requiredDirs.forEach(dir => {
  const fullPath = path.join(BACKEND_ROOT, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📁 Created directory: ${dir}/`);
    }
  }
});

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");

// Import all backend functionality
const { testConnection } = require("./src/config/db-config");

const initializeSocket = require("./src/sockets");
const apiRoutes = require("./src/routes");
const orderRoutes = require('./src/routes/orderRoutes');
const courierRoutes = require('./src/routes/courierRoutes');
const restaurantRoutes = require('./src/routes/restaurantRoutes');
const adminRoutes = require('./src/routes/admin');
const userRoutes = require('./src/routes/userRoutes');


const app = express();
const server = http.createServer(app);

if (process.env.NODE_ENV !== 'production') {
  console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
  console.log('🌐 CORS Origin: *');
}

// CORS middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Request logging middleware - only in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Body parser middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Static files middleware
app.use(express.static(path.join(BACKEND_ROOT, 'public')));
app.use('/uploads', express.static(path.join(BACKEND_ROOT, 'uploads')));

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 120000,
  pingInterval: 30000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  connectTimeout: 45000,
  perMessageDeflate: false,
  httpCompression: false,
});

initializeSocket(io);

// Middleware to attach io to each request
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Custom logging middleware (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const timestamp = new Date().toLocaleString('tr-TR');
    console.log(`${timestamp} - ${req.method} ${req.url}`);
    next();
  });
}

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toLocaleString('tr-TR'),
    uptime: process.uptime(),
    backend_root: BACKEND_ROOT,
    env: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/connection-status', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = Math.floor(uptime / 3600) + 'h ' + 
                         Math.floor((uptime % 3600) / 60) + 'm ' + 
                         Math.floor(uptime % 60) + 's';
  
  res.json({
    status: 'OK',
    timestamp: new Date().toLocaleString('tr-TR'),
    uptime: uptimeFormatted,
    uptimeSeconds: Math.floor(uptime),
    backend_root: BACKEND_ROOT,
    env: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
    },
    connections: {
      socketConnections: io.engine.clientsCount || 0
    }
  });
});

// Admin panel routes
const adminPanelPages = [
  'admin-index.html',
  'admin-dashboard.html', 
  'admin-orders.html',
  'admin-restaurants.html',
  'admin-couriers.html',
  'admin-earnings.html',
  'admin-analytics.html',
  'admin-settings.html',
  'admin-db-management.html'
];

app.get('/admin/:page?', (req, res) => {
  const requestedPage = req.params.page || 'index';
  const fileName = requestedPage.startsWith('admin-') ? requestedPage + '.html' : 'admin-' + requestedPage + '.html';
  const filePath = path.join(BACKEND_ROOT, 'public', fileName);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Admin sayfa isteği: ${req.path} -> ${filePath}`);
  }
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Dosya bulunamadı: ${filePath}`);
    }
    // Default to index page
    const indexPath = path.join(BACKEND_ROOT, 'public', 'admin-index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send(`
        <html>
          <body>
            <h1>Admin Panel</h1>
            <p>Admin sayfası bulunamadı: ${fileName}</p>
            <p>Mevcut sayfalar:</p>
            <ul>
              ${adminPanelPages.map(page => `<li><a href="/admin/${page.replace('admin-', '').replace('.html', '')}">${page}</a></li>`).join('')}
            </ul>
          </body>
        </html>
      `);
    }
  }
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', userRoutes);

// Database health check endpoint
app.get('/api/db-health', async (req, res) => {
  const { healthCheck } = require('./src/config/db-config');
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toLocaleString('tr-TR')
    });
  }
});

// Root route redirect
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Express Error:', err);
  }
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Database initialization
if (process.env.NODE_ENV !== 'production') {
  console.log('🔌 Initializing database...');
}

testConnection().then(() => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ Database connection successful');
  }
}).catch(err => {
  console.error('❌ Database initialization failed:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.API_HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('');
    console.log('🎉 ================================');
    console.log('🚀 Kurye App Server is running!');
    console.log('🎉 ================================');
    console.log(`📡 Server: http://${HOST}:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`👨‍💼 Admin:  http://localhost:${PORT}/admin`);
    console.log(`🔌 API:    http://localhost:${PORT}/api`);
    console.log(`📁 Files:  http://localhost:${PORT}/uploads`);
    console.log('🎉 ================================');
    console.log('');
  } else {
    console.log(`🚀 Server running on ${HOST}:${PORT}`);
  }
});

// Graceful shutdown handlers with timeout
const shutdownGracefully = (signal) => {
  // Sessiz kapatma - console mesajları kaldırıldı
  const forceShutdown = setTimeout(() => {
    process.exit(1);
  }, 2000);
  
  server.close(() => {
    clearTimeout(forceShutdown);
    process.exit(0);
  });
  
  if (io) {
    io.close(() => {
      // Sessiz socket kapatma
    });
  }
};

process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

module.exports = { app, server, io }; 