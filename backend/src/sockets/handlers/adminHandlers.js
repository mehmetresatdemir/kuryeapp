const { sql } = require('../../config/db-config');

const registerAdminHandlers = (io, socket) => {
  // Admin connection tracking
  let adminConnectionId = null;
  
  // Admin connection established
  socket.on('admin:connect', (data) => {
    adminConnectionId = data?.adminId || socket.id;
    socket.adminId = adminConnectionId;
    
    // Send initial stats
    sendMainStats();
  });

  const sendMainStats = async () => {
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

      const stats = {
        apiOk: true,
        dbOk: true,
        activeOrders: activeOrdersResult[0].count,
        activeCouriers: activeCouriersResult[0].count,
        completedToday: completedTodayResult[0].count,
        connectionId: adminConnectionId,
        timestamp: new Date().toLocaleString('tr-TR')
      };
      
      socket.emit('admin:main-stats', stats);
      
    } catch (error) {
      socket.emit('admin:main-stats', {
        apiOk: true,
        dbOk: false,
        activeOrders: 'N/A',
        activeCouriers: 'N/A',
        completedToday: 'N/A',
        error: error.message,
        connectionId: adminConnectionId,
        timestamp: new Date().toLocaleString('tr-TR')
      });
    }
  };

  socket.on('admin:request-main-stats', sendMainStats);

  // Admin order update event
  socket.on('admin:update-order', async (data) => {
    try {
      // Bildirim sistemi kaldırıldı
    } catch (error) {
      socket.emit('admin:error', { 
        message: 'Sipariş güncelleme event işlenemedi',
        error: error.message 
      });
    }
  });

  // Admin order delete event
  socket.on('admin:delete-order', async (data) => {
    try {
      // Bildirim sistemi kaldırıldı
    } catch (error) {
      socket.emit('admin:error', { 
        message: 'Sipariş silme event işlenemedi',
        error: error.message 
      });
    }
  });

  // Send stats every 30 seconds
  const intervalId = setInterval(() => {
    if (socket.rooms.has('admins')) {
      sendMainStats();
    }
  }, 30000);

  socket.on('disconnect', () => {
    clearInterval(intervalId);
  });
};

module.exports = registerAdminHandlers; 