const { sql } = require('../../config/db-config');


// Memory cache for location throttling - her kurye için son konum güncellemesi zamanı
const locationThrottleCache = new Map();
const LOCATION_UPDATE_INTERVAL = 60000; // 1 dakika = 60000ms

// Online kurye takibi için global cache
const onlineCouriers = new Map(); // courierId -> { socketId, joinTime, lastActivity }
const onlineRestaurants = new Map(); // restaurantId -> { socketId, joinTime, lastActivity }

const registerRoomHandlers = (io, socket) => {
  // Bağlantı kalitesi izleme - az loglama
  let connectionQuality = 'good';
  let missedHeartbeats = 0;
  const MAX_MISSED_HEARTBEATS = 15; // Further increased tolerance
  
  // Socket için ping-pong sistemi
  socket.on('ping', () => {
    socket.emit('pong');
    missedHeartbeats = 0;
    connectionQuality = 'good';
  });
  
  // Raspberry Pi için özel heartbeat sistemi - az frekans
  const heartbeatInterval = setInterval(() => {
    socket.emit('server-ping', { timestamp: Date.now() });
    missedHeartbeats++;
    
    // No logging for poor connections
    if (missedHeartbeats > MAX_MISSED_HEARTBEATS) {
      connectionQuality = 'poor';
    }
  }, 45000); // Further reduced frequency to 45 seconds
  
  // Heartbeat cleanup
  socket.on('disconnect', () => {
    clearInterval(heartbeatInterval);
  });

  // Kurye odalarına katılma - Raspberry Pi için optimize edilmiş
  socket.on("joinCourierRoom", async (data) => {
    const { courierId, deviceInfo } = data;
    if (courierId) {
      try {
        const result = await sql`
          SELECT id, name, email, is_blocked FROM couriers WHERE id = ${courierId}
        `;
        
        if (result.length === 0) {
          socket.emit("connectionRejected", { 
            message: "Kurye bulunamadı.",
            reason: "COURIER_NOT_FOUND",
            courierId: courierId
          });
          socket.disconnect();
          return;
        }
        
        if (result[0].is_blocked) {
          socket.emit("connectionRejected", { 
            message: "Hesabınız engellenmiştir. Lütfen yöneticiyle iletişime geçin.",
            reason: "ACCOUNT_BLOCKED",
            courierId: courierId
          });
          socket.disconnect();
          return;
        }
        
        // Mevcut bağlantıları kontrol et ve eskisini kapat
        if (onlineCouriers.has(courierId)) {
          const existingConnection = onlineCouriers.get(courierId);
          console.log(`🔄 Kurye ${courierId} için mevcut bağlantı kapatılıyor: ${existingConnection.socketId}`);
          
          // Eski socket'i kapat
          const existingSocket = io.sockets.sockets.get(existingConnection.socketId);
          if (existingSocket) {
            existingSocket.disconnect();
          }
        }
        
        socket.join("couriers");
        socket.join(`courier_${courierId}`);
        socket.courierId = courierId;
        
        // Online kurye listesine ekle
        onlineCouriers.set(courierId, {
          socketId: socket.id,
          joinTime: new Date(),
          lastActivity: new Date(),
          courierInfo: result[0],
          deviceInfo: deviceInfo || 'Unknown Device',
          connectionQuality: connectionQuality,
          reconnectCount: 0
        });
        
        // Veritabanında online durumunu güncelle
        
        await sql`
          UPDATE couriers 
          SET is_online = true, updated_at = NOW()
          WHERE id = ${courierId}
        `;
        
        // Admin paneline bildir
        io.to("admins").emit("courierOnlineStatusChanged", {
          courierId,
          isOnline: true,
          totalOnline: onlineCouriers.size,
          courierInfo: result[0],
          deviceInfo: deviceInfo
        });
        
        // Bağlantı başarılı mesajı gönder
        socket.emit("connectionSuccess", {
          message: "Bağlantı başarılı",
          courierId: courierId,
          serverTime: new Date().toISOString(),
          pingInterval: 15000
        });
        
        console.log(`🚚 Kurye ${courierId} odalara katıldı: couriers, courier_${courierId} [${deviceInfo || 'Unknown Device'}]`);
      } catch (error) {
        console.error("joinCourierRoom error:", error);
        socket.emit("connectionError", { 
          message: "Sunucu hatası: " + error.message,
          shouldRetry: true,
          retryAfter: 5000
        });
        // Hata durumunda bağlantıyı hemen kesmeyelim, client retry yapabilsin
      }
    } else {
      socket.emit("connectionError", { message: "Kurye ID gereklidir" });
    }
  });

  // Restaurant odalarına katılma
  socket.on("joinRestaurantRoom", (data) => {
    const { restaurantId } = data;
    if (restaurantId) {
      socket.join("restaurants");
      socket.join(`restaurant_${restaurantId}`);
      socket.restaurantId = restaurantId;
      
      // Online restaurant listesine ekle
      onlineRestaurants.set(restaurantId, {
        socketId: socket.id,
        joinTime: new Date(),
        lastActivity: new Date()
      });
      
      // Admin paneline bildir
      io.to("admins").emit("restaurantOnlineStatusChanged", {
        restaurantId,
        isOnline: true,
        totalOnline: onlineRestaurants.size
      });
      
      console.log(`🍽️ Restaurant ${restaurantId} odalara katıldı: restaurants, restaurant_${restaurantId}`);
    }
  });

  // Admin odalarına katılma
  socket.on("joinAdminRoom", () => {
    socket.join("admins");
    
    // Admin bağlandığında mevcut online durumunu gönder
    socket.emit("onlineStats", {
      totalOnlineCouriers: onlineCouriers.size,
      totalOnlineRestaurants: onlineRestaurants.size,
      onlineCouriers: Array.from(onlineCouriers.entries()).map(([id, data]) => ({
        id,
        name: data.courierInfo?.name || 'Bilinmiyor',
        email: data.courierInfo?.email || '',
        joinTime: data.joinTime,
        lastActivity: data.lastActivity
      })),
      onlineRestaurants: Array.from(onlineRestaurants.keys())
    });
    
    console.log(`👑 Bir admin ${socket.id} odaya katıldı: admins`);
  });

  // Admin için live courier verilerini alma
  socket.on("requestLiveCouriers", async () => {
    try {
      // Çevrimiçi kuryelerden son konumları al
      const onlineCourierIds = Array.from(onlineCouriers.keys());
      
      if (onlineCourierIds.length === 0) {
        socket.emit("liveCouriersData", {
          success: true,
          data: [],
          count: 0,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      const liveCouriers = await sql`
        SELECT 
          id, name, phone, email, latitude, longitude, 
          is_online, updated_at as last_seen
        FROM couriers 
        WHERE id = ANY(${onlineCourierIds}) 
        AND is_online = true
        AND (is_blocked = false OR is_blocked IS NULL)
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
      `;

      socket.emit("liveCouriersData", {
        success: true,
        data: liveCouriers,
        count: liveCouriers.length,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Live kurye verisi gönderildi - Admin: ${socket.id}, Kurye sayısı: ${liveCouriers.length}`);
    } catch (error) {
      console.error("requestLiveCouriers error:", error);
      socket.emit("liveCouriersData", {
        success: false,
        error: "Veriler alınamadı",
        data: [],
        count: 0
      });
    }
  });

  // Kurye çevrimiçi durumu değiştirme
  socket.on("courierOnline", async (data) => {
    const { courierId } = data;
    if (!courierId) return;

    try {
      // Kurye bilgilerini al
      const [courier] = await sql`
        SELECT id, name, email, is_blocked FROM couriers WHERE id = ${courierId}
      `;

      if (!courier || courier.is_blocked) {
        console.warn(`courierOnline: Kurye bulunamadı veya engellenmiş - ID: ${courierId}`);
        return;
      }

      // Online kurye listesine ekle (eğer yoksa)
      if (!onlineCouriers.has(courierId)) {
        onlineCouriers.set(courierId, {
          socketId: socket.id,
          joinTime: new Date(),
          lastActivity: new Date(),
          courierInfo: courier
        });
      } else {
        // Mevcut kurye verilerini güncelle
        const existingData = onlineCouriers.get(courierId);
        existingData.lastActivity = new Date();
        onlineCouriers.set(courierId, existingData);
      }

      // Veritabanında online durumunu güncelle
      
      await sql`
        UPDATE couriers 
        SET is_online = true, updated_at = NOW()
        WHERE id = ${courierId}
      `;

      // Admin paneline bildir
      io.to("admins").emit("courierOnlineStatusChanged", {
        courierId,
        isOnline: true,
        totalOnline: onlineCouriers.size,
        courierInfo: courier
      });

      console.log(`🟢 Kurye ${courierId} çevrimiçi oldu`);
    } catch (error) {
      console.error("courierOnline error:", error);
    }
  });

  // Kurye çevrimdışı durumu
  socket.on("courierOffline", async (data) => {
    const { courierId } = data;
    if (!courierId) return;

    try {
      // Online kurye listesinden çıkar
      onlineCouriers.delete(courierId);

      // Veritabanında offline durumunu güncelle
      
      await sql`
        UPDATE couriers 
        SET is_online = false, updated_at = NOW()
        WHERE id = ${courierId}
      `;

      // Admin paneline bildir
      io.to("admins").emit("courierOnlineStatusChanged", {
        courierId,
        isOnline: false,
        totalOnline: onlineCouriers.size
      });

      console.log(`🔴 Kurye ${courierId} çevrimdışı oldu`);
    } catch (error) {
      console.error("courierOffline error:", error);
    }
  });

  // Kurye heartbeat - çevrimiçi durumunu sürdürme
  socket.on("courierHeartbeat", async (data) => {
    const { courierId } = data;
    if (!courierId) return;

    try {
      // Online kurye listesinde güncelle
      if (onlineCouriers.has(courierId)) {
        const courierData = onlineCouriers.get(courierId);
        courierData.lastActivity = new Date();
        onlineCouriers.set(courierId, courierData);

        // Veritabanında da güncelle (throttled)
        const now = Date.now();
        const lastUpdate = locationThrottleCache.get(`heartbeat_${courierId}`) || 0;
        
        if ((now - lastUpdate) >= 120000) { // 2 dakikada bir
          
          await sql`
            UPDATE couriers 
            SET is_online = true, updated_at = NOW()
            WHERE id = ${courierId}
          `;
          locationThrottleCache.set(`heartbeat_${courierId}`, now);
        }

        console.log(`💓 Kurye ${courierId} heartbeat alındı`);
      }
    } catch (error) {
      console.error("courierHeartbeat error:", error);
    }
  });

  // Kurye konum güncellemesi - Canlı takip ve veritabanı kaydı
  socket.on("locationUpdate", async (data) => {
    const { courierId, orderId, latitude, longitude, firmaid } = data;
    
    if (!courierId || !orderId || !latitude || !longitude || !firmaid) {
      console.warn("locationUpdate: Eksik bilgi - courierId, orderId, latitude, longitude ve firmaid gereklidir");
      return;
    }

    try {
      // Konum validasyonu
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn(`locationUpdate: Geçersiz koordinatlar - lat: ${lat}, lng: ${lng}`);
        return;
      }

      // Kurye bilgilerini al
      const [courier] = await sql`
        SELECT id, name, phone, is_blocked FROM couriers WHERE id = ${courierId}
      `;

      if (!courier) {
        console.warn(`locationUpdate: Kurye bulunamadı - ID: ${courierId}`);
        return;
      }

      if (courier.is_blocked) {
        console.warn(`locationUpdate: Engelli kurye konum güncellemesi - ID: ${courierId}`);
        return;
      }

      // Sipariş durumunu kontrol et
      const [order] = await sql`
        SELECT id, firmaid, status FROM orders 
        WHERE id = ${orderId} AND kuryeid = ${courierId} AND status = 'kuryede'
      `;

      if (!order) {
        console.warn(`locationUpdate: Aktif sipariş bulunamadı - OrderID: ${orderId}, CourierID: ${courierId}`);
        return;
      }

      // Firma kontrolü
      if (order.firmaid !== firmaid) {
        console.warn(`locationUpdate: Firma ID uyumsuzluğu - Beklenen: ${order.firmaid}, Gelen: ${firmaid}`);
        return;
      }

      // Throttling kontrolü - 1 dakikada bir veritabanına kaydet
      const now = Date.now();
      const lastUpdate = locationThrottleCache.get(courierId) || 0;
      const shouldUpdateDB = (now - lastUpdate) >= LOCATION_UPDATE_INTERVAL;

      // Online kurye cache'ini güncelle (last activity)
      if (onlineCouriers.has(courierId)) {
        const courierData = onlineCouriers.get(courierId);
        courierData.lastActivity = new Date();
        onlineCouriers.set(courierId, courierData);
      }

      if (shouldUpdateDB) {
        // Veritabanında konum güncelle
        
        
        await sql`
          UPDATE couriers 
          SET 
            latitude = ${lat}, 
            longitude = ${lng}, 
            is_online = true,
            updated_at = NOW()
          WHERE id = ${courierId}
        `;

        locationThrottleCache.set(courierId, now);
        console.log(`📍 Kurye ${courierId} konumu veritabanına kaydedildi: ${lat}, ${lng}`);
      }

      // Canlı konum güncellemesini ilgili restorana gönder
      const locationData = {
        courierId: courierId,
        orderId: orderId,
        latitude: lat,
        longitude: lng,
        firmaid: firmaid,
        courier_name: courier.name,
        courier_phone: courier.phone,
        timestamp: new Date().toISOString()
      };

      // Restorana canlı konum gönder
      io.to(`restaurant_${firmaid}`).emit("locationUpdate", locationData);
      io.to("restaurants").emit("locationUpdate", locationData);

      // Admin paneline de gönder
      io.to("admins").emit("courierLocationUpdate", locationData);

      console.log(`🗺️ Kurye ${courierId} canlı konumu gönderildi - Sipariş: ${orderId}, Restoran: ${firmaid}`);

    } catch (error) {
      console.error("locationUpdate error:", error);
    }
  });

  // Sipariş odalarına katılma (sipariş takibi için)
  socket.on("joinOrder", (data) => {
    const { orderId } = data;
    if (orderId) {
      socket.join(`order_${orderId}`);
      console.log(`📦 Socket ${socket.id} sipariş odasına katıldı: order_${orderId}`);
    }
  });

  // Aktif siparişleri al (restoran için)
  socket.on("requestActiveOrders", async (data) => {
    const { firmId } = data;
    
    if (!firmId) {
      console.warn("requestActiveOrders: firmId gereklidir");
      return;
    }

    try {
      // Firma için aktif siparişleri al
      const activeOrders = await sql`
        SELECT 
          o.id,
          o.kuryeid,
          o.firmaid,
          c.latitude,
          c.longitude,
          c.name as courier_name,
          c.phone as courier_phone
        FROM orders o
        LEFT JOIN couriers c ON o.kuryeid = c.id
        WHERE o.firmaid = ${firmId} AND o.status = 'kuryede'
        AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
      `;

      socket.emit("activeOrders", activeOrders);
      console.log(`📋 Aktif siparişler gönderildi - Firma: ${firmId}, Sipariş sayısı: ${activeOrders.length}`);

    } catch (error) {
      console.error("requestActiveOrders error:", error);
      socket.emit("activeOrders", []);
    }
  });

  // Takip sonlandırma
  socket.on("endTracking", (data) => {
    const { orderId } = data;
    if (orderId) {
      // İlgili herkese tracking sonlandığını bildir
      io.emit("trackingEnded", { orderId });
      console.log(`🛑 Sipariş ${orderId} takibi sonlandırıldı`);
    }
  });

  // Socket bağlantısı kesildiğinde temizlik - Raspberry Pi için optimize edilmiş
  socket.on("disconnect", async (reason) => {
    try {
      // Heartbeat temizliği
      clearInterval(heartbeatInterval);
      
      console.log(`🔌 Socket ${socket.id} bağlantısı kesildi. Sebep: ${reason}`);
      
      // Kurye bağlantısı kesildi
      if (socket.courierId) {
        const courierId = socket.courierId;
        
        
        // Raspberry Pi için grace period - 30 saniye içinde tekrar bağlanabilir
        if (reason === 'transport close' || reason === 'ping timeout') {
          console.log(`⏳ Kurye ${courierId} için grace period başlatıldı (30 saniye)`);
          
          // Grace period için timer
          setTimeout(async () => {
            // Hala aynı socket ID'ye sahipse offline yap
            const currentCourier = onlineCouriers.get(courierId);
            if (currentCourier && currentCourier.socketId === socket.id) {
              onlineCouriers.delete(courierId);
              
              // Veritabanında offline yap
              
              await sql`
                UPDATE couriers 
                SET is_online = false, updated_at = NOW()
                WHERE id = ${courierId}
              `;
              
              // Admin paneline bildir
              io.to("admins").emit("courierOnlineStatusChanged", {
                courierId,
                isOnline: false,
                totalOnline: onlineCouriers.size,
                reason: 'Grace period expired'
              });
              
              console.log(`🚚 Kurye ${courierId} grace period sonrası offline yapıldı`);
            }
          }, 30000); // 30 saniye grace period
        } else {
          // Diğer disconnect sebepleri için hemen offline yap
          onlineCouriers.delete(courierId);
          
          // Veritabanında offline yap
          
          await sql`
            UPDATE couriers 
            SET is_online = false, updated_at = NOW()
            WHERE id = ${courierId}
          `;
          
          // Admin paneline bildir
          io.to("admins").emit("courierOnlineStatusChanged", {
            courierId,
            isOnline: false,
            totalOnline: onlineCouriers.size,
            reason: reason
          });
          
          console.log(`🚚 Kurye ${courierId} hemen offline yapıldı. Sebep: ${reason}`);
        }
      }
      
      // Restaurant bağlantısı kesildi
      if (socket.restaurantId) {
        const restaurantId = socket.restaurantId;
        onlineRestaurants.delete(restaurantId);
        
        // Admin paneline bildir
        io.to("admins").emit("restaurantOnlineStatusChanged", {
          restaurantId,
          isOnline: false,
          totalOnline: onlineRestaurants.size,
          reason: reason
        });
        
        console.log(`🍽️ Restaurant ${restaurantId} bağlantısı kesildi. Sebep: ${reason}`);
      }
      
      // Admin bağlantısı kesildi - sadece log
      if (socket.rooms.has('admins')) {
        console.log(`👑 Admin ${socket.id} bağlantısı kesildi. Sebep: ${reason}`);
      }
      
    } catch (error) {
      console.error("Disconnect handler error:", error);
    }
  });

  // Konum güncelleme işlemi - throttled ve az loglama
  socket.on('updateLocation', async ({ courierId, latitude, longitude }) => {
    if (!courierId || !latitude || !longitude) return;

    const now = Date.now();
    const lastUpdate = locationThrottleCache.get(courierId);
    
    // Throttle location updates
    if (lastUpdate && (now - lastUpdate) < LOCATION_UPDATE_INTERVAL) {
      return;
    }

    try {
      await sql`
        UPDATE couriers 
        SET latitude = ${latitude}, longitude = ${longitude}, updated_at = NOW() 
        WHERE id = ${courierId}
      `;
      
      locationThrottleCache.set(courierId, now);
      
      // Emit location update to relevant rooms
      socket.to('admins').emit('locationUpdate', {
        courierId,
        latitude,
        longitude,
        timestamp: now
      });
      
    } catch (error) {
      // Silent error - no logging
    }
  });
};

module.exports = {
  registerRoomHandlers,
  getOnlineStats: () => ({
    onlineCouriers,
    onlineRestaurants,
    totalOnlineCouriers: onlineCouriers.size,
    totalOnlineRestaurants: onlineRestaurants.size
  })
}; 