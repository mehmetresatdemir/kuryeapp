const express = require('express');
const router = express.Router();
const { Expo } = require('expo-server-sdk');
const { sql } = require('../config/db-config');

// Expo push notification client'ı oluştur
const expo = new Expo();

// Push token kaydet
router.post('/register', async (req, res) => {
    try {
        const { token, userId, userType, platform } = req.body;
        
        if (!token || !userId || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Token, userId ve userType gereklidir'
            });
        }
        
        // Expo push token formatını doğrula
        if (!Expo.isExpoPushToken(token)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz Expo push token formatı'
            });
        }
        
        console.log(`📱 Push token kaydediliyor: ${userType}_${userId}`);
        
        // Mevcut token'ı güncelle veya yeni ekle
        await sql`
            INSERT INTO push_tokens (user_id, user_type, token, platform, created_at, updated_at, is_active)
            VALUES (${userId}, ${userType}, ${token}, ${platform || 'unknown'}, NOW(), NOW(), true)
            ON CONFLICT (user_id, user_type) 
            DO UPDATE SET 
                token = EXCLUDED.token,
                platform = EXCLUDED.platform,
                updated_at = NOW(),
                is_active = true
        `;
        
        res.json({
            success: true,
            message: 'Push token başarıyla kaydedildi'
        });
        
    } catch (error) {
        console.error('❌ Push token kaydetme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Push token kaydedilemedi'
        });
    }
});

// Push token kaldır
router.post('/unregister', async (req, res) => {
    try {
        const { userId, userType } = req.body;
        
        if (!userId || !userType) {
            return res.status(400).json({
                success: false,
                message: 'UserId ve userType gereklidir'
            });
        }
        
        console.log(`📱 Push token kaldırılıyor: ${userType}_${userId}`);
        
        // Token'ı pasif yap
        await sql`
            UPDATE push_tokens 
            SET is_active = false, updated_at = NOW()
            WHERE user_id = ${userId} AND user_type = ${userType}
        `;
        
        res.json({
            success: true,
            message: 'Push token başarıyla kaldırıldı'
        });
        
    } catch (error) {
        console.error('❌ Push token kaldırma hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Push token kaldırılamadı'
        });
    }
});

// Belirli kullanıcıya push notification gönder
router.post('/send', async (req, res) => {
    try {
        const { userId, userType, title, body, data, sound = 'default' } = req.body;
        
        if (!userId || !userType || !title || !body) {
            return res.status(400).json({
                success: false,
                message: 'UserId, userType, title ve body gereklidir'
            });
        }
        
        // Kullanıcının push token'ını al
        const [tokenRecord] = await sql`
            SELECT token FROM push_tokens 
            WHERE user_id = ${userId} AND user_type = ${userType} AND is_active = true
            ORDER BY updated_at DESC
            LIMIT 1
        `;
        
        if (!tokenRecord) {
            return res.status(404).json({
                success: false,
                message: 'Kullanıcının aktif push token\'ı bulunamadı'
            });
        }
        
        const pushToken = tokenRecord.token;
        
        // Push notification gönder
        const result = await sendExpoPushNotification({
            to: pushToken,
            title,
            body,
            data,
            sound
        });
        
        res.json({
            success: true,
            message: 'Push notification başarıyla gönderildi',
            data: result
        });
        
    } catch (error) {
        console.error('❌ Push notification gönderme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Push notification gönderilemedi'
        });
    }
});

// Birden fazla kullanıcıya push notification gönder
router.post('/send-bulk', async (req, res) => {
    try {
        const { userType, title, body, data, sound = 'default', userIds = null } = req.body;
        
        if (!userType || !title || !body) {
            return res.status(400).json({
                success: false,
                message: 'UserType, title ve body gereklidir'
            });
        }
        
        const tickets = await sendBulkExpoPushNotifications({
            title,
            body,
            data,
            sound
        }, userIds, userType);
        
        res.json({
            success: true,
            message: `Push notification ${tickets.length} kullanıcıya gönderildi`,
            data: {
                total: tickets.length,
                tickets
            }
        });
        
    } catch (error) {
        console.error('❌ Bulk push notification gönderme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Bulk push notification gönderilemedi'
        });
    }
});

