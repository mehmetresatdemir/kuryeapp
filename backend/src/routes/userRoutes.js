const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// @desc    Authenticate user (courier or restaurant) for mobile app
// @route   POST /api/login
// @access  Public
router.post('/login', userController.unifiedLogin);

module.exports = router; 