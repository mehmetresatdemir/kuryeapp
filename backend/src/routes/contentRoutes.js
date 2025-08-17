const express = require('express');
const router = express.Router();
const {
  getContentPages,
  getContentPage,
  createContentPage,
  updateContentPage,
  deleteContentPage,
  getActiveContentPages
} = require('../controllers/contentController');

// Public routes (mobil uygulama için)
router.get('/active', getActiveContentPages);
router.get('/page/:pageType', getContentPage);

// Admin routes (admin panel için)
router.get('/admin/all', getContentPages);
router.post('/admin/create', createContentPage);
router.put('/admin/update/:id', updateContentPage);
router.delete('/admin/delete/:id', deleteContentPage);

module.exports = router;
