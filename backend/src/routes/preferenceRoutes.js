const express = require('express');
const router = express.Router();
const {
    getCourierPreferences,
    updateCourierPreferences,
    getRestaurantPreferences,
    updateRestaurantPreferences
} = require('../controllers/preferenceController');
const { protect } = require('../middleware/authMiddleware');

// Kurye tercihleri
router.get('/courier/:courierId', protect, getCourierPreferences);
router.put('/courier/:courierId', protect, updateCourierPreferences);

// Restoran tercihleri  
router.get('/restaurant/:restaurantId', getRestaurantPreferences);
router.put('/restaurant/:restaurantId', updateRestaurantPreferences);

module.exports = router; 