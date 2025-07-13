const { sql } = require('../config/db-config');
const { sendExpoPushNotification, sendBulkExpoPushNotifications } = require('../routes/pushNotificationRoutes');
const path = require('path');


/**
 * Bildirim oluşturma fonksiyonu
 * @param {Object} params - Bildirim parametreleri
 * @param {string} params.title - Bildirim başlığı
 * @param {string} params.message - Bildirim mesajı
 * @param {string} params.type - Bildirim tipi (info, success, warning, error)
 * @param {string} params.userType - Kullanıcı tipi (restaurant, courier, admin)
 * @param {number|null} params.userId - Kullanıcı ID (null ise tüm kullanıcılara)
 * @param {Object} params.data - Ek veri (opsiyonel)
 * @param {Object} params.io - Socket.io instance (opsiyonel)
 */
const createNotification = async (params) => {
    const { title, message, type = 'info', userType, userId = null, data = null, io = null } = params;
    
    // Map 'admin' userType to 'restaurant' since admin notifications are handled on the restaurant side
    const mappedUserType = userType === 'admin' ? 'restaurant' : userType;
    
    console.log(`🔔 CREATENOTİFİCATİON çağrıldı:`, { title, message, type, userType, mappedUserType, userId, hasData: !!data, hasIo: !!io });
    
    try {
        
        
        const [notification] = await sql`
            INSERT INTO admin_notifications (
                title, message, type, user_type, user_id, data, created_at, updated_at
            ) VALUES (
                ${title}, ${message}, ${type}, ${mappedUserType}, ${userId}, 
                ${data ? JSON.stringify(data) : null}, NOW(), NOW()
            ) RETURNING *
        `;
        
        console.log(`✅ Admin notification veritabanına kaydedildi: ID ${notification.id}`);

        // Socket.io üzerinden de bildirim gönder
        if (io) {
            if (userId) {
                // Belirli bir kullanıcıya bildirim
                console.log(`📡 Socket.io - Spesifik kullanıcıya bildirim: ${mappedUserType}_${userId}`);
                io.to(`${mappedUserType}_${userId}`).emit('notification', {
                    ...notification,
                    socketMessage: message
                });
            } else {
                // Tüm kullanıcı tipine bildirim
                const roomName = mappedUserType === 'courier' ? 'couriers' : 'restaurants';
                console.log(`📡 Socket.io - Tüm ${roomName} room'una bildirim`);
                io.to(roomName).emit('notification', {
                    ...notification,
                    socketMessage: message
                });
            }
        } else {
            console.log(`⚠️  Socket.io instance yok, real-time bildirim gönderilemiyor`);
        }

        // Push notification gönder
        if (userId) {
            try {
                // Aktif bildirim sesini al
                const [activeSound] = await sql`
                    SELECT file_path FROM notification_sounds WHERE is_active = true LIMIT 1
                `;
                let notificationSound = 'default-notification.wav';
                if (activeSound) {
                    // Dosya uzantısını doğru şekilde al
                    const fullFileName = path.basename(activeSound.file_path);
                    const baseSoundName = path.parse(fullFileName).name; // Uzantıyı kaldır
                    notificationSound = `${baseSoundName}.wav`;
                }
                console.log(`🎵 createNotification push notification sesi: ${notificationSound}`);

                await sendExpoPushNotification({
                    title: title,
                    body: message,
                    data: { 
                        notificationId: notification.id.toString(),
                        type: 'general_notification',
                        withSound: true,
                        ...(data || {})
                    },
                    sound: notificationSound
                }, userId, mappedUserType);
                
                console.log(`📱 createNotification push notification gönderildi: ${mappedUserType} ${userId}`);
            } catch (pushError) {
                console.error(`❌ createNotification push notification hatası:`, pushError);
            }
        }
        
        return notification;
    } catch (error) {
        console.error('❌ Bildirim oluşturulurken hata:', error);
        throw error;
    }
};

/**
 * Sipariş kabul edildiğinde bildirim oluştur
 */
