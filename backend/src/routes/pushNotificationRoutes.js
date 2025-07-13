const express = require('express');
const router = express.Router();
const { Expo } = require('expo-server-sdk');
const { sql } = require('../config/db-config');

// Expo push notification client'ı oluştur
const expo = new Expo();

// Push token kaydet
router.post('/register', async (req, res) => {
    try {
        console.log('📥 PUSH TOKEN ENDPOINT HIT!');
        console.log('📥 Request body:', req.body);
        console.log('📥 Request headers:', req.headers);
        
        const { token, userId, userType, platform } = req.body;
        
        console.log('🔧 Push token kaydetme isteği:', { userId, userType, token: token?.substring(0, 20) + '...', platform });
        
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
        
        // Önce aynı token'ın zaten var olup olmadığını kontrol et
        const [existingToken] = await sql`
            SELECT id, user_id, user_type, is_active 
            FROM push_tokens 
            WHERE token = ${token}
            ORDER BY updated_at DESC
            LIMIT 1
        `;
        
        if (existingToken) {
            // Eğer aynı token aynı kullanıcıya aitse, sadece güncelle
            if (existingToken.user_id === userId && existingToken.user_type === userType) {
                await sql`
                    UPDATE push_tokens 
                    SET is_active = true, updated_at = NOW(), platform = ${platform || 'unknown'}
                    WHERE token = ${token}
                `;
                
                console.log('✅ Mevcut push token güncellendi:', { userId, userType });
                return res.json({
                    success: true,
                    message: 'Push token başarıyla güncellendi'
                });
            } else {
                // Farklı kullanıcıya aitse, eski token'ı deaktif et
                await sql`
                    UPDATE push_tokens 
                    SET is_active = false, updated_at = NOW()
                    WHERE token = ${token}
                `;
                console.log('🔄 Eski kullanıcının token\'ı deaktif edildi:', { oldUserId: existingToken.user_id, oldUserType: existingToken.user_type });
            }
        }
        
        // Kullanıcının diğer aktif token'larını deaktif et
        await sql`
            UPDATE push_tokens 
            SET is_active = false, updated_at = NOW()
            WHERE user_id = ${userId} AND user_type = ${userType} AND is_active = true AND token != ${token}
        `;
        
        // UPSERT kullanarak token'ı kaydet/güncelle
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
        
        console.log('✅ Push token başarıyla kaydedildi:', { userId, userType });
        res.json({
            success: true,
            message: 'Push token başarıyla kaydedildi'
        });
        
    } catch (error) {
        console.error('❌ Push token kaydetme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Push token kaydedilemedi',
            error: error.message
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
                return { success: false, error: 'No active push token found' };
            }
            
            pushToken = tokenRecord.token;
        }
        
        // Token formatını kontrol et
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error('❌ Geçersiz push token:', pushToken);
            return { success: false, error: 'Invalid push token' };
        }
        
        // Ses dosyasını platforma göre ayarla
        const soundFile = message.sound || 'default-notification.wav';
        const androidSound = soundFile;
        const iosSound = soundFile.endsWith('.wav') ? soundFile.replace('.wav', '') : soundFile; // iOS için .wav uzantısı kaldır
        
        // Platform tespiti - ExponentPushToken format: ExponentPushToken[xxxxx] (iOS) veya ExponentPushToken[xxxxxx] (Android)
        // Daha iyi platform tespiti için veritabanından kontrol edelim
        const [tokenRecord] = await sql`
            SELECT platform FROM push_tokens WHERE token = ${pushToken} LIMIT 1
        `;
        
        const platform = tokenRecord?.platform || 'unknown';
        const finalSound = platform === 'ios' ? iosSound : androidSound;
        
        console.log(`🔊 Push notification ses ayarları - Platform: ${platform}, Android: ${androidSound}, iOS: ${iosSound}, Final: ${finalSound}`);
        
        // Notification mesajını oluştur - Background için optimize edilmiş
        const notification = {
            to: pushToken,
            title: message.title,
            body: message.body,
            data: message.data || {},
            sound: finalSound, // Platform'a göre doğru ses formatını kullan
            badge: 1,
            priority: 'high',
            channelId: message.channelId || 'default',
            // Background notification için kritik ayarlar
            android: {
                priority: 'high',
                channelId: message.channelId || 'default',
                sound: androidSound,
                vibrate: [0, 250, 250, 250],
                lights: true,
                color: '#3B82F6',
                sticky: false,
                autoCancel: true,
                showWhen: true,
                largeIcon: null,
                bigText: message.body,
                subText: null,
                badgeIconType: 'large',
                actions: [],
            },
            ios: {
                priority: 'high',
                sound: iosSound,
                badge: 1,
                subtitle: message.subtitle || null,
                categoryId: message.categoryId || null,
                threadId: message.threadId || null,
                targetContentId: message.targetContentId || null,
                summaryArgument: message.summaryArgument || null,
                summaryArgumentCount: message.summaryArgumentCount || 0,
                interruptionLevel: 'active', // active, passive, timeSensitive, critical
                relevanceScore: 1.0,
                filterCriteria: null,
                storyId: null,
                attachments: [],
                launchImageName: null,
                actions: [],
            },
        };
        
        // Push notification gönder
        const ticketChunk = await expo.sendPushNotificationsAsync([notification]);
        
        // Receipt'i kontrol et (opsiyonel)
        if (ticketChunk[0].status === 'ok') {
            console.log('✅ Push notification başarıyla gönderildi:', ticketChunk[0].id);
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
        // userIds'ye göre token'ları al (her kullanıcı için sadece en son token)
        if (userIds && userIds.length > 0) {
            const tokenRecords = await sql`
                SELECT DISTINCT ON (user_id) token, user_id 
                FROM push_tokens 
                WHERE user_type = ${userType} AND user_id = ANY(${userIds}) AND is_active = true
                ORDER BY user_id, updated_at DESC
            `;
            tokens = tokenRecords.map(r => r.token);
        } else {
            return [];
        }

        // Geçerli token yoksa bitir
        if (tokens.length === 0) {
            return [];
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
            return [];
        }

        // Ses dosyasını platforma göre ayarla
        const soundFile = messageData.sound || 'default-notification.wav';
        const androidSound = soundFile;
        const iosSound = soundFile.replace('.wav', ''); // iOS için .wav uzantısı kaldır
        
        console.log(`🔊 Bulk push notification ses ayarları - Android: ${androidSound}, iOS: ${iosSound}`);

        // Mesajları oluştur - Background için optimize edilmiş
        const messages = validPushTokens.map(pushToken => ({
            to: pushToken,
            title: messageData.title,
            body: messageData.body,
            data: messageData.data || {},
            sound: androidSound, // Varsayılan olarak Android formatını kullan
            badge: 1,
            priority: 'high',
            channelId: messageData.channelId || 'default',
            // Background notification için kritik ayarlar
            android: {
                priority: 'high',
                channelId: messageData.channelId || 'default',
                sound: androidSound,
                vibrate: [0, 250, 250, 250],
                lights: true,
                color: '#3B82F6',
                sticky: false,
                autoCancel: true,
                showWhen: true,
                largeIcon: null,
                bigText: messageData.body,
                subText: null,
                badgeIconType: 'large',
                actions: [],
            },
            ios: {
                priority: 'high',
                sound: iosSound,
                badge: 1,
                subtitle: messageData.subtitle || null,
                categoryId: messageData.categoryId || null,
                threadId: messageData.threadId || null,
                targetContentId: messageData.targetContentId || null,
                summaryArgument: messageData.summaryArgument || null,
                summaryArgumentCount: messageData.summaryArgumentCount || 0,
                interruptionLevel: 'active', // active, passive, timeSensitive, critical
                relevanceScore: 1.0,
                filterCriteria: null,
                storyId: null,
                attachments: [],
                launchImageName: null,
                actions: [],
            },
        }));

        // Mesajları chunk'lara böl
        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        // Her chunk'ı gönder
        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
                console.log(`✅ ${chunk.length} push notification gönderildi`);
            } catch (error) {
                console.error('❌ Chunk gönderme hatası:', error);
                // Chunk hatası olsa bile diğer chunk'ları göndermeye devam et
                tickets.push(...chunk.map(() => ({ status: 'error', message: error.message })));
            }
        }
        
        return tickets;

    } catch (error) {
        console.error('❌ Bulk push notification hatası:', error);
        return [];
    }
}


module.exports = {
    router,
    sendExpoPushNotification,
    sendBulkExpoPushNotifications
}; 