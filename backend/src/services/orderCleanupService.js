const { sql } = require('../config/db-config');



// In-memory tracking to avoid duplicate reminders
const orderReminderTracking = new Set();

// Cache for order reminder settings
let orderReminderSettings = null;

// Auto-delete 'bekleniyor' orders older than 1 hour
const checkOldPendingOrders = async () => {
  try {
    // System time - 1 hour
    const cutoffTime = new Date(Date.now() - (60 * 60 * 1000));
    const oldOrders = await sql`
      SELECT id FROM orders 
      WHERE status = 'bekleniyor' 
      AND created_at < ${cutoffTime}
    `;

    for (const order of oldOrders) {
      try {
        await sql`DELETE FROM orders WHERE id = ${order.id}`;
      } catch (deleteError) {
        console.error(`❌ Sipariş #${order.id} silinirken hata:`, deleteError);
      }
    }
  } catch (error) {
    console.error("❌ Otomatik 'bekleniyor' sipariş kontrolü hatası:", error);
  }
};

// Auto-delete 'kuryede' orders older than 4 hours
const checkOldKuryedeOrders = async () => {
  try {
    // System time - 4 hours
    const cutoffTime = new Date(Date.now() - (4 * 60 * 60 * 1000));
    const oldOrders = await sql`
      SELECT id FROM orders 
      WHERE status = 'kuryede' 
      AND accepted_at < ${cutoffTime}
    `;

    for (const order of oldOrders) {
      try {
        await sql`DELETE FROM orders WHERE id = ${order.id}`;
        // Remove from reminder tracking
        orderReminderTracking.delete(order.id.toString());
      } catch (deleteError) {
        console.error(`❌ Sipariş #${order.id} silinirken hata:`, deleteError);
      }
    }
  } catch (error) {
    console.error("❌ Otomatik 'kuryede' sipariş kontrolü hatası:", error);
  }
};

const getOrderReminderSettings = async () => {
  try {
    if (orderReminderSettings) {
      return orderReminderSettings;
    }

    const settingsResult = await sql`
      SELECT * FROM admin_settings WHERE setting_key = 'order_reminder_minutes' LIMIT 1
    `;

    if (settingsResult.length > 0) {
      orderReminderSettings = {
        reminderMinutes: parseInt(settingsResult[0].setting_value) || 10,
        lastUpdated: Date.now()
      };
    } else {
      orderReminderSettings = {
        reminderMinutes: 10,
        lastUpdated: Date.now()
      };
    }

    return orderReminderSettings;
  } catch  {
    return { reminderMinutes: 10, lastUpdated: Date.now() };
  }
};

// Check orders that need reminders
const checkOrdersForReminder = async (io) => {
  try {
    const settings = await getOrderReminderSettings();

    // System time - reminder minutes
    const cutoffTime = new Date(Date.now() - (settings.reminderMinutes * 60 * 1000));
    
    // Get orders older than reminder minutes and not yet reminded
    const ordersNeedingReminder = await sql`
      SELECT o.*, r.name as restaurant_name
      FROM orders o
      LEFT JOIN restaurants r ON o.firmaid = r.id
      WHERE o.status = 'kuryede' 
      AND o.accepted_at < ${cutoffTime}
    `;

    for (const order of ordersNeedingReminder) {
      const orderIdString = order.id.toString();
      
      // Skip if already reminded
      if (orderReminderTracking.has(orderIdString)) {
        continue;
      }

      // Mark as reminded to prevent duplicates
      orderReminderTracking.add(orderIdString);

      // Bildirim sistemi kaldırıldı
    }
  } catch (error) {
    console.error('❌ Sipariş hatırlatma kontrolü sırasında hata:', error);
  }
};

// Clean up old reminder tracking entries
const cleanupOrderReminderTracking = () => {
  // Clear tracking every hour to prevent memory leaks
  if (orderReminderTracking.size > 1000) {
    orderReminderTracking.clear();
  }
};

function startOrderCleanupService(io) {
  // Initial checks
  checkOldPendingOrders();
  checkOldKuryedeOrders();
  checkOrdersForReminder(io);
  
  // Schedule regular checks
  setInterval(() => {
    checkOldPendingOrders();
    checkOldKuryedeOrders();
  }, 300000); // Every 5 minutes
  
  setInterval(() => {
    checkOrdersForReminder(io);
  }, 30000); // Every 30 seconds
  
  setInterval(() => {
    cleanupOrderReminderTracking();
  }, 3600000); // Every hour
}

// Helper function to remove order from reminder tracking
function removeOrderFromReminderTracking(orderId) {
  const orderIdString = orderId.toString();
  if (orderReminderTracking.has(orderIdString)) {
    orderReminderTracking.delete(orderIdString);
  }
}

module.exports = {
  startOrderCleanupService,
  removeOrderFromReminderTracking,
  checkOrdersForReminder
}; 