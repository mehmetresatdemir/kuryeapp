const { sql } = require('../config/db-config');
const { getMessaging } = require('../config/firebase-config');

// Notification sound configurations
const NOTIFICATION_SOUNDS = [
  {
    id: 'default',
    name: 'Default',
    filename: 'default',
    description: 'System default notification sound'
  },
  {
    id: 'system',
    name: 'System',
    filename: 'system',
    description: 'iOS system notification sound'
  },
  {
    id: 'ring_bell',
    name: 'Ring Bell',
    filename: 'ring_bell',
    description: 'Custom ring bell sound'
  },
  {
    id: 'ring_bell2',
    name: 'Ring Bell 2',
    filename: 'ring_bell2.wav',
    description: 'Custom ring bell sound 2'
  }
];

/**
 * Get sound configuration for notification
 * @param {string} soundId - Sound identifier
 * @param {string} platform - Platform ('ios' or 'android')
 * @returns {string|boolean} Sound configuration
 */
function getSoundConfig(soundId, platform = 'ios') {
  const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
  
  // iOS'ta HER ZAMAN ring_bell2 özel sesi kullan - sistem sesi asla
  if (platform === 'ios') {
    return 'ring_bell2'; // iOS için her zaman özel ses
  }
  
  // Android için normal logic
  switch (soundId) {
    case 'system':
      return true; // Use system default sound
    case 'default':
      return 'default';
    case 'ring_bell2':
      return 'ring_bell2.wav';
    default:
      if (!sound) {
        return 'ring_bell2.wav';
      }
      return sound.filename;
  }
}

/**
 * Create push notification payload
 * @param {string} expoPushToken - Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} soundId - Sound identifier
 * @param {object} customData - Custom data to include
 * @param {string} platform - Platform ('ios' or 'android')
 * @returns {object} Push notification payload
 */
function createPushNotificationPayload(expoPushToken, title, body, soundId = 'ring_bell2', customData = {}, platform = 'ios') {
  const soundConfig = getSoundConfig(soundId, platform);

  // Android tarafında özel sesi zorlamak için channelId kullan
  // iOS bu alanı yok sayar, güvenli.
  const androidChannelId = (soundId && soundId !== 'default' && soundId !== 'system')
    ? soundId
    : 'default';

  const payload = {
    to: expoPushToken,
    sound: soundConfig,
    title,
    body,
    data: {
      soundType: soundId,
      timestamp: Date.now(),
      platform: platform,
      ...customData,
    },
  };

  // iOS için özelleştirmeler - sistem sesini devre dışı bırak, sadece özel ses
  if (platform === 'ios') {
    payload.priority = 'high';
    payload.badge = 1;
    payload.subtitle = 'KuryeX';
    // iOS'ta kritik bildirim özelliklerini ekle - sadece özel ses çalacak
    payload.aps = {
      alert: {
        title: title,
        subtitle: 'KuryeX',
        body: body
      },
      sound: soundConfig,
      badge: 1,
      'mutable-content': 1,
      'content-available': 1,
      'thread-id': 'kuryex-notifications'
    };
    // Expo specific iOS configuration
    payload._displayInForeground = true;
    payload._category = 'kuryex';
  } else {
    // Android alanları
    payload.channelId = androidChannelId;
    payload.priority = 'high';
  }

  return payload;
}

/**
 * Send FCM notification to Android devices
 * @param {string} fcmToken - FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} soundId - Sound identifier
 * @param {object} customData - Custom data to include
 * @returns {Promise<object>} Response from FCM
 */
