const express = require('express');
const router = express.Router();
const { healthCheck, sql } = require('../config/db-config');
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
const contentRoutes = require('./contentRoutes');

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
router.use('/content', contentRoutes);



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

// Public registration settings (no auth) for mobile app
router.get('/registration-settings', async (req, res) => {
  try {
    const settings = await sql`
      SELECT setting_value FROM admin_settings 
      WHERE setting_key = 'registration_settings'
    `;

    let registrationSettings = {
      enable_courier_registration_ios: true,
      enable_restaurant_registration_ios: false,
      enable_courier_registration_android: true,
      enable_restaurant_registration_android: false
    };

    if (settings.length > 0) {
      const saved = settings[0].setting_value;
      registrationSettings = {
        enable_courier_registration_ios: saved.enableCourierRegistrationIos !== false,
        enable_restaurant_registration_ios: saved.enableRestaurantRegistrationIos === true,
        enable_courier_registration_android: saved.enableCourierRegistrationAndroid !== false,
        enable_restaurant_registration_android: saved.enableRestaurantRegistrationAndroid !== false
      };
    }

    res.json({ success: true, settings: registrationSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'registration_settings okunamadı: ' + error.message });
  }
});

module.exports = router; 