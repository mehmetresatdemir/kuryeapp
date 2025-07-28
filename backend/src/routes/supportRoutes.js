const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    createSupportTicket,
    getUserSupportTickets,
    createNeighborhoodRequest,
    getRestaurantNeighborhoodRequests
} = require('../controllers/supportController');

const router = express.Router();

// Destek talebi routes
router.post('/support-ticket', protect, createSupportTicket);
router.get('/support-tickets', protect, getUserSupportTickets);

// Mahalle ekleme talebi routes
router.post('/neighborhood-request', protect, createNeighborhoodRequest);
router.get('/neighborhood-requests', protect, getRestaurantNeighborhoodRequests);

module.exports = router; 