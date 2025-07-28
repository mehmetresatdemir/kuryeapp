const { sql } = require('../config/db-config');
const { sendAdminTimeoutNotification } = require('./pushNotificationService');

// Track orders that have already been reported
const reportedOrders = new Set();

/**
 * Check for orders that have been waiting too long (5+ minutes)
 * and notify admin
 */
async function checkOrderTimeouts() {
  try {
    // Find orders waiting 5+ minutes
    const timeoutOrders = await sql`
      SELECT 
        o.id,
        o.firmaid,
        o.mahalle,
        o.firma_adi,
        o.created_at,
        EXTRACT(EPOCH FROM (NOW() - o.created_at))/60 as waiting_minutes,
        r.name as restaurant_name
      FROM orders o
      LEFT JOIN restaurants r ON o.firmaid = r.id
      WHERE o.status = 'bekleniyor' 
        AND o.created_at <= NOW() - INTERVAL '5 minutes'
      ORDER BY o.created_at ASC
    `;

    if (timeoutOrders.length === 0) {
      return { success: true, timeoutCount: 0, reported: 0 };
    }

    let reportedCount = 0;

    for (const order of timeoutOrders) {
      const orderId = order.id.toString();
      
      // Skip if already reported (prevent spam)
      if (reportedOrders.has(orderId)) {
        continue;
      }

      const waitingMinutes = Math.floor(order.waiting_minutes);
      const restaurantName = order.restaurant_name || order.firma_adi;

      console.log(`⏰ Order timeout detected: #${orderId} waiting ${waitingMinutes} minutes`);

      // Send admin notification
      try {
        await sendAdminTimeoutNotification({
          orderId: orderId,
          waitingTime: waitingMinutes,
          restaurantName: restaurantName,
          neighborhood: order.mahalle
        });

        // Mark as reported
        reportedOrders.add(orderId);
        reportedCount++;

        console.log(`🚨 Admin notified: Order #${orderId} timeout (${waitingMinutes} minutes)`);
      } catch (notificationError) {
        console.error(`❌ Failed to notify admin about order #${orderId}:`, notificationError);
      }
    }

    return { success: true, timeoutCount: timeoutOrders.length, reported: reportedCount };

  } catch (error) {
    console.error('❌ Error checking order timeouts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up reported orders that are no longer waiting
 */
async function cleanupReportedOrders() {
  try {
    // Get orders that are no longer in "bekleniyor" status
    const completedOrders = await sql`
      SELECT id::text as id_str
      FROM orders 
      WHERE status != 'bekleniyor'
    `;

    const completedOrderIds = new Set(completedOrders.map(o => o.id_str));
    let cleanedCount = 0;

    // Remove from reported set
    for (const reportedId of reportedOrders) {
      if (completedOrderIds.has(reportedId)) {
        reportedOrders.delete(reportedId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} completed orders from timeout tracking`);
    }

    return { success: true, cleaned: cleanedCount };

  } catch (error) {
    console.error('❌ Error cleaning up reported orders:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Start the order timeout monitoring service
 */
function startOrderTimeoutService() {
  console.log('🚨 Order timeout monitoring service started (5 minute threshold)');

  // Check every 2 minutes
  const checkInterval = setInterval(async () => {
    const result = await checkOrderTimeouts();
    if (result.reported > 0) {
      console.log(`⏰ Timeout check completed: ${result.reported}/${result.timeoutCount} new alerts sent`);
    }
  }, 2 * 60 * 1000); // 2 minutes

  // Cleanup every 10 minutes
  const cleanupInterval = setInterval(async () => {
    await cleanupReportedOrders();
  }, 10 * 60 * 1000); // 10 minutes

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('🛑 Shutting down order timeout service...');
    clearInterval(checkInterval);
    clearInterval(cleanupInterval);
  });

  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down order timeout service...');
    clearInterval(checkInterval);
    clearInterval(cleanupInterval);
  });
}

module.exports = {
  startOrderTimeoutService,
  checkOrderTimeouts,
  cleanupReportedOrders
}; 