async function sendFCMNotification(fcmToken, title, body, soundId = 'ring_bell2', customData = {}) {
  try {
    const messaging = getMessaging();
    
    // Android için özel ses konfigürasyonu
    const soundConfig = getSoundConfig(soundId);
    const soundFile = soundConfig === true ? 'default' : soundConfig.replace('.wav', '');
    
    const message = {
      token: fcmToken,
      notification: {
        title: title,
        body: body
      },
      data: {
        soundType: soundId,
        timestamp: Date.now().toString(),
        ...Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
      },
      android: {
        notification: {
          sound: soundFile,
          channelId: 'kuryex-notifications',
          priority: 'high',
          defaultSound: soundFile === 'default',
          defaultVibrateTimings: false,
          vibrateTimingsMillis: [0, 500, 500, 500]
        },
        priority: 'high'
      }
    };

    console.log('🤖 Sending FCM notification:', {
      token: fcmToken?.substring(0, 20) + '...',
      title: title,
      sound: soundFile
    });

    const result = await messaging.send(message);
    console.log('✅ FCM notification sent successfully:', result);
    return { success: true, result };
  } catch (error) {
    console.error('❌ Error sending FCM notification:', error);
    throw error;
  }
}

/**
 * Send push notification using Expo Push API
 * @param {object} payload - Push notification payload
 * @returns {Promise<object>} Response from Expo Push API
 */
