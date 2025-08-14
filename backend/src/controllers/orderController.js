const { sql } = require('../config/db-config');

const { removeOrderFromReminderTracking } = require('../services/orderCleanupService');
const fs = require('fs');
const path = require('path');


// Helper function to convert relative path to absolute URL
const getAbsoluteImageUrl = (relativePath, req = null) => {
    if (!relativePath) return null;
    if (relativePath.startsWith('http')) return relativePath;
    
    // Use appropriate server URL based on environment
    let baseUrl;
      if (process.env.NODE_ENV === 'production') {
    baseUrl = process.env.API_BASE_URL || 'https://kuryex1.enucuzal.com';
    } else if (req) {
        baseUrl = `http://${req.get('host')}`;
    } else {
        baseUrl = 'http://192.168.1.105:3000'; // fallback for development
    }
    
    return `${baseUrl}${relativePath}`;
};

// Siparişleri filtreleyerek getir
const getOrdersByStatus = async (req, res) => {
    const { status, restaurantId, courierId, search } = req.query;
    
    let whereClauses = [];
    let queryParams = [];

    if (status) {
        whereClauses.push(`status = $${queryParams.length + 1}`);
        queryParams.push(status);
    }
    if (restaurantId) {
        whereClauses.push(`firmaid = $${queryParams.length + 1}`);
        queryParams.push(restaurantId);
    }
    if (courierId) {
        whereClauses.push(`kuryeid = $${queryParams.length + 1}`);
        queryParams.push(courierId);
    }
    if (search) {
        // Assuming search can be order id, customer name, etc.
        // This is a simple search, can be improved with full-text search.
        whereClauses.push(`(id::text ILIKE $${queryParams.length + 1} OR customer_name ILIKE $${queryParams.length + 1})`);
        queryParams.push(`%${search}%`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    try {
        // We cannot directly use prepared statements with dynamic WHERE clauses with the 'sql' template tag library easily.
        // A better approach would be to build the query string.
        // NOTE: This part is complex and needs a safe way to build queries.
        // For now, let's stick to a full fetch and filter on the backend, which is inefficient but safe.
        // A proper implementation would use a query builder.

        // Inefficient but safe way for now: fetch all and filter in JS.
        let orders = await sql`
            SELECT 
                o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                o.resim, o.status, o.kuryeid, o.preparation_time,
                o.created_at::text as created_at,
                o.updated_at::text as updated_at,
                o.accepted_at::text as accepted_at,
                o.delivered_at::text as delivered_at,
                o.approved_at::text as approved_at,
                o.courier_price, o.restaurant_price,
                r.name as firma_name, 
                c.name as kurye_name 
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            LEFT JOIN couriers c ON o.kuryeid = c.id
            ORDER BY o.created_at DESC
        `;
        
        // Manual filtering
        if (status) orders = orders.filter(o => o.status === status);
        if (restaurantId) orders = orders.filter(o => o.firmaid == restaurantId);
        if (courierId) orders = orders.filter(o => o.kuryeid == courierId);
        if (search) {
             orders = orders.filter(o => 
                (o.id.toString().includes(search)) ||
                (o.customer_name && o.customer_name.toLowerCase().includes(search.toLowerCase()))
            );
        }

        res.status(200).json({ data: orders });
    } catch (error) {
        console.error('Siparişler alınırken hata:', error);
        res.status(500).json({ message: "Sunucu hatası" });
    }
};

const addOrder = async (req, res) => {
    try {
        const { 
            userId, mahalle, odemeYontemi, deliveryPrice, restaurantPrice, 
            firmaAdi, preparationTime, resim, nakitTutari, bankaTutari, hediyeTutari 
        } = req.body;
        const firmaid = parseInt(req.body.firmaid);

        if (!userId || !mahalle || !odemeYontemi || deliveryPrice == null || restaurantPrice == null || !firmaid || !firmaAdi) {
            return res.status(400).json({
                success: false,
                message: 'Gerekli alanlar eksik'
            });
        }

        // Handle image URL - use the provided URL or uploaded file
        let imageUrl = resim || null;
        if (req.file) {
            const filename = req.file.filename;
            const relativePath = `/uploads/orders/${filename}`;
            imageUrl = getAbsoluteImageUrl(relativePath, req);
            
            // Validate that the file exists before proceeding
            const filePath = path.join(__dirname, '../../uploads/orders', filename);
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({
                    success: false,
                    message: 'Resim yüklenirken hata oluştu'
                });
            }
        }

                const finalPreparationTime = preparationTime !== undefined && preparationTime !== null ? preparationTime : 20;

        // DB tarafında timezone ayarlı olduğundan NOW() kullanıyoruz
        const [newOrder] = await sql`
            INSERT INTO orders (
                firmaid, mahalle, odeme_yontemi, courier_price, restaurant_price, 
                firma_adi, resim, preparation_time, created_at, status,
                nakit_tutari, banka_tutari, hediye_tutari
            ) VALUES (
                ${firmaid}, ${mahalle}, ${odemeYontemi}, ${deliveryPrice}, ${restaurantPrice}, 
                ${firmaAdi}, ${imageUrl}, ${finalPreparationTime}, 
                NOW(), 'bekleniyor',
                ${nakitTutari || 0}, ${bankaTutari || 0}, ${hediyeTutari || 0}
            ) RETURNING 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
        `;

        // Send push notifications to all eligible couriers
        const { sendNewOrderNotificationToCouriers } = require('../services/pushNotificationService');
        try {
            const notificationResult = await sendNewOrderNotificationToCouriers(newOrder);
            console.log(`🔔 New order notification sent to ${notificationResult.sent}/${notificationResult.total} couriers`);
        } catch (notificationError) {
            console.error('❌ Error sending new order notifications:', notificationError);
            // Don't fail the order creation if notification fails
        }

        // Emit socket event for real-time UI updates
        if (req.io) {
            // Emit to all couriers for instant order list refresh
            req.io.to('couriers').emit('newOrderAdded', {
                orderId: newOrder.id.toString(),
                neighborhood: newOrder.mahalle,
                restaurantId: newOrder.firmaid,
                message: 'Yeni sipariş eklendi',
                timestamp: Date.now()
            });
            console.log(`🔄 Real-time order refresh signal sent to all couriers`);
        }

        res.status(201).json({
            success: true,
            message: 'Sipariş başarıyla eklendi',
            data: newOrder
        });

    } catch (error) {
        // If there was an error and we uploaded a file, clean it up
        if (req.file) {
            try {
                const filePath = path.join(__dirname, '../../uploads/orders', req.file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (cleanupError) {
                console.error('Resim temizleme hatası:', cleanupError);
            }
        }

        console.error('Add order error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
};

const updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    const { id: userId, role } = req.user; // Get user info from token

    try {
        // Find the order first to check permissions
        const [order] = await sql`SELECT firmaid, kuryeid FROM orders WHERE id = ${orderId}`;

        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Authorization check
        if (role === 'restaurant' && order.firmaid !== userId) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }
        // Add more checks if a courier can change status, etc.

        // Update order using PostgreSQL timezone - NOW() Türkiye saati döndürür
        const [updatedOrder] = await sql`
            UPDATE orders 
            SET status = ${status}, updated_at = NOW()
            WHERE id = ${orderId} 
            RETURNING 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
        `;

        // Bildirim sistemi kaldırıldı
        res.status(200).json({ success: true, data: updatedOrder });
    } catch (error) {
        console.error(`Sipariş #${orderId} durumu güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

const assignCourier = async (req, res) => {
    const { orderId } = req.params;
    const { courierId } = req.body;

    try {
        // Check if order is already taken
        const [order] = await sql`SELECT status, kuryeid FROM orders WHERE id = ${orderId}`;
        if (!order || order.kuryeid) {
            return res.status(400).json({ success: false, message: 'Sipariş zaten alınmış veya mevcut değil.' });
        }

        const [updatedOrder] = await sql`
            UPDATE orders 
            SET kuryeid = ${courierId}, status = 'kuryede', updated_at = NOW() 
            WHERE id = ${orderId}
            RETURNING 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
        `;
        
        // Bildirim sistemi kaldırıldı

        res.status(200).json({ success: true, data: updatedOrder });
    } catch (error) {
        console.error(`Sipariş #${orderId} kuryeye atanırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

const getActiveOrdersForCourier = async (req, res) => {
    const { courierId } = req.params;
    const { id: userId, role } = req.user;

    // A courier can only see their own orders.
    if ((role === 'courier' || role === 'kurye') && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }
    // Admins can see any courier's orders
    if (role !== 'courier' && role !== 'kurye' && role !== 'admin') { // Assuming admin role exists
        return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });
    }

    try {
        const orders = await sql`
            SELECT 
                o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                o.resim, o.status, o.kuryeid, o.preparation_time,
                o.created_at::text as created_at,
                o.updated_at::text as updated_at,
                o.accepted_at::text as accepted_at,
                o.delivered_at::text as delivered_at,
                o.approved_at::text as approved_at,
                o.courier_price, o.restaurant_price,
                r.name as firma_name,
                r.phone as firma_phone,
                CASE 
                    WHEN o.accepted_at IS NOT NULL AND o.delivered_at IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60
                    ELSE NULL
                END as delivery_time_minutes
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            WHERE o.kuryeid = ${courierId} AND o.status NOT IN ('teslim edildi', 'iptal edildi', 'onay bekliyor')
            ORDER BY o.created_at ASC
        `;

        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error(`Kurye #${courierId} aktif siparişleri alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

const getOrdersForRestaurant = async (req, res) => {
    const { restaurantId } = req.params;
    console.log("getOrdersForRestaurant: Received restaurantId from request params:", restaurantId);
    // The status filter is now handled directly in the SQL query for active orders

    if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Restoran ID gereklidir.' });
    }

    try {
        // Fetch orders that are 'bekleniyor' or 'kuryede' (excluding 'onay bekliyor')
        const orders = await sql`
            SELECT 
                o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                o.resim, o.status, o.kuryeid, o.preparation_time,
                o.created_at::text as created_at,
                o.updated_at::text as updated_at,
                o.accepted_at::text as accepted_at,
                o.delivered_at::text as delivered_at,
                o.approved_at::text as approved_at,
                c.name as kurye_name,
                c.name as kurye_surname,
                c.phone as kurye_phone,
                COALESCE(o.courier_price, 0) as courier_price,
                COALESCE(o.restaurant_price, 0) as restaurant_price,
                CASE 
                    WHEN o.accepted_at IS NOT NULL AND o.delivered_at IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60
                    ELSE NULL
                END as delivery_time_minutes
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE o.firmaid = ${restaurantId} 
            AND o.status IN ('bekleniyor', 'kuryede')
            ORDER BY o.created_at DESC
        `;

        res.json({ success: true, data: orders });
    } catch (error) {
        console.error(`Restoran #${restaurantId} siparişleri alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Accept orders - minimal logging
const acceptOrders = async (req, res) => {
    const { orderIds, courierId } = req.body;
    const acceptedOrders = [];
    const failedOrders = [];

    for (const orderId of orderIds) {
        try {
            

                          // Update order using sunucu saati (timezone olmadan)
              const result = await sql`
                UPDATE orders 
                SET kuryeid = ${courierId}, status = 'kuryede', 
                    accepted_at = NOW(), 
                    updated_at = NOW()
                WHERE id = ${orderId} AND status = 'bekleniyor'
                RETURNING 
                    id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                    nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                    resim, status, kuryeid, preparation_time,
                    created_at::text as created_at,
                    updated_at::text as updated_at,
                    accepted_at::text as accepted_at,
                    delivered_at::text as delivered_at,
                    approved_at::text as approved_at,
                    courier_price, restaurant_price
            `;

            if (result.length > 0) {
                const order = result[0];
                acceptedOrders.push(order);

                const [courier] = await sql`SELECT name FROM couriers WHERE id = ${courierId}`;
                const courierName = courier ? courier.name : `Kurye #${courierId}`;

                // Send push notification to restaurant
                const { sendOrderAcceptedNotification } = require('../services/pushNotificationService');
                try {
                    const notificationResult = await sendOrderAcceptedNotification({
                        restaurantId: order.firmaid,
                        orderId: order.id,
                        courierName: courierName,
                        orderDetails: {
                            preparation_time: order.preparation_time,
                            mahalle: order.mahalle,
                            firma_adi: order.firma_adi
                        }
                    });
                    console.log(`🔔 Order accepted notification sent to restaurant ${order.firmaid}: ${notificationResult.success ? 'success' : 'failed'}`);
                } catch (notificationError) {
                    console.error('❌ Error sending order accepted notification:', notificationError);
                    // Don't fail the order acceptance if notification fails
                }

                // Emit socket event for real-time restaurant UI update
                if (req.io) {
                    req.io.to(`restaurant_${order.firmaid}`).emit('orderStatusChanged', {
                        orderId: order.id.toString(),
                        newStatus: 'kuryede',
                        courierName: courierName,
                        courierId: courierId.toString(),
                        orderDetails: {
                            mahalle: order.mahalle,
                            preparation_time: order.preparation_time,
                            courier_price: order.courier_price
                        },
                        message: `Sipariş kurye ${courierName} tarafından kabul edildi`,
                        timestamp: Date.now()
                    });
                    console.log(`🔄 Order status change event sent to restaurant ${order.firmaid} - Order ${order.id} accepted by courier ${courierName}`);
                    
                    // Emit to all couriers for real-time order list updates
                    req.io.to('couriers').emit('orderStatusUpdate', {
                        orderId: order.id.toString(),
                        status: 'kuryede',
                        courierId: courierId.toString(),
                        courierName: courierName,
                        message: `Sipariş #${order.id} kurye ${courierName} tarafından kabul edildi`,
                        timestamp: Date.now()
                    });
                    console.log(`🔄 Order status update sent to all couriers for order ${order.id}`);
                }

            } else {
                failedOrders.push(orderId);
            }
        } catch (error) {
            console.error(`❌ Sipariş #${orderId} güncellenirken hata:`, error);
            failedOrders.push(orderId);
        }
    }

    res.json({
        success: true,
        message: `${acceptedOrders.length} sipariş kabul edildi`,
        acceptedOrders,
        failedOrders
    });
};

// Deliver order - minimal logging
const deliverOrder = async (req, res) => {
    const { orderId, courierId } = req.body;

    try {
        // Get order and courier info
        const [order] = await sql`
            SELECT id, firmaid, kuryeid, status, odeme_yontemi FROM orders 
            WHERE id = ${orderId} AND kuryeid = ${courierId}
        `;

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Sipariş bulunamadı veya size ait değil'
            });
        }

        const [courier] = await sql`
            SELECT id, name, phone FROM couriers WHERE id = ${courierId}
        `;

        const paymentMethod = order.odeme_yontemi.toLowerCase();
        const courierName = courier?.name || `Kurye #${courierId}`;

        // Online payment or gift card - direct delivery
        if (paymentMethod === 'online' || paymentMethod === 'hediye çeki' || paymentMethod === 'hediye ceki' || paymentMethod.includes('hediye')) {
            await sql`
                UPDATE orders 
                SET status = 'teslim edildi', 
                    delivered_at = NOW(), 
                    updated_at = NOW()
                WHERE id = ${orderId}
            `;

            // Send delivery success notification to restaurant
            const { sendOrderDeliveredNotification } = require('../services/pushNotificationService');
            try {
                const notificationResult = await sendOrderDeliveredNotification({
                    restaurantId: order.firmaid,
                    orderId: orderId,
                    courierName: courierName
                });
                if (notificationResult.success) {
                    console.log(`🔔 Order delivered notification sent to restaurant ${order.firmaid}`);
                }
            } catch (notificationError) {
                console.error('❌ Error sending order delivered notification:', notificationError);
                // Don't fail the delivery if notification fails
            }

            // Emit socket event for real-time restaurant UI update
            if (req.io) {
                req.io.to(`restaurant_${order.firmaid}`).emit('orderDelivered', {
                    orderId: orderId.toString(),
                    courierName: courierName,
                    paymentMethod: paymentMethod,
                    message: `Sipariş #${orderId} kurye ${courierName} tarafından teslim edildi`,
                    timestamp: Date.now()
                });
                console.log(`🔄 Order delivered event sent to restaurant ${order.firmaid} - Order ${orderId} delivered by courier ${courierName}`);
            }

            return res.status(200).json({
                success: true,
                message: 'Sipariş başarıyla teslim edildi',
                data: { status: 'teslim edildi' }
            });
        }

        // Cash or credit card payment - needs approval
        await sql`
            UPDATE orders 
            SET status = 'onay bekliyor', 
                delivered_at = NOW(), 
                updated_at = NOW()
            WHERE id = ${orderId}
        `;

        // Send delivery approval notification to restaurant
        const { sendDeliveryApprovalNotification } = require('../services/pushNotificationService');
        try {
            const notificationResult = await sendDeliveryApprovalNotification({
                restaurantId: order.firmaid,
                orderId: orderId,
                courierName: courierName
            });
            if (notificationResult.success) {
                console.log(`🔔 Delivery approval notification sent to restaurant ${order.firmaid}`);
            }
        } catch (notificationError) {
            console.error('❌ Error sending delivery approval notification:', notificationError);
            // Don't fail the delivery if notification fails
        }

        res.status(200).json({
            success: true,
            message: 'Sipariş teslim edildi ve restoran onayı bekleniyor',
            data: { status: 'onay bekliyor' }
        });

    } catch (error) {
        console.error('Sipariş teslim hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Sipariş teslim edilirken bir hata oluştu'
        });
    }
};

// Cancel order - minimal logging  
const cancelOrder = async (req, res) => {
    const { orderId, reason } = req.body;

    try {
        // Önce siparişi ve kurye bilgilerini al
        const [originalOrder] = await sql`
            SELECT o.*, c.name as courier_name
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE o.id = ${orderId}
        `;

        if (!originalOrder) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Eğer sipariş kuryede ise, kuryeye iptal bildirimi gönder
        if (originalOrder.kuryeid && originalOrder.status === 'kuryede') {
            // Restoran bilgilerini al
            const [restaurant] = await sql`SELECT name FROM restaurants WHERE id = ${originalOrder.firmaid}`;
            const restaurantName = restaurant ? restaurant.name : `Restoran #${originalOrder.firmaid}`;
            
            // Send push notification to courier about order cancellation
            const { sendOrderCancelledNotification } = require('../services/pushNotificationService');
            try {
                const notificationResult = await sendOrderCancelledNotification({
                    courierId: originalOrder.kuryeid,
                    orderId: orderId,
                    restaurantName: restaurantName,
                    courierName: originalOrder.courier_name
                });
                console.log(`🔔 Order cancelled notification sent to courier ${originalOrder.kuryeid}: ${notificationResult.success ? 'success' : 'failed'}`);
            } catch (notificationError) {
                console.error('❌ Error sending order cancelled notification:', notificationError);
                // Don't fail the order cancellation if notification fails
            }
        }

        const [updatedOrder] = await sql`
            UPDATE orders 
            SET status = 'bekleniyor',
                kuryeid = NULL,
                accepted_at = NULL,
                updated_at = NOW()
            WHERE id = ${orderId}
            RETURNING 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
        `;

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Send new order notification to couriers again (order is back in pool)
        const { sendNewOrderNotificationToCouriers } = require('../services/pushNotificationService');
        try {
            const notificationResult = await sendNewOrderNotificationToCouriers(updatedOrder);
            console.log(`🔔 Re-notification sent to ${notificationResult.sent}/${notificationResult.total} couriers for cancelled order`);
        } catch (notificationError) {
            console.error('❌ Error sending re-notification for cancelled order:', notificationError);
            // Don't fail the cancellation if notification fails
        }

        // Emit socket event for real-time restaurant UI update
        if (req.io) {
            req.io.to(`restaurant_${originalOrder.firmaid}`).emit('orderCancelled', {
                orderId: orderId.toString(),
                courierName: originalOrder.courier_name || `Kurye #${originalOrder.kuryeid}`,
                reason: reason || 'Belirtilmeyen sebep',
                message: `Sipariş kurye ${originalOrder.courier_name || originalOrder.kuryeid} tarafından iptal edildi`,
                newStatus: 'bekleniyor',
                timestamp: Date.now()
            });
            console.log(`🔄 Order cancellation event sent to restaurant ${originalOrder.firmaid} - Order ${orderId} cancelled by courier`);
            
            // Emit to all couriers that order is back in pool
            req.io.to('couriers').emit('orderStatusUpdate', {
                orderId: orderId.toString(),
                status: 'bekleniyor',
                message: `Sipariş #${orderId} iptal edildi ve tekrar havuza düştü`,
                timestamp: Date.now()
            });
            console.log(`🔄 Order back in pool notification sent to all couriers for order ${orderId}`);
        }

        res.json({ 
            success: true, 
            data: updatedOrder,
            message: 'Sipariş iptal edildi ve tekrar havuza düştü'
        });
    } catch (error) {
        console.error("cancelOrder error:", error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Sipariş onaylama (restoran tarafından)
const approveOrder = async (req, res) => {
    const { orderId } = req.body;
    const { id: userId, role } = req.user;

    try {
        // Önce siparişi bul
        const [order] = await sql`
            SELECT o.*, c.name as courier_name, c.phone as courier_phone
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE o.id = ${orderId}
        `;

        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Yetki kontrolü
        if (role !== 'admin' && (role === 'restaurant' && order.firmaid !== userId)) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        // Online veya hediye çeki ödemelerini kontrol et
        const paymentMethod = order.odeme_yontemi.toLowerCase();
        if (paymentMethod === 'online' || paymentMethod === 'hediye çeki' || paymentMethod === 'hediye ceki' || paymentMethod.includes('hediye')) {
            // Direkt teslim edildi olarak işaretle
            
            const [updatedOrder] = await sql`
                UPDATE orders 
                SET 
                    status = 'teslim edildi',
                    approved_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${orderId}
                RETURNING 
                    id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                    nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                    resim, status, kuryeid, preparation_time,
                    created_at::text as created_at,
                    updated_at::text as updated_at,
                    accepted_at::text as accepted_at,
                    delivered_at::text as delivered_at,
                    approved_at::text as approved_at,
                    courier_price, restaurant_price
            `;

            // Send approval notification to courier and emit socket events
            if (updatedOrder.kuryeid) {
                const [restaurant] = await sql`SELECT name FROM restaurants WHERE id = ${updatedOrder.firmaid}`;
                const restaurantName = restaurant ? restaurant.name : `Restoran #${updatedOrder.firmaid}`;
                
                // Get courier name for socket event
                const [courier] = await sql`SELECT name FROM couriers WHERE id = ${updatedOrder.kuryeid}`;
                const courierName = courier ? courier.name : `Kurye #${updatedOrder.kuryeid}`;
                
                const { sendOrderApprovedNotification } = require('../services/pushNotificationService');
                try {
                    const notificationResult = await sendOrderApprovedNotification({
                        courierId: updatedOrder.kuryeid,
                        orderId: orderId,
                        restaurantName: restaurantName,
                        paymentMethod: 'Online/hediye çeki'
                    });
                    console.log(`🔔 Order approved notification sent to courier ${updatedOrder.kuryeid}: ${notificationResult.success ? 'success' : 'failed'}`);
                } catch (notificationError) {
                    console.error('❌ Error sending order approved notification:', notificationError);
                    // Don't fail the approval if notification fails
                }
                
                // Emit socket events for real-time UI updates
                if (req.io) {
                    // Send to restaurant
                    req.io.to(`restaurant_${updatedOrder.firmaid}`).emit('orderDelivered', {
                        orderId: orderId.toString(),
                        courierName: courierName,
                        paymentMethod: updatedOrder.odeme_yontemi,
                        message: `Sipariş #${orderId} otomatik onaylandı (online/hediye çeki)`,
                        timestamp: Date.now()
                    });
                    console.log(`🔄 Order auto-approval event sent to restaurant ${updatedOrder.firmaid} - Order ${orderId} auto-approved`);
                    
                    // Send to all couriers
                    req.io.to('couriers').emit('orderStatusUpdate', {
                        orderId: orderId.toString(),
                        status: 'teslim edildi',
                        courierName: courierName,
                        message: `Sipariş #${orderId} otomatik onaylandı (online/hediye çeki)`,
                        timestamp: Date.now()
                    });
                    console.log(`🔄 Order auto-approval status update sent to all couriers - Order ${orderId} auto-approved`);
                }
            }

            return res.json({ 
                success: true, 
                data: updatedOrder,
                message: 'Online/hediye çeki ödemeli sipariş otomatik onaylandı'
            });
        }

        // Nakit veya kredi kartı ödemeleri için normal onay süreci
        
        const [updatedOrder] = await sql`
            UPDATE orders 
            SET 
                status = 'teslim edildi',
                approved_at = NOW(),
                updated_at = NOW()
            WHERE id = ${orderId} AND status = 'onay bekliyor'
            RETURNING 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
        `;

        if (!updatedOrder) {
            return res.status(400).json({ 
                success: false, 
                message: 'Sipariş onaylanamadı. Sipariş durumu uygun değil.' 
            });
        }

        // Send approval notification to courier
        if (updatedOrder.kuryeid) {
            const [restaurant] = await sql`SELECT name FROM restaurants WHERE id = ${updatedOrder.firmaid}`;
            const restaurantName = restaurant ? restaurant.name : `Restoran #${updatedOrder.firmaid}`;
            
            const { sendOrderApprovedNotification } = require('../services/pushNotificationService');
            try {
                const notificationResult = await sendOrderApprovedNotification({
                    courierId: updatedOrder.kuryeid,
                    orderId: orderId,
                    restaurantName: restaurantName,
                    paymentMethod: 'Nakit/kredi kartı'
                });
                console.log(`🔔 Order approved notification sent to courier ${updatedOrder.kuryeid}: ${notificationResult.success ? 'success' : 'failed'}`);
            } catch (notificationError) {
                console.error('❌ Error sending order approved notification:', notificationError);
                // Don't fail the approval if notification fails
            }

            // Get courier name for socket event
            const [courier] = await sql`SELECT name FROM couriers WHERE id = ${updatedOrder.kuryeid}`;
            const courierName = courier ? courier.name : `Kurye #${updatedOrder.kuryeid}`;

            // Emit socket event for real-time restaurant UI update
            if (req.io) {
                req.io.to(`restaurant_${updatedOrder.firmaid}`).emit('orderDelivered', {
                    orderId: orderId.toString(),
                    courierName: courierName,
                    paymentMethod: updatedOrder.odeme_yontemi,
                    message: `Sipariş #${orderId} onaylandı ve teslim edildi`,
                    timestamp: Date.now()
                });
                console.log(`🔄 Order delivery approval event sent to restaurant ${updatedOrder.firmaid} - Order ${orderId} approved and delivered`);
                
                // Emit socket event to all couriers for real-time UI update
                req.io.to('couriers').emit('orderStatusUpdate', {
                    orderId: orderId.toString(),
                    status: 'teslim edildi',
                    courierName: courierName,
                    message: `Sipariş #${orderId} onaylandı ve teslim edildi`,
                    timestamp: Date.now()
                });
                console.log(`🔄 Order approval status update sent to all couriers - Order ${orderId} approved and delivered`);
            }
        }

        res.json({ 
            success: true, 
            data: updatedOrder,
            message: 'Sipariş başarıyla onaylandı'
        });
    } catch (error) {
        console.error("approveOrder error:", error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Get pending approval orders - minimal logging
const getPendingApprovalOrdersForCourier = async (req, res) => {
    const { courierId } = req.params;

    if (!courierId) {
        return res.status(400).json({ success: false, message: 'Kurye ID gereklidir' });
    }

    try {
        const orders = await sql`
            SELECT 
                o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                o.resim, o.status, o.kuryeid, o.preparation_time,
                o.created_at::text as created_at,
                o.updated_at::text as updated_at,
                o.accepted_at::text as accepted_at,
                o.delivered_at::text as delivered_at,
                o.approved_at::text as approved_at,
                o.courier_price, o.restaurant_price,
                r.name as restaurant_name, 
                r.latitude as restaurant_lat, 
                r.longitude as restaurant_lng,
                CASE 
                    WHEN o.accepted_at IS NOT NULL AND o.delivered_at IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60
                    ELSE NULL
                END as delivery_time_minutes
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            WHERE o.kuryeid = ${courierId} AND o.status = 'onay bekliyor'
            ORDER BY o.created_at DESC
        `;

        res.json({ success: true, data: orders });
    } catch (error) {
        console.error('Onay bekleyen siparişler alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Restoran için onay bekleyen siparişleri getir
const getPendingApprovalOrdersForRestaurant = async (req, res) => {
    const { restaurantId } = req.params;

    if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Restoran ID gereklidir' });
    }

    try {
        // Online ve hediye çeki ödemelerini filtrele
        const orders = await sql`
            SELECT 
                o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                o.resim, o.status, o.kuryeid, o.preparation_time,
                o.created_at::text as created_at,
                o.updated_at::text as updated_at,
                o.accepted_at::text as accepted_at,
                o.delivered_at::text as delivered_at,
                o.approved_at::text as approved_at,
                o.courier_price, o.restaurant_price,
                c.name as courier_name, 
                c.phone as courier_phone
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE o.firmaid = ${restaurantId} 
            AND o.status = 'onay bekliyor'
            AND LOWER(o.odeme_yontemi) NOT IN ('online', 'hediye çeki', 'hediye ceki')
            AND LOWER(o.odeme_yontemi) NOT LIKE '%hediye%'
            ORDER BY o.created_at DESC
        `;

        // Online ve hediye çeki ödemelerini otomatik onayla
        await sql`
            UPDATE orders
            SET 
                status = 'teslim edildi',
                updated_at = NOW()
            WHERE firmaid = ${restaurantId}
            AND status = 'onay bekliyor'
            AND (
                LOWER(odeme_yontemi) IN ('online', 'hediye çeki', 'hediye ceki')
                OR LOWER(odeme_yontemi) LIKE '%hediye%'
            )
        `;

        res.json({ success: true, data: orders });
    } catch (error) {
        console.error('Restoran için onay bekleyen siparişler alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Sipariş güncelleme fonksiyonu (restoran tarafından)
const updateOrder = async (req, res) => {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;

    try {
        // Önce siparişi bul ve yetki kontrolü yap
        const [existingOrder] = await sql`
            SELECT 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
            FROM orders WHERE id = ${orderId}
        `;

        if (!existingOrder) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Sadece sipariş sahibi restoran güncelleyebilir
        if (role !== 'admin' && (role === 'restaurant' && existingOrder.firmaid !== userId)) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        // Kurye tarafından kabul edilmiş siparişler güncellenemez
        if (existingOrder.status !== 'bekleniyor') {
            return res.status(400).json({ 
                success: false, 
                message: 'Sadece beklemede olan siparişler güncellenebilir' 
            });
        }

        const {
            mahalle,
            neighborhoodId,
            deliveryPrice,
            restaurantPrice,
            odemeYontemi,
            nakitTutari,
            bankaTutari,
            hediyeTutari,
            toplamTutar,
            preparationTime,
            resim
        } = req.body;

        // Resim güncelleme işlemi
        let newImageUrl = existingOrder.resim;
        
        // Yeni resim yüklendiyse
        if (req.file) {
            const filename = req.file.filename;
            const filePath = path.join(__dirname, '../../uploads/orders', filename);
            
            // Yeni resmin varlığını kontrol et
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({
                    success: false,
                    message: 'Yeni resim yüklenirken hata oluştu'
                });
            }
            
            newImageUrl = `/uploads/orders/${filename}`;
            
            // Eski resmi sil (varsa)
            if (existingOrder.resim) {
                try {
                    const oldFilename = existingOrder.resim.split('/').pop();
                    const oldImagePath = path.join(__dirname, '../../uploads/orders', oldFilename);
                    
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`📷 Eski resim dosyası silindi: ${oldFilename}`);
                        }
                    }
                } catch (imageError) {
                    console.error('❌ Eski resim dosyası silinemedi:', imageError);
                }
            }
        } else if (resim !== undefined) {
            // Frontend'den gelen resim URL'sini kullan (null olabilir)
            newImageUrl = resim;
            
            // Eğer resim kaldırıldıysa ve eski resim varsa, eski resmi sil
            if (!resim && existingOrder.resim) {
                try {
                    const oldFilename = existingOrder.resim.split('/').pop();
                    const oldImagePath = path.join(__dirname, '../../uploads/orders', oldFilename);
                    
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`📷 Eski resim dosyası silindi: ${oldFilename}`);
                        }
                    }
                } catch (imageError) {
                    console.error('❌ Eski resim dosyası silinemedi:', imageError);
                }
            }
        }

        

        // Siparişi güncelle
        const [updatedOrder] = await sql`
            UPDATE orders 
            SET 
                mahalle = COALESCE(${mahalle}, mahalle),
                odeme_yontemi = COALESCE(${odemeYontemi}, odeme_yontemi),
                courier_price = COALESCE(${deliveryPrice}, courier_price),
                restaurant_price = COALESCE(${restaurantPrice}, restaurant_price),
                nakit_tutari = COALESCE(${nakitTutari}, nakit_tutari),
                banka_tutari = COALESCE(${bankaTutari}, banka_tutari),
                hediye_tutari = COALESCE(${hediyeTutari}, hediye_tutari),
                preparation_time = COALESCE(${preparationTime}, preparation_time),
                resim = ${newImageUrl},
                updated_at = NOW()
            WHERE id = ${orderId}
            RETURNING 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
        `;

        // Socket ile güncelleme bildirimini gönder
        if (req.io) {
            req.io.emit('orderUpdated', updatedOrder);
        }

        res.status(200).json({
            success: true,
            message: 'Sipariş başarıyla güncellendi',
            data: updatedOrder
        });

    } catch (error) {
        // Hata durumunda yeni yüklenen resmi temizle
        if (req.file) {
            try {
                const filePath = path.join(__dirname, '../../uploads/orders', req.file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (cleanupError) {
                console.error('Resim temizleme hatası:', cleanupError);
            }
        }

        console.error('Update order error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
};

// Sipariş silme fonksiyonu
// Debug endpoint to check database state
const debugOrdersForCourier = async (req, res) => {
    const { courierId } = req.params;
    
    try {
        console.log(`🔧 DEBUG: Checking all orders for courier ${courierId}`);
        
        // Get all orders for this courier
        const allOrders = await sql`
            SELECT id, status, kuryeid, firmaid, title, created_at, accepted_at
            FROM orders 
            WHERE kuryeid = ${courierId}
            ORDER BY created_at DESC
        `;
        
        // Get all kuryede orders in system
        const allKuryedeOrders = await sql`
            SELECT id, status, kuryeid, firmaid, title, created_at
            FROM orders 
            WHERE status = 'kuryede'
            ORDER BY created_at DESC
        `;
        
        return res.json({
            success: true,
            data: {
                courierOrders: allOrders,
                allKuryedeOrders: allKuryedeOrders,
                courierOrdersCount: allOrders.length,
                allKuryedeOrdersCount: allKuryedeOrders.length
            }
        });
    } catch (error) {
        console.error('Debug orders error:', error);
        res.status(500).json({ success: false, message: 'Debug error' });
    }
};

const deleteOrder = async (req, res) => {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;

    try {
        // Önce siparişi bul ve yetki kontrolü yap
        const [order] = await sql`
            SELECT 
                id, firmaid, mahalle, neighborhood_id, odeme_yontemi, 
                nakit_tutari, banka_tutari, hediye_tutari, firma_adi, 
                resim, status, kuryeid, preparation_time,
                created_at::text as created_at,
                updated_at::text as updated_at,
                accepted_at::text as accepted_at,
                delivered_at::text as delivered_at,
                approved_at::text as approved_at,
                courier_price, restaurant_price
            FROM orders WHERE id = ${orderId}
        `;

        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Admin her siparişi silebilir, restoran sadece kendi siparişlerini silebilir
        if (role !== 'admin' && (role === 'restaurant' && order.firmaid !== userId)) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        // Eğer resim varsa dosyayı sil
        if (order.resim) {
            try {
                // URL'den dosya yolunu çıkar
                const imageUrl = order.resim;
                const filename = imageUrl.split('/').pop();
                const imagePath = path.join(__dirname, '../../uploads/orders', filename);
                
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log(`📷 Resim dosyası silindi: ${filename}`);
                }
            } catch (imageError) {
                console.error('❌ Resim dosyası silinemedi:', imageError);
            }
        }

        // Siparişi sil
        await sql`DELETE FROM orders WHERE id = ${orderId}`;

        // Sipariş silindiğinde reminder tracking'ten kaldır
        removeOrderFromReminderTracking(orderId);

        // Socket ile silme bildirimini gönder
        if (req.io) {
            // Restoran bilgilerini al
            const [restaurant] = await sql`SELECT name FROM restaurants WHERE id = ${order.firmaid}`;
            const restaurantName = restaurant ? restaurant.name : `Restoran #${order.firmaid}`;
            
            // Sipariş "kuryede" veya "onay bekliyor" durumundaysa ve kuryeid varsa o kuryeye özel bildirim gönder
            if ((order.status === 'kuryede' || order.status === 'onay bekliyor') && order.kuryeid) {
                console.log(`🗑️ Sipariş #${orderId} "${order.status}" durumunda silindi - kurye ${order.kuryeid}'ye bildirim gönderiliyor`);
                
                // Kurye bilgilerini al
                const [courier] = await sql`SELECT name, phone FROM couriers WHERE id = ${order.kuryeid}`;
                const courierName = courier ? courier.name : `Kurye #${order.kuryeid}`;
                
                // Send push notification to courier about order cancellation
                const { sendOrderCancelledNotification } = require('../services/pushNotificationService');
                try {
                    const notificationResult = await sendOrderCancelledNotification({
                        courierId: order.kuryeid,
                        orderId: orderId,
                        restaurantName: restaurantName,
                        courierName: courierName
                    });
                    console.log(`🔔 Order cancelled notification sent to courier ${order.kuryeid}: ${notificationResult.success ? 'success' : 'failed'}`);
                } catch (notificationError) {
                    console.error('❌ Error sending order cancelled notification:', notificationError);
                    // Don't fail the order deletion if notification fails
                }
            }
            
            // HER DURUMDA tüm kuryelere sipariş silindi bildirimini gönder
            req.io.to('couriers').emit('orderDeleted', {
                orderId: orderId.toString(),
                restaurantName: restaurantName,
                message: `Sipariş #${orderId} "${restaurantName}" tarafından silindi`,
                status: order.status,
                firmaid: order.firmaid,
                timestamp: Date.now()
            });
            console.log(`🔄 Order deletion signal sent to ALL couriers for order #${orderId} (status: ${order.status})`);
        }

        // Also emit to restaurant room for their UI update
        if (req.io) {
            req.io.to(`restaurant_${order.firmaid}`).emit('orderDeleted', {
                orderId: orderId.toString(),
                message: 'Sipariş silindi',
                timestamp: Date.now()
            });
        }

        res.status(200).json({ 
            success: true, 
            message: `Sipariş #${orderId} başarıyla silindi` 
        });
    } catch (error) {
        console.error(`Sipariş #${orderId} silinirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kuryenin tercihlerine göre mevcut siparişleri getir
const getOrdersForCourierWithPreferences = async (req, res) => {
    const { courierId } = req.params;
    
    try {
        // Kuryenin tercihlerini kontrol et
        const [courier] = await sql`
            SELECT notification_mode FROM couriers WHERE id = ${courierId}
        `;
        
        if (!courier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }

        let orders = [];
        
        if (courier.notification_mode === 'all_restaurants') {
            // Tüm restoranların siparişlerini göster
            orders = await sql`
                SELECT 
                    o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                    o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                    o.resim, o.status, o.kuryeid, o.preparation_time,
                    o.created_at::text as created_at,
                    o.updated_at::text as updated_at,
                    o.accepted_at::text as accepted_at,
                    o.delivered_at::text as delivered_at,
                    o.approved_at::text as approved_at,
                    o.courier_price, o.restaurant_price,
                    r.name as restaurant_name,
                    CASE 
                        WHEN o.accepted_at IS NOT NULL AND o.delivered_at IS NOT NULL THEN
                            EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60
                        ELSE NULL
                    END as delivery_time_minutes
                FROM orders o
                LEFT JOIN restaurants r ON o.firmaid = r.id
                WHERE o.status = 'bekleniyor'
                ORDER BY o.created_at DESC
            `;
        } else {
            // Sadece seçili restoranların siparişlerini göster
            orders = await sql`
                SELECT 
                    o.id, o.firmaid, o.mahalle, o.neighborhood_id, o.odeme_yontemi, 
                    o.nakit_tutari, o.banka_tutari, o.hediye_tutari, o.firma_adi, 
                    o.resim, o.status, o.kuryeid, o.preparation_time,
                    o.created_at::text as created_at,
                    o.updated_at::text as updated_at,
                    o.accepted_at::text as accepted_at,
                    o.delivered_at::text as delivered_at,
                    o.approved_at::text as approved_at,
                    o.courier_price, o.restaurant_price,
                    r.name as restaurant_name,
                    CASE 
                        WHEN o.accepted_at IS NOT NULL AND o.delivered_at IS NOT NULL THEN
                            EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60
                        ELSE NULL
                    END as delivery_time_minutes
                FROM orders o
                LEFT JOIN restaurants r ON o.firmaid = r.id
                INNER JOIN courier_restaurant_preferences crp 
                    ON o.firmaid = crp.restaurant_id 
                    AND crp.courier_id = ${courierId} 
                    AND crp.is_selected = true
                WHERE o.status = 'bekleniyor'
                ORDER BY o.created_at DESC
            `;
        }

        // Ayrıca restoran tercihleri de kontrol et (iki yönlü filtreleme)
        const filteredOrders = [];
        for (const order of orders) {
            const [restaurant] = await sql`
                SELECT courier_visibility_mode FROM restaurants WHERE id = ${order.firmaid}
            `;
            
            if (!restaurant) continue;
            
            if (restaurant.courier_visibility_mode === 'all_couriers') {
                // Restoran tüm kuryeleri görmeye ayarlı
                filteredOrders.push(order);
            } else {
                // Restoran seçili kuryeler modunda - bu kuryenin seçili olup olmadığını kontrol et
                const isSelected = await sql`
                    SELECT 1 FROM restaurant_courier_preferences 
                    WHERE restaurant_id = ${order.firmaid} 
                    AND courier_id = ${courierId} 
                    AND is_selected = true
                `;
                
                if (isSelected.length > 0) {
                    filteredOrders.push(order);
                }
            }
        }
        
        res.json({ 
            success: true, 
            data: filteredOrders,
            message: `${filteredOrders.length} sipariş bulundu`
        });
        
    } catch (error) {
        console.error(`❌ Kurye ${courierId} için siparişler alınırken hata:`, error);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası',
            error: error.message 
        });
    }
};

module.exports = {
    getOrdersByStatus,
    addOrder,
    updateOrderStatus,
    assignCourier,
    getActiveOrdersForCourier,
    getOrdersForRestaurant,
    acceptOrders,
    deliverOrder,
    cancelOrder,
    approveOrder,
    getPendingApprovalOrdersForCourier,
    getPendingApprovalOrdersForRestaurant,
    deleteOrder,
    updateOrder,
    debugOrdersForCourier,
    getOrdersForCourierWithPreferences,
};