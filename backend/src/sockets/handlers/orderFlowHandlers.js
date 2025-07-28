const { sql } = require('../../config/db-config');



const registerOrderFlowHandlers = (io, socket) => {
  // Teslimat Onayı İşlemleri (Kuryeden gelen)
  socket.on('deliveryConfirmation', async ({ orderId, courierId, restaurantId }) => {
    if (!orderId || !courierId || !restaurantId) return;

    try {
      const [orderData] = await sql`
        SELECT status, odeme_yontemi, firmaid, courier_price FROM orders WHERE id = ${orderId} AND kuryeid = ${courierId}
      `;

      if (!orderData) {
        return socket.emit('error', { message: 'Sipariş bulunamadı veya bu sipariş size ait değil.' });
      }

      const [courier] = await sql`SELECT name, phone FROM couriers WHERE id = ${courierId}`;
      const courierName = courier ? courier.name : `Kurye #${courierId}`;
      const paymentMethod = orderData.odeme_yontemi.toLowerCase();
      
      // Online ödeme veya hediye çeki ise direkt teslim edildi
      if (paymentMethod === 'online' || paymentMethod === 'hediye çeki' || paymentMethod === 'hediye ceki' || paymentMethod.includes('hediye')) {
        const currentTimestamp = new Date();
        await sql`UPDATE orders SET status = 'teslim edildi', 
                   delivered_at = ${currentTimestamp},
                   updated_at = ${currentTimestamp} 
                   WHERE id = ${orderId}`;
        
        // Emit socket event for real-time restaurant UI update
        io.to(`restaurant_${orderData.firmaid}`).emit('orderDelivered', {
          orderId: orderId.toString(),
          courierName: courierName,
          paymentMethod: paymentMethod,
          message: `Sipariş #${orderId} kurye ${courierName} tarafından teslim edildi`,
          timestamp: Date.now()
        });
        console.log(`🔄 Socket: Order delivered event sent to restaurant ${orderData.firmaid} - Order ${orderId} delivered by courier`);

      } else {
        // Nakit veya kredi kartı ödemeleri - onay gerekiyor
        await sql`UPDATE orders             SET status = 'onay bekliyor', 
                delivered_at = ${new Date()},
                updated_at = ${new Date()} 
                   WHERE id = ${orderId}`;
        
        // No socket event for "onay bekliyor" status - restaurant will get notified when they approve it
      }
    } catch (error) {
      console.error(`Delivery confirmation error for order ${orderId}:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Restoran tarafından teslimat onayı
  socket.on('approveDelivery', async ({ orderId, restaurantId }) => {
    if (!orderId || !restaurantId) return;

    try {
      const result = await sql`
        UPDATE orders SET status = 'teslim edildi', 
                      approved_at = ${new Date()},
                      updated_at = ${new Date()}
        WHERE id = ${orderId} AND firmaid = ${restaurantId} AND status = 'onay bekliyor'
        RETURNING 
            id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
            nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
            resim, status, kuryeid, preparation_time,
            created_at::text as created_at,
            updated_at::text as updated_at,
            accepted_at::text as accepted_at,
            delivered_at::text as delivered_at,
            approved_at::text as approved_at,
            courier_price, restaurant_price
      `;

      if (result.length > 0) {
        const deliveredOrder = result[0];
        const [courier] = await sql`SELECT name, phone FROM couriers WHERE id = ${deliveredOrder.kuryeid}`;
        const courierName = courier ? courier.name : `Kurye #${deliveredOrder.kuryeid}`;

        // Emit socket event for real-time restaurant UI update
        io.to(`restaurant_${deliveredOrder.firmaid}`).emit('orderDelivered', {
          orderId: orderId.toString(),
          courierName: courierName,
          paymentMethod: deliveredOrder.odeme_yontemi,
          message: `Sipariş #${orderId} onaylandı ve teslim edildi`,
          timestamp: Date.now()
        });
        console.log(`🔄 Socket: Order delivery approval event sent to restaurant ${deliveredOrder.firmaid} - Order ${orderId} approved and delivered`);

      } else {
        socket.emit('error', { message: 'Sipariş bulunamadı veya onaylamak için uygun durumda değil.' });
      }
    } catch (error) {
      console.error(`Delivery approval error for order ${orderId}:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Kurye tarafından sipariş iptali
  socket.on('cancelOrder', async ({ orderId, courierId, reason }) => {
    if (!orderId || !courierId) return;

    try {
      const [orderData] = await sql`SELECT status, odeme_yontemi, firmaid FROM orders WHERE id = ${orderId} AND kuryeid = ${courierId}`;
      if (!orderData) return;

      const [courier] = await sql`SELECT name, phone FROM couriers WHERE id = ${courierId}`;
      const courierName = courier ? courier.name : `Kurye #${courierId}`;

      // Siparişi iptal et ve tekrar havuza düşür (HTTP API ile tutarlı)
      await sql`
        UPDATE orders SET status = 'bekleniyor', kuryeid = NULL, accepted_at = NULL, updated_at = ${new Date()}
        WHERE id = ${orderId}
      `;

      // Emit socket event for real-time restaurant UI update
      io.to(`restaurant_${orderData.firmaid}`).emit('orderCancelled', {
        orderId: orderId.toString(),
        courierName: courierName,
        reason: reason || 'Belirtilmeyen sebep',
        message: `Sipariş kurye ${courierName} tarafından iptal edildi`,
        newStatus: 'bekleniyor',
        timestamp: Date.now()
      });
      console.log(`🔄 Socket: Order cancellation event sent to restaurant ${orderData.firmaid} - Order ${orderId} cancelled by courier`);

      // Send push notification to restaurant about order cancellation
      const { sendOrderCancelledByCarrierNotification } = require('../../services/pushNotificationService');
      try {
        const notificationResult = await sendOrderCancelledByCarrierNotification({
          restaurantId: orderData.firmaid,
          orderId: orderId,
          courierName: courierName,
          reason: reason || 'Belirtilmeyen sebep'
        });
        console.log(`🔔 Order cancelled notification sent to restaurant ${orderData.firmaid}: ${notificationResult.success ? 'success' : 'failed'}`);
      } catch (notificationError) {
        console.error('❌ Error sending order cancelled notification:', notificationError);
        // Don't fail the order cancellation if notification fails
      }
      
      // Emit to all couriers that order is back in pool
      io.to('couriers').emit('orderStatusUpdate', {
        orderId: orderId.toString(),
        status: 'bekleniyor',
        message: `Sipariş #${orderId} iptal edildi ve tekrar havuza düştü`,
        timestamp: Date.now()
      });
      console.log(`🔄 Socket: Order back in pool notification sent to all couriers for order ${orderId}`);

    } catch (error) {
      console.error(`Cancel order error for ${orderId}:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Otomatik sipariş silme
  socket.on('checkExpiredOrders', async () => {
    try {
      const expiredOrders = await sql`
        SELECT id, firmaid, mahalle FROM orders
        WHERE status = 'bekleniyor' AND created_at < NOW() - INTERVAL '1 hour'
      `;

      for (const order of expiredOrders) {
        await sql`DELETE FROM orders WHERE id = ${order.id}`;

        // Bildirim sistemi kaldırıldı
      }
    } catch (error) {
      console.error('Expired orders check error:', error);
    }
  });

  // Frontend'ten gelen yeni sipariş broadcast'i (restorandan)
  // ÇİFT BİLDİRİM ÖNLEMİ: Bu event TAMAMEN devre dışı bırakıldı
  // API düzeyinde zaten push notification gönderildiği için socket broadcast'ine gerek yok
  socket.on('broadcastNewOrder', async (data) => {
    console.log('🚫 Socket: broadcastNewOrder event TAMAMEN DEVRE DIŞI (sonsuz döngü önlemi):', {
      orderId: data?.order?.id,
      firmaid: data?.order?.firmaid
    });
    
    // Bildirim sistemi kaldırıldı
  });
};

module.exports = registerOrderFlowHandlers; 