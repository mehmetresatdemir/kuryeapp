const express = require('express');
const router = express.Router();
const { sql } = require('../config/db-config');
const { 
  sendExpoPushNotification, 
  createPushNotificationPayload,
  NOTIFICATION_SOUNDS 
} = require('../services/pushNotificationService');

/**
 * Register or update push token for user
 * POST /api/push-notifications/register
 */
router.post('/register', async (req, res) => {
  try {
    const { userId, userType, expoPushToken, platform = 'ios' } = req.body;

    if (!userId || !userType || !expoPushToken) {
      return res.status(400).json({
        success: false,
        message: 'userId, userType ve expoPushToken gerekli'
      });
    }

    // Validate userType
    if (!['courier', 'restaurant', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz userType. courier, restaurant veya admin olmalı'
      });
    }

         // Check if token already exists for this user
     const [existingToken] = await sql`
       SELECT id FROM push_tokens 
       WHERE user_id = ${userId} AND user_type = ${userType}
     `;

     if (existingToken) {
       // Update existing token
       await sql`
         UPDATE push_tokens 
         SET token = ${expoPushToken}, 
             platform = ${platform},
             is_active = true,
             updated_at = NOW()
         WHERE user_id = ${userId} AND user_type = ${userType}
       `;
       
       console.log(`📱 Updated push token for ${userType} ${userId}`);
     } else {
       // Insert new token
       await sql`
         INSERT INTO push_tokens (user_id, user_type, token, platform, is_active, created_at, updated_at)
         VALUES (${userId}, ${userType}, ${expoPushToken}, ${platform}, true, NOW(), NOW())
       `;
       
       console.log(`📱 Registered new push token for ${userType} ${userId}`);
     }

    res.json({
      success: true,
      message: 'Push token başarıyla kaydedildi'
    });

  } catch (error) {
    console.error('❌ Error registering push token:', error);
    res.status(500).json({
      success: false,
      message: 'Push token kaydedilemedi'
    });
  }
});

/**
 * Unregister push token for user
 * POST /api/push-notifications/unregister
 */
router.post('/unregister', async (req, res) => {
  try {
    const { userId, userType } = req.body;

    if (!userId || !userType) {
      return res.status(400).json({
        success: false,
        message: 'userId ve userType gerekli'
      });
    }

    await sql`
      UPDATE push_tokens 
      SET is_active = false, updated_at = NOW()
      WHERE user_id = ${userId} AND user_type = ${userType}
    `;

    console.log(`📱 Deactivated push token for ${userType} ${userId}`);

    res.json({
      success: true,
      message: 'Push token devre dışı bırakıldı'
    });

  } catch (error) {
    console.error('❌ Error unregistering push token:', error);
    res.status(500).json({
      success: false,
      message: 'Push token devre dışı bırakılamadı'
    });
  }
});

/**
 * Test push notification
 * POST /api/push-notifications/test
 */
router.post('/test', async (req, res) => {
  try {
    const { 
      userId, 
      userType, 
      title = 'Test Bildirimi', 
      body = 'Bu bir test bildirimidir', 
      soundId = 'ring_bell2',
      customData = {}
    } = req.body;

    if (!userId || !userType) {
      return res.status(400).json({
        success: false,
        message: 'userId ve userType gerekli'
      });
    }

         // Get user's push token
     const [tokenRecord] = await sql`
       SELECT token as expo_push_token, platform 
       FROM push_tokens 
       WHERE user_id = ${userId} AND user_type = ${userType} AND is_active = true
       ORDER BY updated_at DESC
       LIMIT 1
     `;

    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Bu kullanıcı için aktif push token bulunamadı'
      });
    }

    // Create and send test notification
    const payload = createPushNotificationPayload(
      tokenRecord.expo_push_token,
      title,
      body,
      soundId,
      {
        type: 'test_notification',
        userId: userId.toString(),
        userType: userType,
        ...customData
      }
    );

    const result = await sendExpoPushNotification(payload);

    res.json({
      success: true,
      message: 'Test bildirimi gönderildi',
      data: {
        platform: tokenRecord.platform,
        soundId,
        result
      }
    });

  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Test bildirimi gönderilemedi',
      error: error.message
    });
  }
});

/**
 * Get available notification sounds
 * GET /api/push-notifications/sounds
 */
router.get('/sounds', (req, res) => {
  res.json({
    success: true,
    data: NOTIFICATION_SOUNDS
  });
});

/**
 * Get user's push token info
 * GET /api/push-notifications/token/:userType/:userId
 */
router.get('/token/:userType/:userId', async (req, res) => {
  try {
    const { userId, userType } = req.params;

         const [tokenRecord] = await sql`
       SELECT token as expo_push_token, platform, is_active, created_at, updated_at
       FROM push_tokens 
       WHERE user_id = ${userId} AND user_type = ${userType}
       ORDER BY updated_at DESC
       LIMIT 1
     `;

    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Push token bulunamadı'
      });
    }

    res.json({
      success: true,
      data: {
        platform: tokenRecord.platform,
        isActive: tokenRecord.is_active,
        hasToken: !!tokenRecord.expo_push_token,
        tokenPreview: tokenRecord.expo_push_token?.substring(0, 20) + '...',
        createdAt: tokenRecord.created_at,
        updatedAt: tokenRecord.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Error getting token info:', error);
    res.status(500).json({
      success: false,
      message: 'Token bilgisi alınamadı'
    });
  }
});

/**
 * Direct notification endpoint (like the ExpoNotificationApp example)
 * POST /send-notification
 */
router.post('/send-notification', async (req, res) => {
  try {
    const { 
      token, 
      title, 
      body, 
      sound = 'ring_bell2.wav',
      data = {} 
    } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'token, title ve body gerekli'
      });
    }

    const payload = createPushNotificationPayload(
      token,
      title,
      body,
      'ring_bell2',
      {
        type: 'direct_notification',
        source: 'custom-backend',
        ...data
      }
    );

    const result = await sendExpoPushNotification(payload);

    res.json({
      success: true,
      message: 'Bildirim gönderildi',
      result
    });

  } catch (error) {
    console.error('❌ Error sending direct notification:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirim gönderilemedi',
      error: error.message
    });
  }
});

module.exports = router; 