async function sendExpoPushNotification(payload) {
  try {
    console.log('🔔 Sending push notification:', {
      to: payload.to?.substring(0, 20) + '...',
      title: payload.title,
      soundType: payload.data?.soundType
    });

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    
    if (result.data && result.data[0]?.status === 'error') {
      console.error('❌ Push notification error:', result.data[0]);
      throw new Error(result.data[0].message || 'Push notification failed');
    }
    
    console.log('✅ Push notification sent successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    throw error;
  }
}

/**
 * Send platform-specific push notification
 * @param {string} token - Push token (Expo or FCM)
 * @param {string} platform - Platform type ('ios', 'android', 'web')
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} soundId - Sound identifier
 * @param {object} customData - Custom data to include
 * @returns {Promise<object>} Notification result
 */
async function sendPlatformSpecificNotification(token, platform, title, body, soundId = 'ring_bell2', customData = {}) {
  try {
    // Android için FCM kullan, diğerleri için Expo
    if (platform === 'android' && token.length > 100) { // FCM token'lar daha uzun olur
      return await sendFCMNotification(token, title, body, soundId, customData);
    } else {
      // iOS ve diğer platformlar için Expo Push kullan
      const payload = createPushNotificationPayload(token, title, body, soundId, customData);
      const result = await sendExpoPushNotification(payload);
      return { success: true, result };
    }
  } catch (error) {
    console.error(`❌ Error sending ${platform} notification:`, error);
    throw error;
  }
}

/**
 * Get all active courier push tokens with preferences
 * @param {string} neighborhood - Optional neighborhood filter
 * @returns {Promise<Array>} Array of courier tokens with preferences
 */
  async function getActiveCourierTokens(neighborhood = null, restaurantId = null) {
  try {
    let result;
    
    if (restaurantId) {
      // Get couriers who have selected this specific restaurant for notifications
      // Exclude any courier tokens that are also registered to any restaurant account (shared device)
      result = await sql`
        SELECT 
          c.id as courier_id,
          c.name as courier_name,
          c.notification_mode,
          pt.token as expo_push_token,
          pt.platform,
          crp.is_selected
        FROM couriers c
        INNER JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier'
        INNER JOIN courier_restaurant_preferences crp ON c.id = crp.courier_id 
        WHERE c.is_blocked = false 
          AND pt.token IS NOT NULL 
          AND pt.is_active = true
          AND crp.restaurant_id = ${restaurantId}
          AND crp.is_selected = true
          AND NOT EXISTS (
            SELECT 1 FROM push_tokens rt
            WHERE rt.user_type = 'restaurant' AND rt.is_active = true AND rt.token = pt.token
          )
        ORDER BY c.name
      `;
      console.log(`📱 Found ${result.length} active courier tokens for restaurant ${restaurantId} in neighborhood: ${neighborhood || 'all'}`);
      // Eğer bu restorana seçilmiş kurye yoksa, genel aktif kurye listesine fallback yap
      if (!result || result.length === 0) {
        console.log(`↩️ No couriers selected for restaurant ${restaurantId}. Falling back to ALL active couriers.`);
        result = await sql`
          SELECT 
            c.id as courier_id,
            c.name as courier_name,
            c.notification_mode,
            pt.token as expo_push_token,
            pt.platform
          FROM couriers c
          INNER JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier'
          WHERE c.is_blocked = false 
            AND pt.token IS NOT NULL 
            AND pt.is_active = true
            AND NOT EXISTS (
              SELECT 1 FROM push_tokens rt
              WHERE rt.user_type = 'restaurant' AND rt.is_active = true AND rt.token = pt.token
            )
          ORDER BY c.name
        `;
        console.log(`📦 Fallback result: ${result.length} active couriers (no restaurant-specific selection).`);
      }
    } else {
      // Fallback: get all active couriers (for general notifications)
      result = await sql`
        SELECT 
          c.id as courier_id,
          c.name as courier_name,
          c.notification_mode,
          pt.token as expo_push_token,
          pt.platform
        FROM couriers c
        INNER JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier'
        WHERE c.is_blocked = false 
          AND pt.token IS NOT NULL 
          AND pt.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM push_tokens rt
            WHERE rt.user_type = 'restaurant' AND rt.is_active = true AND rt.token = pt.token
          )
        ORDER BY c.name
      `;
      console.log(`📱 Found ${result.length} active courier tokens for neighborhood: ${neighborhood || 'all'}`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error getting courier tokens:', error);
    return [];
  }
}

/**
 * Send new order notification to all eligible couriers
 * @param {object} orderData - Order information
 * @returns {Promise<object>} Notification results
 */
async function sendNewOrderNotificationToCouriers(orderData) {
  try {
    console.log('🔔 Sending new order notifications to couriers...');
    
    // Get eligible courier tokens for this specific restaurant
    let courierTokens = await getActiveCourierTokens(orderData.mahalle, orderData.firmaid);
    
    // Exclude restaurant devices from receiving the new order notification
    // 1) Exclude the devices of the restaurant who created the order
    try {
      const restaurantDeviceTokens = await sql`
        SELECT token
        FROM push_tokens
        WHERE user_type = 'restaurant' AND user_id = ${orderData.firmaid} AND is_active = true
      `;
      if (restaurantDeviceTokens?.length) {
        const tokensToExclude = new Set(restaurantDeviceTokens.map(t => t.token));
        const beforeCount = courierTokens.length;
        courierTokens = courierTokens.filter(ct => !tokensToExclude.has(ct.expo_push_token));
        const filteredOut = beforeCount - courierTokens.length;
        if (filteredOut > 0) {
          console.log(`🛑 Skipping ${filteredOut} courier token(s) that belong to restaurant ${orderData.firmaid}`);
        }
      }
    } catch (excludeErr) {
      console.warn('⚠️ Failed to exclude restaurant device tokens from courier notifications:', excludeErr);
    }

    // NOT: Global restaurant token exclusion KALDIRILDI.
    // Çünkü aynı cihazda hem restoran hem kurye testlerinde kurye token'ı yanlışlıkla elenebiliyor.
    
    if (courierTokens.length === 0) {
      console.log('📵 No eligible couriers found for notification. Forcing fallback to ALL active couriers.');
      try {
        courierTokens = await sql`
          SELECT 
            c.id as courier_id,
            c.name as courier_name,
            c.notification_mode,
            pt.token as expo_push_token,
            pt.platform
          FROM couriers c
          INNER JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier'
          WHERE c.is_blocked = false 
            AND pt.token IS NOT NULL 
            AND pt.is_active = true
            AND NOT EXISTS (
              SELECT 1 FROM push_tokens rt
              WHERE rt.user_type = 'restaurant' AND rt.is_active = true AND rt.token = pt.token
            )
          ORDER BY c.name
        `;
        console.log(`📦 Forced fallback list size: ${courierTokens.length}`);
      } catch (fbErr) {
        console.warn('⚠️ Fallback query failed:', fbErr);
      }

      if (courierTokens.length === 0) {
        return { success: true, sent: 0, failed: 0, details: [] };
      }
    }
    
    // Platform bazlı bildirim gönderimi
    const notificationPromises = courierTokens.map(async (courier) => {
      const title = '🆕 Yeni Sipariş!';
      const body = `${orderData.mahalle} - ${orderData.courier_price || 0} ₺\n${orderData.firma_adi}`;
      
      return await sendPlatformSpecificNotification(
        courier.expo_push_token,
        courier.platform || 'ios', // Default to iOS if platform not specified
        title,
        body,
        'ring_bell2', // Use ring_bell2.wav for custom sound
        {
          orderId: orderData.id.toString(),
          type: 'new_order',
          neighborhood: orderData.mahalle,
          restaurantName: orderData.firma_adi,
          courierPrice: orderData.courier_price || 0,
          restaurantId: orderData.firmaid,
          paymentMethod: orderData.odeme_yontemi
        },
        courier.platform || 'ios' // Platform bilgisi
      );
    });
    
    // Execute notifications with promise handling
    const results = await Promise.allSettled(notificationPromises);
    let sentCount = 0;
    let failedCount = 0;
    const detailedResults = [];
    
    results.forEach((result, index) => {
      const courierInfo = courierTokens[index];
      if (result.status === 'fulfilled') {
        sentCount++;
        detailedResults.push({
          courierId: courierInfo.courier_id,
          courierName: courierInfo.courier_name,
          platform: courierInfo.platform || 'ios',
          status: 'success',
          result: result.value
        });
      } else {
        failedCount++;
        detailedResults.push({
          courierId: courierInfo.courier_id,
          courierName: courierInfo.courier_name,
          platform: courierInfo.platform || 'ios',
          status: 'failed',
          error: result.reason.message
        });
      }
    });
    
    console.log(`✅ New order notifications sent: ${sentCount} success, ${failedCount} failed`);
    
    return {
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: courierTokens.length,
      details: detailedResults
    };
    
  } catch (error) {
    console.error('❌ Error sending new order notifications:', error);
    return {
      success: false,
      error: error.message,
      sent: 0,
      failed: 0,
      details: []
    };
  }
}

/**
 * Send order accepted notification to restaurant
 * @param {object} notificationData - Notification data {restaurantId, orderId, courierName, orderDetails}
 * @returns {Promise<object>} Notification result
 */
async function sendOrderAcceptedNotification(notificationData) {
  try {
    console.log('🔔 Checking if restaurant is online before sending push notification...');
    
    const { restaurantId, orderId, courierName, orderDetails } = notificationData;
    
    // Check if restaurant is online (socket connected)
    const { isRestaurantOnline } = require('../sockets/handlers/roomHandlers');
    const isOnline = isRestaurantOnline(restaurantId);
    console.log(`🔍 Restaurant ${restaurantId} online status check: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (isOnline) {
      console.log(`📱 Restaurant ${restaurantId} is ONLINE - skipping push notification (socket event will be sent instead)`);
      return { success: true, skipped: true, reason: 'Restaurant is online, socket event preferred' };
    }
    
    console.log(`📴 Restaurant ${restaurantId} is OFFLINE - sending push notification...`);
    
    // Get restaurant push token
    const [restaurantToken] = await sql`
      SELECT pt.token as expo_push_token, pt.platform, r.name as restaurant_name
      FROM restaurants r
      INNER JOIN push_tokens pt ON r.id = pt.user_id AND pt.user_type = 'restaurant'
      WHERE r.id = ${restaurantId} AND pt.is_active = true
      ORDER BY pt.updated_at DESC
      LIMIT 1
    `;
    
    if (!restaurantToken) {
      console.log(`📵 No push token found for restaurant ${restaurantId}`);
      return { success: false, error: 'No push token found' };
    }
    
    const title = '✅ Sipariş Kabul Edildi!';
    const body = `${courierName} sipariş #${orderId} kabul etti.`;
    
    const payload = createPushNotificationPayload(
      restaurantToken.expo_push_token,
      title,
      body,
      'ring_bell2', // Custom sound
      {
        orderId: orderId.toString(),
        type: 'order_accepted',
        courierName: courierName,
        restaurantId: restaurantId.toString(),
        preparationTime: orderDetails?.preparation_time !== undefined ? orderDetails.preparation_time : 20
      },
      restaurantToken.platform || 'ios' // Platform bilgisi
    );
    
    const result = await sendExpoPushNotification(payload);
    
    console.log(`✅ Order accepted notification sent to offline restaurant ${restaurantId}`);
    return { success: true, result };
    
  } catch (error) {
    console.error('❌ Error sending order accepted notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send order cancelled notification to courier
 * @param {object} notificationData - Notification data {courierId, orderId, restaurantName, courierName}
 * @returns {Promise<object>} Notification result
 */
async function sendOrderCancelledNotification(notificationData) {
  try {
    console.log('🔔 Sending order cancelled notification to courier...');
    
    const { courierId, orderId, restaurantName, courierName } = notificationData;
    
    // Get courier push token
    const [courierToken] = await sql`
      SELECT pt.token as expo_push_token, pt.platform, c.name as courier_name
      FROM couriers c
      INNER JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier'
      WHERE c.id = ${courierId} AND pt.is_active = true
      ORDER BY pt.updated_at DESC
      LIMIT 1
    `;
    
    if (!courierToken) {
      console.log(`📵 No push token found for courier ${courierId}`);
      return { success: false, error: 'No push token found' };
    }
    
    const title = '❌ Sipariş İptal Edildi';
    const body = `${restaurantName} sipariş #${orderId} iptal etti. Taşıma işlemi durduruldu.`;
    
    const payload = createPushNotificationPayload(
      courierToken.expo_push_token,
      title,
      body,
      'ring_bell2', // Custom sound
      {
        orderId: orderId.toString(),
        type: 'order_cancelled',
        restaurantName: restaurantName,
        courierId: courierId.toString()
      },
      courierToken.platform || 'ios' // Platform bilgisi
    );
    
    const result = await sendExpoPushNotification(payload);
    
    console.log(`✅ Order cancelled notification sent to courier ${courierId}`);
    return { success: true, result };
    
  } catch (error) {
    console.error('❌ Error sending order cancelled notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send order delivered successfully notification to restaurant (for online/gift card payments)
 * @param {object} notificationData - Notification data {restaurantId, orderId, courierName}
 * @returns {Promise<object>} Notification result
 */
async function sendOrderDeliveredNotification(notificationData) {
  try {
    console.log('🔔 Checking if restaurant is online before sending delivery push notification...');
    
    const { restaurantId, orderId, courierName } = notificationData;
    
    // Check if restaurant is online (socket connected)
    const { isRestaurantOnline } = require('../sockets/handlers/roomHandlers');
    const isOnline = isRestaurantOnline(restaurantId);
    console.log(`🔍 Restaurant ${restaurantId} online status check for delivery: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (isOnline) {
      console.log(`📱 Restaurant ${restaurantId} is ONLINE - skipping delivery push notification (socket event will be sent instead)`);
      return { success: true, skipped: true, reason: 'Restaurant is online, socket event preferred' };
    }
    
    console.log(`📴 Restaurant ${restaurantId} is OFFLINE - sending delivery push notification...`);
    
    // Get restaurant push token
    const [restaurantToken] = await sql`
      SELECT pt.token as expo_push_token, pt.platform, r.name as restaurant_name
      FROM restaurants r
      INNER JOIN push_tokens pt ON r.id = pt.user_id AND pt.user_type = 'restaurant'
      WHERE r.id = ${restaurantId} AND pt.is_active = true
      ORDER BY pt.updated_at DESC
      LIMIT 1
    `;
    
    if (!restaurantToken) {
      console.log(`📵 No push token found for restaurant ${restaurantId}`);
      return { success: false, error: 'No push token found' };
    }
    
    const title = '✅ Sipariş Teslim Edildi!';
    const body = `${courierName} sipariş #${orderId} başarıyla teslim etti. Online/hediye çeki ödemesi tamamlandı.`;
    
    const payload = createPushNotificationPayload(
      restaurantToken.expo_push_token,
      title,
      body,
      'ring_bell2',
      {
        orderId: orderId.toString(),
        type: 'order_delivered_success',
        courierName: courierName,
        restaurantId: restaurantId.toString()
      },
      restaurantToken.platform || 'ios' // Platform bilgisi
    );
    
    const result = await sendExpoPushNotification(payload);
    
    console.log(`✅ Order delivered notification sent to offline restaurant ${restaurantId}`);
    return { success: true, result };
    
  } catch (error) {
    console.error('❌ Error sending order delivered notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send order approved notification to courier
 * @param {object} notificationData - Notification data {courierId, orderId, restaurantName, paymentMethod}
 * @returns {Promise<object>} Notification result
 */
async function sendOrderApprovedNotification(notificationData) {
  try {
    console.log('🔔 Sending order approved notification to courier...');
    
    const { courierId, orderId, restaurantName, paymentMethod } = notificationData;
    
    // Get courier push token
    const [courierToken] = await sql`
      SELECT pt.token as expo_push_token, pt.platform, c.name as courier_name
      FROM couriers c
      INNER JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier'
      WHERE c.id = ${courierId} AND pt.is_active = true
      ORDER BY pt.updated_at DESC
      LIMIT 1
    `;
    
    if (!courierToken) {
      console.log(`📵 No push token found for courier ${courierId}`);
      return { success: false, error: 'No push token found' };
    }
    
    const title = '✅ Sipariş Onaylandı!';
    const body = `${restaurantName} sipariş #${orderId} onayladı. ${paymentMethod} ödemesi tamamlandı.`;
    
    const payload = createPushNotificationPayload(
      courierToken.expo_push_token,
      title,
      body,
      'ring_bell2', // Custom sound
      {
        orderId: orderId.toString(),
        type: 'order_approved',
        restaurantName: restaurantName,
        courierId: courierId.toString(),
        paymentMethod: paymentMethod
      },
      courierToken.platform || 'ios' // Platform bilgisi
    );
    
    const result = await sendExpoPushNotification(payload);
    
    console.log(`✅ Order approved notification sent to courier ${courierId}`);
    return { success: true, result };
    
  } catch (error) {
    console.error('❌ Error sending order approved notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send admin notification for orders waiting too long
 * @param {object} notificationData - Notification data {orderId, waitingTime, restaurantName, neighborhood}
 * @returns {Promise<object>} Notification result
 */
async function sendAdminTimeoutNotification(notificationData) {
  try {
    console.log('🔔 Sending admin timeout notification...');
    
    const { orderId, waitingTime, restaurantName, neighborhood } = notificationData;
    
    // Get admin push tokens (if any exist)
    const adminTokens = await sql`
      SELECT pt.token as expo_push_token, pt.platform, pt.user_id
      FROM push_tokens pt
      WHERE pt.user_type = 'admin' AND pt.is_active = true
      ORDER BY pt.updated_at DESC
    `;
    
    if (adminTokens.length === 0) {
      console.log('📵 No admin push tokens found - logging to console instead');
      console.log(`🚨 ADMIN ALERT: Sipariş #${orderId} ${waitingTime} dakikadır alınmadı! Restaurant: ${restaurantName}, Mahalle: ${neighborhood}`);
      return { success: true, method: 'console_log', adminCount: 0 };
    }
    
    const title = '⏰ Sipariş Timeout!';
    const body = `Sipariş #${orderId} ${waitingTime} dakikadır alınmadı.\n${restaurantName} - ${neighborhood}`;
    
    const notifications = adminTokens.map(admin => 
      createPushNotificationPayload(
        admin.expo_push_token,
        title,
        body,
        'ring_bell2',
        {
          orderId: orderId.toString(),
          type: 'admin_timeout',
          waitingTime: waitingTime,
          restaurantName: restaurantName,
          neighborhood: neighborhood
        },
        admin.platform || 'ios' // Platform bilgisi
      )
    );
    
    // Send notifications
    let sentCount = 0;
    let failedCount = 0;
    
    const results = await Promise.allSettled(
      notifications.map(notification => sendExpoPushNotification(notification))
    );
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sentCount++;
      } else {
        failedCount++;
        console.error(`❌ Admin notification failed for admin ${adminTokens[index].user_id}:`, result.reason);
      }
    });
    
    console.log(`✅ Admin timeout notifications sent: ${sentCount} success, ${failedCount} failed`);
    return { success: true, sent: sentCount, failed: failedCount, adminCount: adminTokens.length };
    
  } catch (error) {
    console.error('❌ Error sending admin timeout notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send delivery approval notification to restaurant
 * @param {object} notificationData - Notification data
 * @returns {Promise<object>} Notification result
 */
async function sendDeliveryApprovalNotification(notificationData) {
  try {
    console.log('🔔 Checking if restaurant is online before sending delivery approval push notification...');
    
    const { restaurantId, orderId, courierName } = notificationData;
    
    // Check if restaurant is online (socket connected)
    const { isRestaurantOnline } = require('../sockets/handlers/roomHandlers');
    const isOnline = isRestaurantOnline(restaurantId);
    console.log(`🔍 Restaurant ${restaurantId} online status check for approval: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (isOnline) {
      console.log(`📱 Restaurant ${restaurantId} is ONLINE - skipping approval push notification (socket event will be sent instead)`);
      return { success: true, skipped: true, reason: 'Restaurant is online, socket event preferred' };
    }
    
    console.log(`📴 Restaurant ${restaurantId} is OFFLINE - sending delivery approval push notification...`);
    
    // Get restaurant push token
         const [restaurantToken] = await sql`
       SELECT pt.token as expo_push_token, pt.platform, r.name as restaurant_name
       FROM restaurants r
       INNER JOIN push_tokens pt ON r.id = pt.user_id AND pt.user_type = 'restaurant'
       WHERE r.id = ${restaurantId} AND pt.is_active = true
       ORDER BY pt.updated_at DESC
       LIMIT 1
     `;
    
    if (!restaurantToken) {
      console.log(`📵 No push token found for restaurant ${restaurantId}`);
      return { success: false, error: 'No push token found' };
    }
    
    const title = '⏳ Sipariş Onay Bekliyor';
    const body = `${courierName} sipariş #${orderId} teslim etti. Nakit/kredi kartı ödemesi - onayınız bekleniyor.`;
    
    const payload = createPushNotificationPayload(
      restaurantToken.expo_push_token,
      title,
      body,
      'ring_bell2',
      {
        orderId: orderId.toString(),
        type: 'delivery_needs_approval',
        courierName: courierName,
        restaurantId: restaurantId.toString()
      },
      restaurantToken.platform || 'ios' // Platform bilgisi
    );
    
    const result = await sendExpoPushNotification(payload);
    
    console.log(`✅ Delivery approval notification sent to offline restaurant ${restaurantId}`);
    return { success: true, result };
    
  } catch (error) {
    console.error('❌ Error sending delivery approval notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send order cancelled by courier notification to restaurant
 * @param {object} notificationData - Notification data {restaurantId, orderId, courierName, reason}
 * @returns {Promise<object>} Notification result
 */
async function sendOrderCancelledByCarrierNotification(notificationData) {
  try {
    console.log('🔔 ===== ORDER CANCELLATION NOTIFICATION DEBUG =====');
    console.log('📋 Notification Data:', JSON.stringify(notificationData, null, 2));
    
    const { restaurantId, orderId, courierName, reason } = notificationData;
    
    // Check if restaurant is online (socket connected)
    const { isRestaurantOnline, getOnlineStats } = require('../sockets/handlers/roomHandlers');
    const onlineStats = getOnlineStats();
    console.log('📊 Current online restaurants:', Array.from(onlineStats.onlineRestaurants.keys()));
    
    const isOnline = isRestaurantOnline(restaurantId);
    console.log(`🔍 Restaurant ${restaurantId} online status check for cancellation: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (isOnline) {
      console.log(`📱 Restaurant ${restaurantId} is ONLINE - skipping cancellation push notification (socket event will be sent instead)`);
      return { success: true, skipped: true, reason: 'Restaurant is online, socket event preferred' };
    }
    
    console.log(`📴 Restaurant ${restaurantId} is OFFLINE - proceeding with push notification...`);
    
    // Get restaurant push token
    console.log(`🔍 Searching for push token for restaurant ${restaurantId}...`);
    const [restaurantToken] = await sql`
      SELECT pt.token as expo_push_token, pt.platform, r.name as restaurant_name
      FROM restaurants r
      INNER JOIN push_tokens pt ON r.id = pt.user_id AND pt.user_type = 'restaurant'
      WHERE r.id = ${restaurantId} AND pt.is_active = true
      ORDER BY pt.updated_at DESC
      LIMIT 1
    `;
    
    if (!restaurantToken) {
      console.log(`📵 ❌ NO PUSH TOKEN found for restaurant ${restaurantId}`);
      // List all tokens for debugging
      const allTokens = await sql`
        SELECT pt.user_id, pt.user_type, pt.platform, pt.is_active, r.name as restaurant_name
        FROM push_tokens pt
        LEFT JOIN restaurants r ON pt.user_id = r.id AND pt.user_type = 'restaurant'
        WHERE pt.user_type = 'restaurant'
        ORDER BY pt.updated_at DESC
      `;
      console.log('📋 All restaurant push tokens in DB:', allTokens);
      return { success: false, error: 'No push token found' };
    }
    
    console.log(`✅ Push token found for restaurant ${restaurantId}:`, {
      restaurant_name: restaurantToken.restaurant_name,
      platform: restaurantToken.platform,
      token_preview: restaurantToken.expo_push_token.substring(0, 20) + '...'
    });
    
    const title = '❌ Sipariş İptal Edildi!';
    const body = `${courierName} sipariş #${orderId} iptal etti. Sebep: ${reason}`;
    
    console.log(`📤 Creating push notification payload...`);
    const payload = createPushNotificationPayload(
      restaurantToken.expo_push_token,
      title,
      body,
      'ring_bell2',
      {
        orderId: orderId.toString(),
        type: 'order_cancelled_by_courier',
        courierName: courierName,
        restaurantId: restaurantId.toString(),
        reason: reason
      },
      restaurantToken.platform || 'ios' // Platform bilgisi
    );
    
    console.log(`🚀 Sending push notification to restaurant ${restaurantId}...`);
    const result = await sendExpoPushNotification(payload);
    
    console.log(`✅ Order cancelled notification sent to offline restaurant ${restaurantId}`, result);
    console.log('🔔 ===== END ORDER CANCELLATION NOTIFICATION DEBUG =====');
    return { success: true, result };
    
  } catch (error) {
    console.error('❌ Error sending order cancelled notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getSoundConfig,
  createPushNotificationPayload,
  sendExpoPushNotification,
  sendFCMNotification,
  sendPlatformSpecificNotification,
  getActiveCourierTokens,
  sendNewOrderNotificationToCouriers,
  sendOrderAcceptedNotification,
  sendOrderCancelledNotification,
  sendOrderDeliveredNotification,
  sendOrderApprovedNotification,
  sendAdminTimeoutNotification,
  sendDeliveryApprovalNotification,
  sendOrderCancelledByCarrierNotification,
  NOTIFICATION_SOUNDS
}; 