const createOrderAcceptedNotification = async (order, courierInfo) => {
    const courierName = courierInfo?.name || 'Kurye';
    
    // Restorana bildirim
    await createNotification({
        title: 'Sipariş Kabul Edildi',
        message: `Sipariş #${order.id} ${courierName} tarafından kabul edildi.`,
        type: 'success',
        userType: 'restaurant',
        userId: order.firmaid,
        data: {
            orderId: order.id,
            courierId: order.kuryeid,
            courierName: courierName,
            courierPhone: courierInfo?.phone || null
        }
    });

    // Aktif bildirim sesini al
    const [activeSound] = await sql`
        SELECT file_path FROM notification_sounds WHERE is_active = true LIMIT 1
    `;
    let notificationSound = 'default-notification.wav';
    if (activeSound) {
        // Dosya uzantısını doğru şekilde al
        const fullFileName = path.basename(activeSound.file_path);
        const baseSoundName = path.parse(fullFileName).name; // Uzantıyı kaldır
        notificationSound = `${baseSoundName}.wav`;
    }
    
    // Restorana push notification gönder
    try {
        await sendExpoPushNotification({
            title: '✅ Sipariş Kabul Edildi!',
            body: `Sipariş #${order.id} ${courierName} tarafından kabul edildi.`,
            data: { 
                orderId: order.id.toString(),
                type: 'order_accepted',
                courierName: courierName,
                withSound: true
            },
            sound: notificationSound
        }, order.firmaid, 'restaurant');
        
        console.log(`📱 Sipariş kabul push notification gönderildi: Restaurant ${order.firmaid}`);
    } catch (pushError) {
        console.error(`❌ Sipariş kabul push notification hatası:`, pushError);
    }
};

/**
 * Sipariş teslim edildiğinde bildirim oluştur
 */
const createOrderDeliveredNotification = async (order, courierInfo, requiresApproval = false, io = null) => {
    console.log(`📦 TESLİM BİLDİRİMİ BAŞLADI - Sipariş ID: ${order.id}, Restoran ID: ${order.firmaid}, Kurye ID: ${order.kuryeid}, Onay Gerekli: ${requiresApproval}`);
    
    const courierName = courierInfo?.name || 'Kurye';
    console.log(`👤 Kurye bilgileri:`, { courierName, courierId: order.kuryeid, courierInfo });
    
    // Hediye çeki durumunda sadece requiresApproval kontrol et, her zaman bildirim gönder
    const paymentMethod = order.odeme_yontemi?.toLowerCase();
    const isGiftCard = paymentMethod === 'hediye çeki' || paymentMethod === 'hediye ceki' || paymentMethod?.includes('hediye');
    if (isGiftCard) {
        console.log(`🎁 Hediye çeki ödemeli sipariş - Direkt teslim edildi bildirimi gönderiliyor`);
        requiresApproval = false; // Hediye çeki için hiçbir zaman onay gerekmiyor
    }
    
    // Aktif bildirim sesini al
    const [activeSound] = await sql`
        SELECT file_path FROM notification_sounds WHERE is_active = true LIMIT 1
    `;
    let notificationSound = 'default-notification.wav';
    if (activeSound) {
        // Dosya uzantısını doğru şekilde al
        const fullFileName = path.basename(activeSound.file_path);
        const baseSoundName = path.parse(fullFileName).name; // Uzantıyı kaldır
        notificationSound = `${baseSoundName}.wav`;
    }
    console.log(`🎵 Teslim bildirimi için kullanılacak ses: ${notificationSound}`);
    
    if (requiresApproval) {
        // Onay bekleyen sipariş için restorana bildirim
        await createNotification({
            title: '⏳ Sipariş Onayı Gerekiyor',
            message: `Sipariş #${order.id} ${courierName} tarafından teslim edildi. Onayınız bekleniyor.`,
            type: 'warning',
            userType: 'restaurant',
            userId: order.firmaid,
            data: {
                orderId: order.id,
                courierId: order.kuryeid,
                courierName: courierName,
                paymentMethod: order.odeme_yontemi
            },
            io: io
        });
    } else {
        // Doğrudan teslim için restorana bildirim
        await createNotification({
            title: '✅ Sipariş Teslim Edildi',
            message: `Sipariş #${order.id} ${courierName} tarafından teslim edildi.`,
            type: 'success',
            userType: 'restaurant',
            userId: order.firmaid,
            data: {
                orderId: order.id,
                courierId: order.kuryeid,
                courierName: courierName,
                paymentMethod: order.odeme_yontemi
            },
            io: io
        });
    }
    
    // NOT: Push notification createNotification fonksiyonu tarafından gönderiliyor
    // Duplicate notification önlemek için burada tekrar gönderilmiyor
};

