const path = require('path');
const fs = require('fs');

// Backend root directory path
const BACKEND_ROOT = __dirname.endsWith('/src') ? path.dirname(__dirname) : __dirname;

// .env dosyasını backend dizininden yükle
require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env') });

// Environment variables check
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required');
  process.exit(1);
}

// Logs directory oluştur - sadece development ortamında
if (process.env.NODE_ENV !== 'production') {
  const logsDir = path.join(BACKEND_ROOT, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Only create uploads directory
const uploadsDir = path.join(BACKEND_ROOT, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create sounds directory for notification sounds
const soundsDir = path.join(BACKEND_ROOT, 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");

const { testConnection } = require("./config/db-config");
const migrateUsersToRoles = require("./migrations/20240730_migrate_users_to_roles");
const initializeSocket = require("./sockets");
const apiRoutes = require("./routes");
const orderRoutes = require('./routes/orderRoutes');
const courierRoutes = require('./routes/courierRoutes');
const restaurantRoutes = require('./routes/restaurantRoutes');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/userRoutes');
const sessionCleanupService = require('./services/sessionCleanupService');
const pushNotificationRoutes = require('./routes/pushNotificationRoutes');
const updateForeignKeys = require("./migrations/20240730_update_foreign_keys");
const addApprovalStatus = require("./migrations/add_approval_status");
const createPasswordResetTable = require("./migrations/create_password_reset_table");
const createAllOptionalTables = require("./migrations/create_all_optional_tables");
const { preventDualRoleUsers } = require("./migrations/prevent_dual_role_users");

const app = express();
const server = http.createServer(app);

// Only log startup in development
if (process.env.NODE_ENV !== 'production') {
  console.log('🚀 Starting Kurye Backend Server...');
  console.log('📁 Backend Root Directory:', BACKEND_ROOT);
  console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
}

// CORS middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parser middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Static files middleware for admin panel
// Mutlak yol kullan
app.use(express.static(path.join(BACKEND_ROOT, 'public')));

// Uploads klasörü için static middleware
app.use('/uploads', express.static(uploadsDir));

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});
initializeSocket(io);

// Middleware to attach io to each request
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Database health check endpoint
app.get('/api/db-health', async (req, res) => {
  const { healthCheck } = require('./config/db-config');
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes); // General API routes like /api/login
app.use('/api/push-token', pushNotificationRoutes.router);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Express Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Test database connection and run migrations
testConnection().then(() => {
  return migrateUsersToRoles();
}).then(() => {
  return updateForeignKeys();
}).then(() => {
  return addApprovalStatus();
}).then(() => {
  return createPasswordResetTable();
}).then(() => {
  return createAllOptionalTables();
}).then(() => {
  return preventDualRoleUsers();
}).then(() => {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  
  server.listen(PORT, HOST, () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚀 Server running on ${HOST}:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    }
    
    // Session cleanup service'i başlat
    sessionCleanupService.start();
  });
}).catch(err => {
  console.error('❌ Database initialization failed:', err);
  process.exit(1);
});

// Enhanced error handling
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  server.close(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown function
const shutdownGracefully = (signal) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n🔄 ${signal} received, shutting down gracefully...`);
  }
  
  const forceShutdown = setTimeout(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️ Force shutting down...');
    }
    process.exit(1);
  }, 5000);

  server.close(() => {
    clearTimeout(forceShutdown);
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Server closed successfully');
    }
    process.exit(0);
  });

  io.close(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Socket connections closed');
    }
  });
};

// Listen for shutdown signals
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

module.exports = app; 