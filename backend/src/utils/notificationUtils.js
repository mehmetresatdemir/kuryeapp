const { sql } = require('../config/db-config');


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
    
    try {
        
        
        const [notification] = await sql`
            INSERT INTO admin_notifications (
                title, message, type, user_type, user_id, data, created_at, updated_at
            ) VALUES (
                ${title}, ${message}, ${type}, ${mappedUserType}, ${userId}, 
                ${data ? JSON.stringify(data) : null}, NOW(), NOW()
            ) RETURNING *
        `;

        // Socket.io üzerinden de bildirim gönder
        if (io) {
            if (userId) {
                // Belirli bir kullanıcıya bildirim
                io.to(`${mappedUserType}_${userId}`).emit('notification', {
                    ...notification,
                    socketMessage: message
                });
            } else {
                // Tüm kullanıcı tipine bildirim
                io.to(mappedUserType === 'courier' ? 'couriers' : 'restaurants').emit('notification', {
                    ...notification,
                    socketMessage: message
                });
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
};

/**
 * Sipariş teslim edildiğinde bildirim oluştur
 */
const createOrderDeliveredNotification = async (order, courierInfo, requiresApproval = false) => {
    const courierName = courierInfo?.name || 'Kurye';
    
    if (requiresApproval) {
        // Onay bekleyen sipariş için restorana bildirim
        await createNotification({
            title: 'Sipariş Onay Bekliyor',
            message: `Sipariş #${order.id} ${courierName} tarafından teslim edildi ve onayınızı bekliyor.`,
            type: 'warning',
            userType: 'restaurant',
            userId: order.firmaid,
            data: {
                orderId: order.id,
                courierId: order.kuryeid,
                courierName: courierName,
                paymentMethod: order.odeme_yontemi
            }
        });
    } else {
        // Doğrudan teslim için restorana bildirim
        await createNotification({
            title: 'Sipariş Teslim Edildi',
            message: `Sipariş #${order.id} ${courierName} tarafından başarıyla teslim edildi.`,
            type: 'success',
            userType: 'restaurant',
            userId: order.firmaid,
            data: {
                orderId: order.id,
                courierId: order.kuryeid,
                courierName: courierName,
                paymentMethod: order.odeme_yontemi
            }
        });
    }
    
    // Kuryeye de bildirim gönder
    await createNotification({
        title: requiresApproval ? 'Sipariş Teslim Edildi - Onay Bekleniyor' : 'Sipariş Teslim Edildi',
        message: requiresApproval ? 
            `Sipariş #${order.id} başarıyla teslim edildi. Restoran onayı bekleniyor.` :
            `Sipariş #${order.id} başarıyla teslim edildi.`,
        type: 'success',
        userType: 'courier',
        userId: order.kuryeid,
        data: {
            orderId: order.id,
            restaurantId: order.firmaid,
            paymentMethod: order.odeme_yontemi
        }
    });
};

/**
 * Sipariş iptal edildiğinde bildirim oluştur
 */
const createOrderCancelledNotification = async (order, courierInfo) => {
    const courierName = courierInfo?.name || 'Kurye';
    
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
};

/**
 * Sipariş onaylandığında bildirim oluştur
 */
const createOrderApprovedNotification = async (order, restaurantInfo) => {
    const restaurantName = restaurantInfo?.name || 'Restoran';
    
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
};

/**
 * Yeni sipariş oluşturulduğunda bildirim oluştur (tercih sistemi ile)
 */
const createNewOrderNotification = async (order, io = null) => {
    try {
        // Restoran tercihleri kontrol edilir
        const [restaurant] = await sql`
            SELECT courier_visibility_mode FROM restaurants WHERE id = ${order.firmaid}
        `;
        console.log(`🏪 Restoran (${order.firma_adi}) tercihi:`, restaurant?.courier_visibility_mode);

        let candidateCouriers = [];
        
        if (restaurant && restaurant.courier_visibility_mode === 'selected_couriers') {
            // Restoranın seçili kuryeleri al
            const selectedCouriers = await sql`
                SELECT c.id as courier_id, c.name, c.notification_mode
                FROM restaurant_courier_preferences rcp
                JOIN couriers c ON c.id = rcp.courier_id 
                WHERE rcp.restaurant_id = ${order.firmaid} 
                AND rcp.is_selected = true
                AND c.is_blocked = false
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
            // Tüm kuryeleri al
            const allCouriers = await sql`
                SELECT id as courier_id, name, notification_mode 
                FROM couriers 
                WHERE is_blocked = false
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

        // Bildirim gönder
        for (const courier of candidateCouriers) {
            await createNotification({
                title: `Yeni Sipariş - ${order.firma_adi}`,
                message: `${order.mahalle} bölgesine yeni sipariş var. Ücret: ${order.courier_price || 0} TL`,
                type: 'info',
                userType: 'courier',
                userId: courier.courier_id,
                data: { orderId: order.id },
                io: io // Socket.io instance'ı geçir
            });

            // Socket.io üzerinden direkt olarak da gönder
            if (io) {
                io.to(`courier_${courier.courier_id}`).emit('newOrder', {
                    ...order,
                    courierName: courier.name,
                    socketMessage: `${order.mahalle} bölgesine yeni sipariş var. Ücret: ${order.courier_price || 0} TL`
                });
            }
        }

        console.log('📬 Bildirim gönderilecek kuryeler:', candidateCouriers.map(c => `${c.name} (${c.courier_id})`));

    } catch (error) {
        console.error('❌ Yeni sipariş bildirimi gönderilirken hata:', error);
        // Hata durumunda sessizce devam et, tüm kuryelere bildirim gönderme
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