/**
 * Sipariş iptal edildiğinde bildirim oluştur
 */
const createOrderCancelledNotification = async (order, courierInfo) => {
    const courierName = courierInfo?.name || 'Kurye';
    
    // Aktif bildirim sesini al
    const [activeSound] = await sql`
        SELECT file_path FROM notification_sounds WHERE is_active = true LIMIT 1
    `;
    let notificationSound = 'default-notification.wav';
    if (activeSound) {
        // Dosya uzantısını doğru şekilde al
        const fullFileName = path.basename(activeSound.file_path);
        const baseSoundName = path.parse(fullFileName).name; // Uzantıyı kaldır
        notificationSound = `${baseSoundName}.wav`;
    }
    
    // Restorana bildirim
    await createNotification({
        title: 'Sipariş İptal Edildi',
        message: `Sipariş #${order.id} ${courierName} tarafından iptal edildi ve tekrar bekleme listesine alındı.`,
        type: 'warning',
        userType: 'restaurant',
        userId: order.firmaid,
        data: {
            orderId: order.id,
            courierId: order.kuryeid,
            courierName: courierName
        }
    });
    
    // Restorana push notification gönder
    try {
        await sendExpoPushNotification({
            title: '⚠️ Sipariş İptal Edildi',
            body: `Sipariş #${order.id} ${courierName} tarafından iptal edildi.`,
            data: { 
                orderId: order.id.toString(),
                type: 'order_cancelled',
                courierName: courierName,
                withSound: true
            },
            sound: notificationSound
        }, order.firmaid, 'restaurant');
        
        console.log(`📱 Sipariş iptal push notification gönderildi: Restaurant ${order.firmaid}`);
    } catch (pushError) {
        console.error(`❌ Sipariş iptal push notification hatası:`, pushError);
    }
};

/**
 * Sipariş onaylandığında bildirim oluştur
 */
const createOrderApprovedNotification = async (order, restaurantInfo) => {
    const restaurantName = restaurantInfo?.name || 'Restoran';
    
    // Aktif bildirim sesini al
    const [activeSound] = await sql`
        SELECT file_path FROM notification_sounds WHERE is_active = true LIMIT 1
    `;
    let notificationSound = 'default-notification.wav';
    if (activeSound) {
        // Dosya uzantısını doğru şekilde al
        const fullFileName = path.basename(activeSound.file_path);
        const baseSoundName = path.parse(fullFileName).name; // Uzantıyı kaldır
        notificationSound = `${baseSoundName}.wav`;
    }
    
    // Kuryeye bildirim
    await createNotification({
        title: 'Sipariş Onaylandı',
        message: `Sipariş #${order.id} ${restaurantName} tarafından onaylandı. Ödeme tahsil edildi.`,
        type: 'success',
        userType: 'courier',
        userId: order.kuryeid,
        data: {
            orderId: order.id,
            restaurantId: order.firmaid,
            restaurantName: restaurantName,
            paymentAmount: order.nakit_tutari + order.banka_tutari
        }
    });
    
    // NOT: Push notification createNotification fonksiyonu tarafından gönderiliyor
    // Duplicate notification önlemek için sendExpoPushNotification çağrılmıyor
};

/**
 * Yeni sipariş oluşturulduğunda bildirim oluştur (tercih sistemi ile)
 */