// Tek push notification gönderme fonksiyonu (overloaded - token veya userId ile çalışır)
async function sendExpoPushNotification(message, userId = null, userType = null) {
    try {
        let pushToken = message.to;
        
        // Eğer token yoksa userId ile token'ı al
        if (!pushToken && userId && userType) {
            const [tokenRecord] = await sql`
                SELECT token FROM push_tokens 
                WHERE user_id = ${userId} AND user_type = ${userType} AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            
            if (!tokenRecord) {
                console.log(`⚠️ Push token bulunamadı: ${userType}_${userId}`);
                return { success: false, error: 'No active push token found' };
            }
            
            pushToken = tokenRecord.token;
        }
        
        // Token formatını kontrol et
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error('❌ Geçersiz push token:', pushToken);
            return { success: false, error: 'Invalid push token' };
        }
        
        // Notification mesajını oluştur
        const notification = {
            to: pushToken,
            title: message.title,
            body: message.body,
            data: message.data || {},
            sound: message.sound || 'default',
            badge: 1,
            priority: 'high',
            channelId: 'default',
        };
        
        console.log('📤 Expo push notification gönderiliyor:', {
            to: pushToken.substring(0, 20) + '...',
            title: message.title
        });
        
        // Push notification gönder
        const ticketChunk = await expo.sendPushNotificationsAsync([notification]);
        
        console.log('✅ Push notification gönderildi:', ticketChunk[0]);
        
        // Receipt'i kontrol et (opsiyonel)
        if (ticketChunk[0].status === 'ok') {
            return { success: true, ticket: ticketChunk[0] };
        } else {
            console.error('❌ Push notification hatası:', ticketChunk[0]);
            return { success: false, error: ticketChunk[0] };
        }
        
    } catch (error) {
        console.error('❌ Expo push notification gönderme hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Birden fazla kullanıcıya Expo push notification gönderir.
 * @param {Object} messageData - Bildirim içeriği (title, body, sound, data)
 * @param {string[]} userIds - Bildirim gönderilecek kullanıcı ID'leri
 * @param {string} userType - Kullanıcı tipi (courier, restaurant)
 */
async function sendBulkExpoPushNotifications(messageData, userIds, userType) {
    let tokens = [];
    try {
        // userIds'ye göre token'ları al
        if (userIds && userIds.length > 0) {
            const tokenRecords = await sql`
                SELECT token FROM push_tokens 
                WHERE user_type = ${userType} AND user_id = ANY(${userIds}) AND is_active = true
            `;
            tokens = tokenRecords.map(r => r.token);
        } else {
            console.log('⚠️ Toplu bildirim için kullanıcı ID listesi boş.');
            return;
        }

        // Geçerli token yoksa bitir
        if (tokens.length === 0) {
            console.log('⚠️ Toplu bildirim için aktif push token bulunamadı.');
            return;
        }

        // Geçersiz token'ları filtrele
        const validPushTokens = tokens.filter(token => {
            if (!Expo.isExpoPushToken(token)) {
                console.warn(`❌ Geçersiz token formatı, atlanıyor: ${token}`);
                return false;
            }
            return true;
        });

        if (validPushTokens.length === 0) {
            console.log('⚠️ Gönderilecek geçerli push token bulunamadı.');
            return;
        }

        // Mesajları oluştur
        const messages = validPushTokens.map(pushToken => ({
            to: pushToken,
            sound: {
                name: messageData.sound || 'default-notification.wav',
                critical: true,
                volume: 1.0,
            },
            title: messageData.title,
            body: messageData.body,
            data: messageData.data || {},
            badge: 1,
            priority: 'high',
            channelId: 'default',
        }));

        // Mesajları chunk'lara böl
        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
                ticketChunk.forEach(ticket => {
                    console.log(`✅ Push notification gönderildi:`, ticket);
                });
            } catch (error) {
                console.error('❌ Push notification chunk gönderme hatası:', error);
            }
        }
        
        return tickets;

    } catch (error) {
        console.error('❌ Bulk push notification gönderme hatası:', error);
        throw error;
    }
}


module.exports = {
    router,
    sendExpoPushNotification,
    sendBulkExpoPushNotifications
}; 