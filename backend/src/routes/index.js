const express = require('express');
const router = express.Router();
const { healthCheck } = require('../config/db-config');
const adminRoutes = require('./admin');
const orderRoutes = require('./orderRoutes');
const courierRoutes = require('./courierRoutes');
const restaurantRoutes = require('./restaurantRoutes');
const earningsRoutes = require('./earningsRoutes');
const userRoutes = require('./userRoutes');
const imageRoutes = require('./imageRoutes');
const preferenceRoutes = require('./preferenceRoutes');
const pushNotificationRoutes = require('./pushNotificationRoutes');

const supportRoutes = require('./supportRoutes');

// Admin routes
router.use('/admin', adminRoutes);
router.use('/orders', orderRoutes);
router.use('/couriers', courierRoutes);
router.use('/restaurants', restaurantRoutes);
router.use('/earnings', earningsRoutes);
router.use('/preferences', preferenceRoutes);
router.use('/push-notifications', pushNotificationRoutes);
router.use('/', pushNotificationRoutes); // For direct /send-notification endpoint
router.use('/', userRoutes);
router.use('/', imageRoutes);

router.use('/', supportRoutes);



// For backward compatibility with mobile app
router.use('/orders', orderRoutes);

// Veritabanı health check endpoint
router.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    res.json({
      status: 'ok',
      timestamp: new Date().toLocaleString('tr-TR'),
      database: dbHealth,
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toLocaleString('tr-TR'),
      error: error.message
    });
  }
});

module.exports = router; 