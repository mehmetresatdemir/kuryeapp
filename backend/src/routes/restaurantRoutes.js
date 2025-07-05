const express = require('express');
const router = express.Router();
const restaurantController = require('../controllers/restaurantController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Multer konfigürasyonu logo upload için
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // uploads klasörüne kaydet
    },
    filename: function (req, file, cb) {
        // Dosya adını unique yap: restaurant_id_timestamp.extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const restaurantId = req.params.restaurantId;
        cb(null, `restaurant_${restaurantId}_${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Sadece image dosyalarına izin ver
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'), false);
        }
    }
});

// Tüm restoranları getir (admin paneli için)
router.get('/', restaurantController.getAllRestaurants);

// Bir restorana ait mahalleleri getir (mobil uygulama için)
// Bu rota /:restaurantId'den önce olmalı
router.get('/neighborhoods', protect, restaurantController.getRestaurantNeighborhoods);

// Restoran girişi (mobil uygulama için)
router.post('/login', restaurantController.loginRestaurant);

// Tek bir restoranı getir (kurye navigasyon için)
// Bu rota en sona konulmalı çünkü catch-all route
router.get('/:restaurantId', restaurantController.getRestaurant);
// Geriye dönük uyumluluk için eski rota. Mobil app güncellenene kadar kalacak.
router.get('/:restaurantId/neighborhoods', protect, restaurantController.getRestaurantNeighborhoods);

// Restaurant profile management routes
router.get('/:restaurantId/profile', protect, restaurantController.getRestaurantProfile);
router.put('/:restaurantId/profile', protect, restaurantController.updateRestaurantProfile);
router.put('/:restaurantId/change-password', protect, restaurantController.changeRestaurantPassword);

// Logo upload routes
router.post('/:restaurantId/logo', protect, upload.single('logo'), restaurantController.uploadRestaurantLogo);
router.delete('/:restaurantId/logo', protect, restaurantController.deleteRestaurantLogo);

module.exports = router; 