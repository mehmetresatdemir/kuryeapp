const express = require('express');
const router = express.Router();
const courierController = require('../controllers/courierController');
const { protect } = require('../middleware/authMiddleware');
const { sql } = require('../config/db-config');


// Tüm kuryeleri getir (admin paneli için)
router.get('/', courierController.getAllCouriers);

// Tek kurye getir (ID ile)
router.get('/:id', courierController.getCourierById);

// Kurye kayıt (mobil uygulama için)
router.post('/register', courierController.addCourier);

// Kurye girişi (mobil uygulama için)
router.post('/login', courierController.login);

// Kurye konum ve durumunu güncelleme (mobil uygulama için)
router.put('/presence/:id', protect, courierController.updateLocationAndStatus);

// Kuryenin kazançlarını getir (mobil uygulama için)
router.get('/:courierId/earnings', protect, courierController.getCourierEarnings);

// Kuryenin teslimat istatistiklerini getir (ortalama süre, performans metrikleri)
router.get('/:courierId/delivery-stats', protect, courierController.getCourierDeliveryStats);

// Kurye profil güncelleme (mobil uygulama için)
router.put('/:id/profile', protect, courierController.updateCourierProfile);

// Aktivite takibi endpoint'leri
router.post('/:courierId/activity/start', protect, courierController.startCourierActivitySession);
router.post('/:courierId/activity/end', protect, courierController.endCourierActivitySession);
router.get('/:courierId/activity-report', protect, courierController.getCourierActivityReport);
router.get('/activity/summary', protect, courierController.getAllCouriersActivitySummary);

// Toplam çevrimiçi süre endpoint'leri
router.get('/:courierId/total-online-time', protect, courierController.getTotalOnlineTime);
router.post('/:courierId/total-online-time', protect, courierController.updateTotalOnlineTime);

// Kurye konumu güncelleme
router.post('/:id/location', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude } = req.body;
        const { id: userId, role } = req.user;

        // Yetki kontrolü
        if (role !== 'admin' && parseInt(id) !== userId) {
            return res.status(403).json({ success: false, message: 'Bu işleme erişim yetkiniz yok.' });
        }

        await sql`
            UPDATE couriers 
            SET latitude = ${latitude}, longitude = ${longitude}, updated_at = ${new Date()}
            WHERE id = ${id}
        `;

        // Socket ile canlı konum güncellemesi gönder
        if (req.io) {
            // Admin paneline konum güncellemesi gönder
            req.io.to('admins').emit('locationUpdate', {
                courierId: id,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                timestamp: new Date().toLocaleString('tr-TR')
            });

            // Aktif siparişi olan restoranlara konum gönder
            const activeOrders = await sql`
                SELECT id, firmaid FROM orders 
                WHERE kuryeid = ${id} AND status = 'kuryede'
            `;

            activeOrders.forEach(order => {
                req.io.to(`restaurant_${order.firmaid}`).emit('courierLocation', {
                    orderId: order.id,
                    courierId: id,
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                    timestamp: new Date().toLocaleString('tr-TR')
                });
            });
        }

        res.json({ 
            success: true, 
            message: 'Konum başarıyla güncellendi',
            location: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
        });
    } catch (error) {
        console.error('Konum güncelleme hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

module.exports = router; 