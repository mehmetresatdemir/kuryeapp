const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// @desc    Authenticate user (courier or restaurant) for mobile app
// @route   POST /api/login
// @access  Public
router.post('/login', userController.unifiedLogin);

// @desc    Logout user and invalidate session
// @route   POST /api/logout
// @access  Private
router.post('/logout', protect, userController.logout);

// @desc    Refresh user token (extend session)
// @route   POST /api/refresh-token
// @access  Private
router.post('/refresh-token', protect, userController.refreshToken);

// @desc    Request password reset
// @route   POST /api/forgot-password
// @access  Public
router.post('/forgot-password', userController.requestPasswordReset);

// @desc    Reset password with token
// @route   POST /api/reset-password
// @access  Public
router.post('/reset-password', userController.resetPassword);

// @desc    Delete current user's account
// @route   DELETE /api/account
// @access  Private
router.delete('/account', protect, userController.deleteAccount);

module.exports = router; 