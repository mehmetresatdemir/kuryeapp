const { sql } = require('../../config/db-config');
const SessionService = require('../../services/sessionService');

// Memory cache for location throttling
const locationThrottleCache = new Map();
const LOCATION_UPDATE_INTERVAL = 60000; // 1 minute

// Online tracking
const onlineCouriers = new Map();
const onlineRestaurants = new Map();

const registerRoomHandlers = (io, socket) => {
  // Ping-pong system for connection quality
  let missedHeartbeats = 0;
  const MAX_MISSED_HEARTBEATS = 15;
  
  socket.on('ping', () => {
    socket.emit('pong');
    missedHeartbeats = 0;
  });
  
  const heartbeatInterval = setInterval(() => {
    socket.emit('server-ping', { timestamp: Date.now() });
    missedHeartbeats++;
  }, 45000);
  
  socket.on('disconnect', () => {
    clearInterval(heartbeatInterval);
  });

  // Courier room join
  socket.on("joinCourierRoom", async (data) => {
    const { courierId, deviceInfo } = data;
    if (!courierId) {
      return socket.emit("connectionError", { message: "Kurye ID gereklidir" });
    }

    try {
      const [courier] = await sql`
        SELECT id, name, email, is_blocked FROM couriers WHERE id = ${courierId}
      `;
      
      if (!courier) {
        socket.emit("connectionRejected", { message: "Kurye bulunamadı.", reason: "COURIER_NOT_FOUND" });
        return socket.disconnect();
      }
      
      if (courier.is_blocked) {
        socket.emit("connectionRejected", { message: "Hesabınız engellenmiştir.", reason: "ACCOUNT_BLOCKED" });
        return socket.disconnect();
      }
      
      // Close existing connection
      if (onlineCouriers.has(courierId)) {
        const existingConnection = onlineCouriers.get(courierId);
        const existingSocket = io.sockets.sockets.get(existingConnection.socketId);
        if (existingSocket) {
          existingSocket.disconnect();
        }
      }
      
      socket.join("couriers");
      socket.join(`courier_${courierId}`);
      socket.courierId = courierId;
      
      console.log(`✅ Kurye ${courierId} room'lara katıldı:`, Array.from(socket.rooms));
      
      // Update session socket ID
      try {
        const token = data.token;
        if (token) {
          await SessionService.updateSocketId(token, socket.id);
        }
      } catch (sessionError) {
        // Silent error
      }
      
      // Add to online list
      onlineCouriers.set(courierId, {
        socketId: socket.id,
        joinTime: new Date(),
        lastActivity: new Date(),
        courierInfo: courier
      });
      
      // Update database
      await sql`
        UPDATE couriers SET is_online = true, updated_at = NOW() WHERE id = ${courierId}
      `;
      
      // Notify admin
      io.to("admins").emit("courierOnlineStatusChanged", {
        courierId,
        isOnline: true,
        totalOnline: onlineCouriers.size
      });
      
      console.log(`✅ Kurye ${courierId} başarıyla bağlandı - Socket: ${socket.id}`);
      
      socket.emit("connectionSuccess", {
        message: "Bağlantı başarılı",
        courierId: courierId,
        socketId: socket.id,
        serverTime: new Date().toLocaleString('tr-TR'),
        rooms: [`courier_${courierId}`, "couriers"],
        onlineCouriers: onlineCouriers.size
      });
      
      // Emit to admin panel about new courier online
      io.to("admins").emit("courierConnectionUpdate", {
        courierId,
        courierName: courier.name,
        isOnline: true,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      socket.emit("connectionError", { 
        message: "Sunucu hatası: " + error.message,
        shouldRetry: true,
        retryAfter: 5000
      });
    }
  });

  // Restaurant room join
  socket.on("joinRestaurantRoom", async (data) => {
    const { restaurantId } = data;
    if (!restaurantId) return;

    socket.join("restaurants");
    socket.join(`restaurant_${restaurantId}`);
    socket.restaurantId = restaurantId;
    
    // Update session socket ID
    try {
      const token = data.token;
      if (token) {
        await SessionService.updateSocketId(token, socket.id);
      }
    } catch (sessionError) {
      // Silent error
    }
    
    // Add to online list
    onlineRestaurants.set(restaurantId, {
      socketId: socket.id,
      joinTime: new Date(),
      lastActivity: new Date()
    });
    
    // Notify admin
    io.to("admins").emit("restaurantOnlineStatusChanged", {
      restaurantId,
      isOnline: true,
      totalOnline: onlineRestaurants.size
    });
  });

  // Admin room join
  socket.on("joinAdminRoom", () => {
    socket.join("admins");
    
    // Send current online stats
    socket.emit("onlineStats", {
      totalOnlineCouriers: onlineCouriers.size,
      totalOnlineRestaurants: onlineRestaurants.size,
      onlineCouriers: Array.from(onlineCouriers.entries()).map(([id, data]) => ({
        id,
        name: data.courierInfo?.name || 'Bilinmiyor',
        joinTime: data.joinTime,
        lastActivity: data.lastActivity
      }))
    });
  });

  // Live location update for tracking
  socket.on("locationUpdate", async ({ courierId, orderId, firmaid, latitude, longitude }) => {
    if (!courierId || !orderId || !firmaid || !latitude || !longitude) return;

    try {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return;
      }

      const [courier] = await sql`
        SELECT id, name, phone, is_blocked FROM couriers WHERE id = ${courierId}
      `;

      if (!courier || courier.is_blocked) return;

      const [order] = await sql`
        SELECT id, firmaid, status FROM orders 
        WHERE id = ${orderId} AND kuryeid = ${courierId} AND status = 'kuryede'
      `;

      if (!order || order.firmaid !== firmaid) return;

      // Update last activity
      if (onlineCouriers.has(courierId)) {
        const courierData = onlineCouriers.get(courierId);
        courierData.lastActivity = new Date();
        onlineCouriers.set(courierId, courierData);
      }

      // Throttled database update
      const now = Date.now();
      const lastUpdate = locationThrottleCache.get(courierId) || 0;
      const shouldUpdateDB = (now - lastUpdate) >= LOCATION_UPDATE_INTERVAL;

      if (shouldUpdateDB) {
        await sql`
          UPDATE couriers SET latitude = ${lat}, longitude = ${lng}, is_online = true, updated_at = NOW()
          WHERE id = ${courierId}
        `;
        locationThrottleCache.set(courierId, now);
      }

      // Send live location update
      const locationData = {
        courierId,
        orderId,
        latitude: lat,
        longitude: lng,
        firmaid,
        courier_name: courier.name,
        courier_phone: courier.phone,
        timestamp: new Date().toLocaleString('tr-TR')
      };

      io.to(`restaurant_${firmaid}`).emit("locationUpdate", locationData);
      io.to("admins").emit("courierLocationUpdate", locationData);

    } catch (error) {
      // Silent error
    }
  });

  // Test connection handler
  socket.on("testConnection", (data) => {
    const { courierId, timestamp, clientTime } = data;
    const serverTime = Date.now();
    
    console.log(`🧪 Test connection - Kurye ${courierId}, Client time: ${clientTime}`);
    
    socket.emit("testConnectionResponse", {
      courierId,
      clientTimestamp: timestamp,
      serverTimestamp: serverTime,
      ping: serverTime - timestamp,
      socketId: socket.id,
      rooms: Array.from(socket.rooms),
      isInCourierRoom: socket.rooms.has(`courier_${courierId}`),
      isInCouriersRoom: socket.rooms.has("couriers"),
      serverTime: new Date().toISOString()
    });
    
    // Update activity if courier is tracked
    if (onlineCouriers.has(courierId)) {
      const courierData = onlineCouriers.get(courierId);
      courierData.lastActivity = new Date();
      onlineCouriers.set(courierId, courierData);
    }
  });

  // Handle disconnection
  socket.on("disconnect", async (reason) => {
    try {
      // Courier disconnected
      if (socket.courierId) {
        const courierId = socket.courierId;
        
        if (onlineCouriers.has(courierId)) {
          onlineCouriers.delete(courierId);
          
          await sql`
            UPDATE couriers SET is_online = false, updated_at = NOW() WHERE id = ${courierId}
          `;
          
          io.to("admins").emit("courierOnlineStatusChanged", {
            courierId,
            isOnline: false,
            totalOnline: onlineCouriers.size
          });
        }
      }
      
      // Restaurant disconnected
      if (socket.restaurantId) {
        const restaurantId = socket.restaurantId;
        onlineRestaurants.delete(restaurantId);
        
        io.to("admins").emit("restaurantOnlineStatusChanged", {
          restaurantId,
          isOnline: false,
          totalOnline: onlineRestaurants.size
        });
      }
      
    } catch (error) {
      // Silent error
    }
  });

  // Simple location update (no tracking)
  socket.on('updateLocation', async ({ courierId, latitude, longitude }) => {
    if (!courierId || !latitude || !longitude) return;

    const now = Date.now();
    const lastUpdate = locationThrottleCache.get(courierId);
    
    if (lastUpdate && (now - lastUpdate) < LOCATION_UPDATE_INTERVAL) {
      return;
    }

    try {
      await sql`
        UPDATE couriers SET latitude = ${latitude}, longitude = ${longitude}, updated_at = NOW() 
        WHERE id = ${courierId}
      `;
      
      locationThrottleCache.set(courierId, now);
      
      socket.to('admins').emit('locationUpdate', {
        courierId,
        latitude,
        longitude,
        timestamp: now
      });
      
    } catch (error) {
      // Silent error
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
  }),
  isRestaurantOnline: (restaurantId) => {
    return onlineRestaurants.has(restaurantId.toString());
  },
  isCourierOnline: (courierId) => {
    return onlineCouriers.has(courierId.toString());
  }
}; 