const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const path = require('path');
const fs = require('fs');

// Mevcut siparişleri getir
// GET /api/orders/status
router.get('/status', orderController.getOrdersByStatus);

// Yeni sipariş ekle - Bu genellikle kimlik doğrulamalı bir kullanıcı (müşteri veya restoran) tarafından yapılır.
router.post('/', protect, upload.single('orderImage'), orderController.addOrder);

// Sipariş durumunu güncelle (örneğin iptal etme, hazırlamaya başlama)
// Sadece yetkili kullanıcılar (ilgili restoran vb.) yapabilmeli
router.put('/:orderId/status', protect, orderController.updateOrderStatus);

// Sipariş bilgilerini güncelle (restoran tarafından)
router.put('/update/:orderId', protect, upload.single('orderImage'), orderController.updateOrder);

// Bir siparişe kurye ata (sadece admin)
router.put('/:orderId/assign-courier', protect, orderController.assignCourier);

// Bir kuryeye atanmış aktif siparişleri getir
// Sadece ilgili kurye kendi siparişlerini görebilmeli
router.get('/courier/:courierId/active', protect, orderController.getActiveOrdersForCourier);

// Kuryenin tercihlerine göre mevcut siparişleri getir
router.get('/courier/:courierId/with-preferences', protect, orderController.getOrdersForCourierWithPreferences);

// Bir restorana ait siparişleri getir
// Sadece ilgili restoran kendi siparişlerini görebilmeli
router.get('/restaurant/:restaurantId', protect, orderController.getOrdersForRestaurant);

// Sipariş kabul etme (kurye tarafından)
router.post('/accept', protect, orderController.acceptOrders);

// Sipariş teslim etme (kurye tarafından)
router.post('/deliver', protect, orderController.deliverOrder);

// Sipariş iptal etme (kurye tarafından)
router.post('/cancel', protect, orderController.cancelOrder);

// Sipariş onaylama (restoran tarafından)
router.post('/approve', protect, orderController.approveOrder);

// Onay bekleyen siparişleri getir (kurye için)
router.get('/courier/:courierId/pending-approval', protect, orderController.getPendingApprovalOrdersForCourier);

// Onay bekleyen siparişleri getir (restoran için)
router.get('/restaurant/:restaurantId/pending-approval', protect, orderController.getPendingApprovalOrdersForRestaurant);

// Sipariş silme endpoint'i (admin ve restoran yetkisiyle)
router.delete('/:orderId', protect, orderController.deleteOrder);

// Image deletion endpoint
router.delete('/deleteImage/:filename', async (req, res) => {
  const { filename } = req.params;
  
  try {
    const imagePath = path.join(__dirname, '../../uploads', filename);
    
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    res.json({ success: true, message: 'Resim başarıyla silindi' });
  } catch (error) {
    console.error(`Sipariş resmi silinirken hata:`, error);
    res.status(500).json({ success: false, message: 'Resim silinirken hata oluştu' });
  }
});

module.exports = router; 