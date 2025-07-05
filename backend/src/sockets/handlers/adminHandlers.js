const { sql, safeQuery } = require('../../config/db-config');

const registerAdminHandlers = (io, socket) => {
  // Admin için connection tracking
  let adminConnectionId = null;
  let adminHeartbeatInterval = null;
  
  // Admin bağlantısı kurulduğunda
  socket.on('admin:connect', (data) => {
    adminConnectionId = data?.adminId || socket.id;
    socket.adminId = adminConnectionId;
    
    console.log(`👑 Admin ${adminConnectionId} bağlandı - Socket: ${socket.id}`);
    
    // Admin için heartbeat
    adminHeartbeatInterval = setInterval(() => {
      socket.emit('admin:server-ping', { 
        timestamp: Date.now(),
        adminId: adminConnectionId
      });
    }, 20000); // 20 saniyede bir ping
    
    // İlk istatistikleri gönder
    sendMainStats();
  });
  
  // Admin ping response
  socket.on('admin:pong', () => {
    // Admin active
  });

  const sendMainStats = async () => {
    try {
      const maxRetries = 2; // Reduced from 3
      let stats = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const activeOrdersResult = await sql`
            SELECT COUNT(*) as count FROM orders WHERE status IN ('bekleniyor', 'kuryede')
          `;
          const activeCouriersResult = await sql`
            SELECT COUNT(*) as count FROM couriers WHERE is_online = true
          `;
          const completedTodayResult = await sql`
            SELECT COUNT(*) as count FROM orders 
            WHERE status = 'teslim edildi' 
            AND DATE(created_at) = CURRENT_DATE
          `;

          stats = {
            apiOk: true,
            dbOk: true,
            activeOrders: activeOrdersResult[0].count,
            activeCouriers: activeCouriersResult[0].count,
            completedToday: completedTodayResult[0].count,
            connectionId: adminConnectionId,
            timestamp: new Date().toISOString()
          };
          
          break; // Success, exit retry loop
        } catch (retryError) {
          if (attempt === maxRetries) {
            throw retryError; // Final attempt failed
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay
        }
      }
      
      if (stats) {
        socket.emit('admin:main-stats', stats);
      }
      
    } catch (error) {
      console.error('❌ Ana admin istatistikleri alınırken hata:', error.message);
      
      socket.emit('admin:main-stats', {
        apiOk: true,
        dbOk: false,
        activeOrders: 'N/A',
        activeCouriers: 'N/A',
        completedToday: 'N/A',
        error: error.message,
        connectionId: adminConnectionId,
        timestamp: new Date().toISOString()
      });
    }
  };

  socket.on('admin:request-main-stats', sendMainStats);

  // Admin sipariş güncellemesi event'i
  socket.on('admin:update-order', async (data) => {
    try {
      console.log(`👑 Admin ${adminConnectionId} sipariş güncelleme talebi:`, data);
      
      // Bu event'i diğer admin panellerine de ilet
      socket.broadcast.to('admins').emit('admin:order-updated', {
        orderId: data.orderId,
        changes: data.changes,
        updatedBy: adminConnectionId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Admin sipariş güncelleme event hatası:', error);
      socket.emit('admin:error', { 
        message: 'Sipariş güncelleme event işlenemedi',
        error: error.message 
      });
    }
  });

  // Admin sipariş silme event'i
  socket.on('admin:delete-order', async (data) => {
    try {
      console.log(`👑 Admin ${adminConnectionId} sipariş silme talebi:`, data);
      
      // Bu event'i diğer admin panellerine de ilet
      socket.broadcast.to('admins').emit('admin:order-deleted', {
        orderId: data.orderId,
        deletedBy: adminConnectionId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Admin sipariş silme event hatası:', error);
      socket.emit('admin:error', { 
        message: 'Sipariş silme event işlenemedi',
        error: error.message 
      });
    }
  });

  // Reduced frequency - send stats every 30 seconds instead of 15
  const intervalId = setInterval(() => {
    if (socket.rooms.has('admins')) {
      sendMainStats();
    }
  }, 30000);

  socket.on('disconnect', (reason) => {
    console.log(`👑 Admin ${adminConnectionId || socket.id} bağlantısı kesildi. Sebep: ${reason}`);
    
    clearInterval(intervalId);
    if (adminHeartbeatInterval) {
      clearInterval(adminHeartbeatInterval);
    }
  });
};

module.exports = registerAdminHandlers; 