const createNewOrderNotification = async (order, io = null) => {
    try {
        console.log(`🆕 YENİ SİPARİŞ BİLDİRİMİ BAŞLADI - Sipariş ID: ${order.id}, Restoran ID: ${order.firmaid}, Restoran Adı: ${order.firma_adi}`);
        
        // Aktif bildirim sesini veritabanından al
        const [activeSound] = await sql`
            SELECT file_path FROM notification_sounds WHERE is_active = true LIMIT 1
        `;
        let notificationSound = 'default-notification.wav';
        if (activeSound) {
            // Dosya uzantısını doğru şekilde al
            const fullFileName = path.basename(activeSound.file_path);
            const baseSoundName = path.parse(fullFileName).name; // Uzantıyı kaldır
            notificationSound = `${baseSoundName}.wav`;
        }
        console.log(`🎵 Kullanılacak bildirim sesi: ${notificationSound}`);

        // Restoran tercihleri ve bilgileri kontrol edilir
        const [restaurant] = await sql`
            SELECT courier_visibility_mode, phone FROM restaurants WHERE id = ${order.firmaid}
        `;
        console.log(`🏪 Restoran (${order.firma_adi}) tercihi:`, restaurant?.courier_visibility_mode);

        // Siparişi oluşturan restoranın kurye olarak kayıtlı olup olmadığını kontrol et
        const [restaurantAsCourier] = await sql`
            SELECT id FROM couriers WHERE id = ${order.firmaid}
        `;
        
        // Restoran ID'sini HER ZAMAN hariç tut (dual role olsun ya da olmasın)
        const excludedCourierIds = [order.firmaid];
        
        // Aynı telefon numarasına sahip kuryeleri de hariç tut
        if (restaurant?.phone) {
            const couriersWithSamePhone = await sql`
                SELECT id FROM couriers 
                WHERE (phone = ${restaurant.phone} OR phone_number = ${restaurant.phone}) 
                AND id != ${order.firmaid}
            `;
            
            if (couriersWithSamePhone.length > 0) {
                const phoneMatchCourierIds = couriersWithSamePhone.map(c => c.id);
                excludedCourierIds.push(...phoneMatchCourierIds);
                console.log(`📱 Aynı telefon numarasına sahip kurye ID'leri hariç tutuluyor:`, phoneMatchCourierIds);
            }
        }
        
        console.log(`🚫 Bildirim gönderilmeyecek kurye ID'leri:`, excludedCourierIds);
        
        if (restaurantAsCourier) {
            console.log(`⚠️  DUAL ROLE KULLANICI TESPİT EDİLDİ: Restoran ID ${order.firmaid} aynı zamanda kurye olarak kayıtlı!`);
        } else {
            console.log(`✅ Restoran ID ${order.firmaid} sadece restoran olarak kayıtlı`);
        }

        let candidateCouriers = [];
        
        if (restaurant && restaurant.courier_visibility_mode === 'selected_couriers') {
            // Restoranın seçili kuryeleri al (hariç tutulacak ID'leri çıkar)
            const selectedCouriers = await sql`
                SELECT c.id as courier_id, c.name, c.notification_mode
                FROM restaurant_courier_preferences rcp
                JOIN couriers c ON c.id = rcp.courier_id 
                WHERE rcp.restaurant_id = ${order.firmaid} 
                AND rcp.is_selected = true
                AND c.is_blocked = false
                AND c.id != ALL(${excludedCourierIds})
            `;
            
            if (selectedCouriers.length === 0) {
                console.log('⚠️ Restoranın seçili kuryesi yok, bildirim gönderilmiyor');
                return;
            }
            
            // Sadece kurye tercihleri uygun olanları seç
            for (const courier of selectedCouriers) {
                let shouldAdd = false;
                
                if (courier.notification_mode === 'all_restaurants') {
                    shouldAdd = true;
                    console.log(`✅ ${courier.name} tüm restoranlardan bildirim alıyor`);
                } else {
                    // Kurye sadece seçili restoranlardan bildirim alıyor
                    const [hasSelectedRestaurant] = await sql`
                        SELECT 1 FROM courier_restaurant_preferences 
                        WHERE courier_id = ${courier.courier_id} 
                        AND restaurant_id = ${order.firmaid}
                        AND is_selected = true
                    `;
                    
                    shouldAdd = hasSelectedRestaurant ? true : false;
                    console.log(`${shouldAdd ? '✅' : '❌'} ${courier.name} bu restorandan bildirim ${shouldAdd ? 'alıyor' : 'almıyor'}`);
                }
                
                if (shouldAdd) {
                    candidateCouriers.push(courier);
                }
            }
            
            console.log('👥 Restoranın seçtiği ve tercihleri uygun kuryeler:', candidateCouriers.map(c => `${c.name} (${c.courier_id})`));
            
        } else {
            // Tüm kuryeleri al (hariç tutulacak ID'leri çıkar)
            const allCouriers = await sql`
                SELECT id as courier_id, name, notification_mode 
                FROM couriers 
                WHERE is_blocked = false
                AND id != ALL(${excludedCourierIds})
            `;
            
            // Sadece kurye tercihleri uygun olanları seç
            for (const courier of allCouriers) {
                let shouldAdd = false;
                
                if (courier.notification_mode === 'all_restaurants') {
                    shouldAdd = true;
                    console.log(`✅ ${courier.name} tüm restoranlardan bildirim alıyor`);
                } else {
                    // Kurye sadece seçili restoranlardan bildirim alıyor
                    const [hasSelectedRestaurant] = await sql`
                        SELECT 1 FROM courier_restaurant_preferences 
                        WHERE courier_id = ${courier.courier_id} 
                        AND restaurant_id = ${order.firmaid}
                        AND is_selected = true
                    `;
                    
                    shouldAdd = hasSelectedRestaurant ? true : false;
                    console.log(`${shouldAdd ? '✅' : '❌'} ${courier.name} bu restorandan bildirim ${shouldAdd ? 'alıyor' : 'almıyor'}`);
                }
                
                if (shouldAdd) {
                    candidateCouriers.push(courier);
                }
            }
            
            console.log('👥 Tercihleri uygun kuryeler:', candidateCouriers.map(c => `${c.name} (${c.courier_id})`));
        }

        // Bildirim gönderilecek kuryelerin ID listesini oluştur
        const courierIds = candidateCouriers.map(c => c.courier_id);

        // Socket.io üzerinden bildirimleri gönder (her zaman)
        if (io) {
            console.log(`📡 Socket.io ile yeni sipariş bildirimi gönderiliyor - ${courierIds.length} kurye`);
            
            courierIds.forEach(courierId => {
                console.log(`📤 Kurye ${courierId} için newOrder event gönderiliyor`);
                
                // Sadece spesifik kurye ID'sine gönder
                io.to(`courier_${courierId}`).emit('newOrder', {
                    ...order,
                    socketMessage: `${order.mahalle} bölgesine yeni sipariş var. Ücret: ${order.courier_price || 0} TL`
                });
            });
            
            console.log('✅ Socket.io ile yeni sipariş bildirimi gönderildi');
            console.log('🚫 Genel "couriers" room\'una gönderim yapılmadı (dual role kullanıcı koruması)');
        } else {
            console.log('❌ Socket.io instance bulunamadı, real-time bildirim gönderilemedi');
        }

        // Toplu push notification gönder (sadece kuryelere)
        if (courierIds.length > 0) {
            try {
                console.log(`📱 Push notification gönderiliyor - Ses: ${notificationSound}`);
                await sendBulkExpoPushNotifications(
                    {
                        title: `🆕 Yeni Sipariş: ${order.firma_adi}`,
                        body: `${order.mahalle} - ${order.courier_price || 0} ₺`,
                        sound: notificationSound, // Özel sesi burada kullan
                        data: { 
                            orderId: order.id.toString(),
                            type: 'new_order',
                            restaurantName: order.firma_adi,
                            district: order.mahalle,
                            price: order.courier_price || 0,
                            withSound: true
                        },
                        channelId: 'new-orders', // Android için kanal ID
                        priority: 'high',
                        // Background notification için ek ayarlar
                        subtitle: 'Yeni Sipariş Bildirimi',
                        categoryId: 'NEW_ORDER',
                        threadId: 'new-orders',
                        interruptionLevel: 'active',
                        relevanceScore: 1.0
                    },
                    courierIds,
                    'courier'
                );
                console.log(`📬 Push notification gönderildi:`, courierIds);
            } catch (pushError) {
                console.error(`❌ Toplu push notification hatası:`, pushError);
            }
        }

    } catch (error) {
        console.error('❌ Yeni sipariş bildirimi oluşturulurken hata:', error);
    }
};

module.exports = {
    createNotification,
    createOrderAcceptedNotification,
    createOrderDeliveredNotification,
    createOrderCancelledNotification,
    createOrderApprovedNotification,
    createNewOrderNotification
}; 