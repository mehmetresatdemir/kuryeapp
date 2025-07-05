const { sql } = require('../../config/db-config');


const registerOrderFlowHandlers = (io, socket) => {
  // Teslimat Onayı İşlemleri (Kuryeden gelen)
  socket.on('deliveryConfirmation', async ({ orderId, courierId, restaurantId }) => {
    if (!orderId || !courierId || !restaurantId) {
      return;
    }

    try {
      const [orderData] = await sql`
        SELECT status, odeme_yontemi, firmaid FROM orders WHERE id = ${orderId} AND kuryeid = ${courierId}
      `;

      if (!orderData) {
        return socket.emit('error', { message: 'Sipariş bulunamadı veya bu sipariş size ait değil.' });
      }

      const paymentMethod = orderData.odeme_yontemi.toLowerCase();
      
      // Online ödeme veya hediye çeki ise direkt teslim edildi olarak işaretle
      if (paymentMethod === 'online' || paymentMethod === 'hediye çeki' || paymentMethod === 'hediye ceki') {
        

        await sql`
          UPDATE orders 
          SET status = 'teslim edildi', updated_at = NOW()
          WHERE id = ${orderId}
        `;
        
        const [courier] = await sql`
          SELECT name, phone FROM couriers WHERE id = ${courierId}
        `;

        const courierName = courier ? courier.name : `Kurye #${courierId}`;
        
        // Send notifications for direct delivery
        io.to(`restaurant_${orderData.firmaid}`).emit('delivery:completed', { 
          orderId, 
          courierId,
          courierName: courierName,
          message: `${courierName} siparişi teslim etti.`
        });
        io.to('restaurants').emit('delivery:completed', { 
          orderId, 
          courierId,
          courierName: courierName,
          message: `${courierName} siparişi teslim etti.`
        });
        
        io.to('admins').emit('orderStatusUpdate', { 
          orderId, 
          status: 'teslim edildi',
          courierName: courierName 
        });
        io.to(`restaurant_${orderData.firmaid}`).emit('orderStatusUpdate', { 
          orderId, 
          status: 'teslim edildi',
          courierName: courierName 
        });
        io.to('restaurants').emit('orderStatusUpdate', { 
          orderId, 
          status: 'teslim edildi',
          courierName: courierName 
        });
        socket.emit('orderStatusUpdate', { 
          orderId, 
          status: 'teslim edildi',
          courierName: courierName 
        });
      } else if (paymentMethod === 'nakit' || paymentMethod.includes('kredi')) {
        

        await sql`
          UPDATE orders 
          SET status = 'onay bekliyor', updated_at = NOW()
          WHERE id = ${orderId}
        `;
        
        const [courier] = await sql`
          SELECT name, phone FROM couriers WHERE id = ${courierId}
        `;

        const courierName = courier ? courier.name : `Kurye #${courierId}`;
        
        // Send notifications for approval needed
        io.to(`restaurant_${orderData.firmaid}`).emit('delivery:needs-approval', { 
          orderId, 
          courierId,
          courierName: courierName,
          message: `${courierName} siparişi teslim ettiğini bildirdi. Onayınız bekleniyor.`
        });
        io.to('restaurants').emit('delivery:needs-approval', { 
          orderId, 
          courierId,
          courierName: courierName,
          message: `${courierName} siparişi teslim ettiğini bildirdi. Onayınız bekleniyor.`
        });
        
        io.to('admins').emit('orderStatusUpdate', { 
          orderId, 
          status: 'onay bekliyor',
          courierName: courierName 
        });
        io.to(`restaurant_${orderData.firmaid}`).emit('orderStatusUpdate', { 
          orderId, 
          status: 'onay bekliyor',
          courierName: courierName 
        });
        io.to('restaurants').emit('orderStatusUpdate', { 
          orderId, 
          status: 'onay bekliyor',
          courierName: courierName 
        });
        socket.emit('orderStatusUpdate', { 
          orderId, 
          status: 'onay bekliyor',
          courierName: courierName 
        });
      }
    } catch (error) {
      console.error(`Error processing delivery confirmation for order ${orderId}:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Restoran tarafından teslimat onayı
  socket.on('approveDelivery', async ({ orderId, restaurantId }) => {
    if (!orderId || !restaurantId) {
      return;
    }

    try {
      

      const result = await sql`
        UPDATE orders 
        SET status = 'teslim edildi', updated_at = NOW()
        WHERE id = ${orderId} AND firmaid = ${restaurantId} AND status = 'onay bekliyor'
        RETURNING id, firmaid, kuryeid, courier_price; 
      `;

      if (result.length > 0) {
        const deliveredOrder = result[0];
        
        const [courier] = await sql`
          SELECT name, phone FROM couriers WHERE id = ${deliveredOrder.kuryeid}
        `;

        const courierName = courier ? courier.name : `Kurye #${deliveredOrder.kuryeid}`;

        io.to(`courier_${deliveredOrder.kuryeid}`).emit('orderDelivered', { 
          orderId: deliveredOrder.id,
          courierId: deliveredOrder.kuryeid,
          courierName: courierName,
          message: 'Siparişiniz restoran tarafından onaylandı ve teslim edildi!',
          orderDetails: deliveredOrder
        });

        io.to('admins').emit('orderStatusUpdate', { 
          orderId: deliveredOrder.id, 
          status: 'teslim edildi',
          courierName: courierName 
        });
        io.to(`restaurant_${deliveredOrder.firmaid}`).emit('orderStatusUpdate', { 
          orderId: deliveredOrder.id, 
          status: 'teslim edildi',
          courierName: courierName 
        });
        io.to('restaurants').emit('orderStatusUpdate', { 
          orderId: deliveredOrder.id, 
          status: 'teslim edildi',
          courierName: courierName 
        });

      } else {
        socket.emit('error', { message: 'Sipariş bulunamadı veya onaylamak için uygun durumda değil.' });
      }
    } catch (error) {
      console.error(`Error processing delivery approval for order ${orderId}:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Kurye tarafından sipariş iptali
  socket.on('cancelOrder', async ({ orderId, courierId }) => {
    if (!orderId || !courierId) {
      console.warn('Eksik bilgi: orderId ve courierId gereklidir.');
      return;
    }

    try {
      const [orderData] = await sql`SELECT status, odeme_yontemi, firmaid FROM orders WHERE id = ${orderId} AND kuryeid = ${courierId}`;

      if (!orderData) {
          console.warn(`Order ${orderId} not found or not assigned to courier ${courierId}. Cannot cancel.`);
          return; // Order not found or not assigned to this courier
      }

      // Kurye bilgilerini al
      const [courier] = await sql`
        SELECT name, phone FROM couriers WHERE id = ${courierId}
      `;

      const courierName = courier ? courier.name : `Kurye #${courierId}`;

      // Türkiye saati SQL ifadesini al
      

      // Update order status to 'iptal' and clear kuryeid, accepted_at
      const turkeyTime = new Date(new Date().getTime() + (3 * 60 * 60 * 1000));
      await sql`
          UPDATE orders
          SET 
              status = 'iptal',
              kuryeid = NULL,
              accepted_at = NULL,
              updated_at = ${turkeyTime}
          WHERE id = ${orderId}
      `;

      // Notify relevant parties
      socket.to(`restaurant_${orderData.firmaid}`).emit('orderCancelled', { 
        orderId: orderId, 
        message: `Sipariş ${courierName} tarafından iptal edildi.`, 
        courierName: courierName,
        showAlert: true 
      });
      io.to('restaurants').emit('orderCancelled', { 
        orderId: orderId, 
        message: `Sipariş ${courierName} tarafından iptal edildi.`, 
        courierName: courierName,
        showAlert: true 
      });
      io.to('admins').emit('orderStatusUpdate', { 
        orderId: orderId, 
        status: 'iptal',
        courierName: courierName 
      });

      // If payment method was cash or gift card, make it available again
      if (orderData.odeme_yontemi === 'Nakit' || orderData.odeme_yontemi === 'Hediye Çeki') {
          // Re-broadcast to all couriers as available
          io.emit('orderAvailableAgain', { orderId: orderId, message: "Sipariş tekrar müsait oldu.", status: 'bekleniyor' });
      }

    } catch (error) {
      console.error(`Sipariş #${orderId} iptal işlemi işlenirken hata:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Kurye tarafından teslim edildi olarak işaretle
  socket.on('deliverOrder', async ({ orderId, courierId }) => {
    if (!orderId || !courierId) {
      console.warn('Eksik bilgi: orderId ve courierId gereklidir.');
      return;
    }

    try {
      // Kurye bilgilerini al
      const [courier] = await sql`
        SELECT ad, soyad, telefon FROM kuryeler WHERE id = ${courierId}
      `;

      const courierName = courier ? `${courier.ad} ${courier.soyad}` : `Kurye #${courierId}`;

      // Türkiye saati SQL ifadesini al
      

      // Update order status to 'teslim edildi'
      const turkeyTime = new Date(new Date().getTime() + (3 * 60 * 60 * 1000));
      const [updatedOrder] = await sql`
          UPDATE orders SET status = 'teslim edildi', updated_at = ${turkeyTime} WHERE id = ${orderId}
          RETURNING id, firmaid, kuryeid, courier_price; 
      `;

      if (updatedOrder) {
          // Sadece ilgili restorana emit
          socket.to(`restaurant_${updatedOrder.firmaid}`).emit('orderDelivered', { 
              orderId: updatedOrder.id,
              courierId: updatedOrder.kuryeid,
              courierName: courierName,
              message: `Sipariş ${courierName} tarafından başarıyla teslim edildi!`,
              orderDetails: updatedOrder // Kurye ücretini göndermek için
          });
          
          console.log(`📦 Onay sonrası teslim bildirimi sadece restaurant_${updatedOrder.firmaid} odasına gönderildi`);
          // Emit to admins
          io.to('admins').emit('orderStatusUpdate', { 
            orderId: updatedOrder.id, 
            status: 'teslim edildi',
            courierName: courierName 
          });
          
          console.log(`Order ${orderId} delivered by courier ${courierName} (${courierId})`);
      }
    } catch (error) {
      console.error(`Sipariş #${orderId} teslim işlemi işlenirken hata:`, error);
      socket.emit('error', { message: 'İşlem sırasında bir sunucu hatası oluştu.' });
    }
  });

  // Otomatik sipariş silme (1 saatlik zaman aşımı)
  socket.on('checkExpiredOrders', async () => {
    try {
      // 'bekleniyor' durumundaki ve 1 saatten eski siparişleri bul
      const expiredOrders = await sql`
        SELECT id, firmaid, mahalle FROM orders
        WHERE status = 'bekleniyor' AND created_at < NOW() - INTERVAL '1 hour'
      `;

      for (const order of expiredOrders) {
        // Siparişi sil
        await sql`DELETE FROM orders WHERE id = ${order.id}`;

        // Restoranı bilgilendir
        io.to(`restaurant_${order.firmaid}`).emit('yourOrderExpired', { 
          orderId: order.id,
          message: `Sipariş #${order.id}, ${order.mahalle} adresine olan siparişiniz 1 saat içinde kabul edilmediği için otomatik olarak silindi.`
        });
        io.to('restaurants').emit('yourOrderExpired', { 
          orderId: order.id,
          message: `Sipariş #${order.id}, ${order.mahalle} adresine olan siparişiniz 1 saat içinde kabul edilmediği için otomatik olarak silindi.`
        });

        // Adminleri bilgilendir
        io.to('admins').emit('orderAutoDeleted', { 
          orderId: order.id,
          firmName: order.firma_adi, // firmaid yerine firma_adi kullan
          neighborhood: order.mahalle,
          message: `Sipariş #${order.id} (Restoran: ${order.firma_adi}, Mahalle: ${order.mahalle}) otomatik olarak silindi (1 saat zaman aşımı).`
        });

        console.log(`Sipariş #${order.id} otomatik olarak silindi.`);
      }
    } catch (error) {
      console.error('Error checking expired orders:', error);
    }
  });
};

module.exports = registerOrderFlowHandlers; 