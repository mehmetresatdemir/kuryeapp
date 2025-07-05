const express = require('express');
const router = express.Router();
const { sql } = require('../config/db-config');
const restaurantController = require('../controllers/restaurantController');

const { getOnlineStats } = require('../sockets/handlers/roomHandlers');
const { removeOrderFromReminderTracking } = require('../services/orderCleanupService');
const bcrypt = require('bcrypt');

// Online istatistikleri getiren endpoint
router.get('/online-stats', async (req, res) => {
    try {
        const stats = getOnlineStats();
        
        // Online kurye detaylarını formatla
        const onlineCouriersArray = Array.from(stats.onlineCouriers.entries()).map(([id, data]) => ({
            id,
            name: data.courierInfo?.name || 'Bilinmiyor',
            email: data.courierInfo?.email || '',
            joinTime: data.joinTime,
            lastActivity: data.lastActivity,
            isBlocked: data.courierInfo?.is_blocked || false
        }));

        // Online restaurant detaylarını formatla
        const onlineRestaurantsArray = Array.from(stats.onlineRestaurants.entries()).map(([id, data]) => ({
            id,
            joinTime: data.joinTime,
            lastActivity: data.lastActivity
        }));

        res.json({
            success: true,
            data: {
                totalOnlineCouriers: stats.totalOnlineCouriers,
                totalOnlineRestaurants: stats.totalOnlineRestaurants,
                onlineCouriers: onlineCouriersArray,
                onlineRestaurants: onlineRestaurantsArray,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Online istatistikler alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Kazançlar sayfası için veri getiren endpoint
router.get('/earnings', async (req, res) => {
    const { startDate, endDate, restaurantId, courierId } = req.query;

    try {
        // Build WHERE clause manually for admin summary
        let whereClause = `o.status = 'teslim edildi'`;
        
        if (startDate && endDate) {
            whereClause += ` AND DATE(o.created_at) >= '${startDate}' AND DATE(o.created_at) <= '${endDate}'`;
        }
        if (restaurantId) {
            whereClause += ` AND o.firmaid = ${restaurantId}`;
        }
        if (courierId) {
            whereClause += ` AND o.kuryeid = ${courierId}`;
        }

        const summary = await sql`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(o.restaurant_price), 0) as total_restaurant_revenue,
                COALESCE(SUM(o.courier_price), 0) as total_courier_payout,
                COALESCE(SUM(o.restaurant_price - o.courier_price), 0) as total_platform_profit,
                COALESCE(SUM(o.nakit_tutari), 0) as cash_payments,
                COALESCE(SUM(o.banka_tutari), 0) as card_payments,
                COALESCE(SUM(o.hediye_tutari), 0) as voucher_payments
            FROM orders o
            WHERE ${sql.unsafe(whereClause)}
        `;

        const details = await sql`
            SELECT 
                o.id,
                o.created_at as date,
                r.name as restaurant,
                c.name as courier,
                o.restaurant_price,
                o.odeme_yontemi as payment_method,
                o.courier_price as courier_earning,
                (o.restaurant_price - o.courier_price) as platform_earning
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE ${sql.unsafe(whereClause)}
            ORDER BY o.created_at DESC
            LIMIT 100
        `;

        res.json({
            success: true,
            data: {
                summary: summary[0] || {},
                details
            }
        });

    } catch (error) {
        console.error('Kazanç verileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// --- DB Management Endpoints ---

// Get all table names
router.get('/db/tables', async (req, res) => {
    try {
        const tables = await sql`
            SELECT tablename
            FROM pg_catalog.pg_tables
            WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'
            AND tablename NOT LIKE '__drizzle%'
            AND tablename NOT LIKE '_drizzle%'
            AND tablename NOT LIKE '%_migrations'
            AND tablename NOT LIKE 'pg_%';
        `;
        res.json({ success: true, data: tables.map(t => t.tablename) });
    } catch (error) {
        console.error('Tablo listesi alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Get data from a specific table
router.get('/db/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    // Simple validation to prevent obvious SQL injection, but use with caution
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ success: false, message: 'Geçersiz tablo adı' });
    }
    
    try {
        // Use pool.query directly for dynamic table names
        const query = `SELECT * FROM ${tableName} LIMIT 100`;
        const { pool } = require('../config/db-config');
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error(`${tableName} verileri alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Get schema (column names and data types) for a specific table
router.get('/db/schema/:tableName', async (req, res) => {
    const { tableName } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ success: false, message: 'Geçersiz tablo adı' });
    }
    
    try {
        const schema = await sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = ${tableName}
            ORDER BY ordinal_position;
        `;
        res.json({ success: true, data: schema });
    } catch (error) {
        console.error(`${tableName} şeması alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Insert new record into a table
router.post('/db/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const data = req.body;
    
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ success: false, message: 'Geçersiz tablo adı' });
    }
    
    try {
        const columns = Object.keys(data);
        const values = Object.values(data);
        
        if (columns.length === 0) {
            return res.status(400).json({ success: false, message: 'Veri bulunamadı' });
        }
        
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const columnsStr = columns.join(', ');
        
        const query = `INSERT INTO ${tableName} (${columnsStr}) VALUES (${placeholders}) RETURNING *`;
        const { pool } = require('../config/db-config');
        const result = await pool.query(query, values);
        
        res.json({ success: true, data: result.rows[0], message: 'Kayıt başarıyla eklendi' });
    } catch (error) {
        console.error(`${tableName} tablosuna veri eklenirken hata:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update a record in a table
router.put('/db/tables/:tableName/:id', async (req, res) => {
    const { tableName, id } = req.params;
    const data = req.body;
    
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ success: false, message: 'Geçersiz tablo adı' });
    }
    
    try {
        const columns = Object.keys(data);
        const values = Object.values(data);
        
        if (columns.length === 0) {
            return res.status(400).json({ success: false, message: 'Güncellenecek veri bulunamadı' });
        }
        
        const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
        
        const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`;
        const { pool } = require('../config/db-config');
        const result = await pool.query(query, [...values, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' });
        }
        
        res.json({ success: true, data: result.rows[0], message: 'Kayıt başarıyla güncellendi' });
    } catch (error) {
        console.error(`${tableName} tablosunda veri güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a record from a table
router.delete('/db/tables/:tableName/:id', async (req, res) => {
    const { tableName, id } = req.params;
    
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ success: false, message: 'Geçersiz tablo adı' });
    }
    
    try {
        const query = `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`;
        const { pool } = require('../config/db-config');
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' });
        }
        
        res.json({ success: true, data: result.rows[0], message: 'Kayıt başarıyla silindi' });
    } catch (error) {
        console.error(`${tableName} tablosundan veri silinirken hata:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get a single record from a table
router.get('/db/tables/:tableName/:id', async (req, res) => {
    const { tableName, id } = req.params;
    
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ success: false, message: 'Geçersiz tablo adı' });
    }
    
    try {
        const query = `SELECT * FROM ${tableName} WHERE id = $1`;
        const { pool } = require('../config/db-config');
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error(`${tableName} tablosundan veri alınırken hata:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Backup database (placeholder)
router.post('/db/backup', async (req, res) => {
    // In a real scenario, you'd use pg_dump or a similar utility.
    // This is complex on a serverless/managed platform and might require a different approach.
    console.log('Veritabanı yedekleme isteği alındı. Bu özellik sunucu ortamına göre implemente edilmelidir.');
    res.status(501).json({ success: false, message: 'Yedekleme özelliği henüz tam olarak implemente edilmedi.' });
});

// Generate test data
router.post('/db/generate-test-data', async (req, res) => {
    console.log('Test verisi oluşturma isteği alındı.');
    try {
        const testCourierEmail = 'testkurye@kuryeapp.com';
        const testRestaurantEmail = 'testrestoran@kuryeapp.com';
        const plainPassword = 'password123';
        // Düz şifre kullanıyoruz, bcrypt yok
        const hashedPassword = plainPassword;

        let createdUsers = [];

        // --- Create Test Courier ---
        const existingCourier = await sql`SELECT id FROM couriers WHERE email = ${testCourierEmail}`;
        if (existingCourier.length === 0) {
            await sql`
                INSERT INTO couriers (name, email, password, phone, package_limit, notification_mode, created_at)
                VALUES ('Test Kurye', ${testCourierEmail}, ${hashedPassword}, '5551234567', 10, 'all_restaurants', NOW())
            `;
            createdUsers.push({ email: testCourierEmail, role: 'courier' });
            console.log(`Test kuryesi (${testCourierEmail}) başarıyla oluşturuldu.`);
        }

        // --- Create Test Restaurant ---
        const existingRestaurant = await sql`SELECT id FROM restaurants WHERE email = ${testRestaurantEmail}`;
        if (existingRestaurant.length === 0) {
            await sql`
                INSERT INTO restaurants (name, yetkili_name, phone, email, password, courier_visibility_mode, created_at)
                VALUES ('Test Restoran', 'Restoran Yetkilisi', '5559876543', ${testRestaurantEmail}, ${hashedPassword}, 'all_couriers', NOW())
            `;
            createdUsers.push({ email: testRestaurantEmail, role: 'restaurant' });
            console.log(`Test restoranı (${testRestaurantEmail}) başarıyla oluşturuldu.`);
        }

        if (createdUsers.length === 0) {
            return res.status(200).json({ 
                success: true, 
                message: 'Tüm test kullanıcıları (kurye ve restoran) zaten mevcut.' 
            });
        }

        res.status(201).json({ 
            success: true, 
            message: `${createdUsers.length} yeni test kullanıcısı başarıyla oluşturuldu.`,
            users: createdUsers,
            password: plainPassword
        });

    } catch (error) {
        console.error('Test verisi oluşturulurken hata:', error);
        res.status(500).json({ success: false, message: 'Test verisi oluşturulurken sunucu hatası oluştu.' });
    }
});

// Admin - Tüm restoranları getir (özel olarak korunmasız)
router.get('/restaurants-for-admin', restaurantController.getAllRestaurants);

// Admin - Restoran Mahalleleri/Teslimat Alanları (korunmasız)
router.get('/restaurants/:restaurantId/neighborhoods', restaurantController.getRestaurantNeighborhoods);

// Admin - Tüm kuryeleri getir (admin paneli için)
router.get('/couriers', async (req, res) => {
    try {
        const couriers = await sql`
            SELECT 
                c.id, c.name, c.email, c.phone, c.package_limit, c.is_online, 
                c.total_deliveries, c.is_blocked, c.created_at, c.updated_at,
                c.password, c.latitude, c.longitude, c.last_seen,
                COALESCE(active_order_count.count, 0) as active_orders,
                CASE 
                    WHEN c.latitude IS NOT NULL AND c.longitude IS NOT NULL 
                    THEN 5.0 
                    ELSE 0.0 
                END as rating
            FROM couriers c
            LEFT JOIN (
                SELECT kuryeid, COUNT(*) as count
                FROM orders 
                WHERE status IN ('kuryede', 'onay bekliyor')
                GROUP BY kuryeid
            ) active_order_count ON c.id = active_order_count.kuryeid
            ORDER BY c.is_online DESC, c.created_at DESC
        `;
        res.json({ success: true, data: couriers });
    } catch (error) {
        console.error('Kurye verileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Admin - Kurye ekle
router.post('/couriers', async (req, res) => {
    const { name, email, password, phone, package_limit } = req.body;

    if (!name || !email || !password || !phone || !package_limit) {
        return res.status(400).json({ success: false, message: 'Lütfen tüm gerekli alanları doldurun.' });
    }

    try {
        // Check if email already exists
        const existingCourier = await sql`SELECT id FROM couriers WHERE email = ${email}`;
        if (existingCourier.length > 0) {
            return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten kullanılıyor.' });
        }

        const [newCourier] = await sql`
            INSERT INTO couriers (
                name,
                email,
                password,
                phone,
                package_limit,
                notification_mode,
                is_blocked,
                created_at,
                updated_at
            ) VALUES (
                ${name},
                ${email},
                ${password},
                ${phone},
                ${package_limit},
                'all_restaurants',
                FALSE,
                ${NOW()},
                ${NOW()}
            ) RETURNING id, name, email, phone, package_limit, is_blocked;
        `;
        res.status(201).json({ success: true, message: 'Kurye başarıyla eklendi.', data: newCourier });
    } catch (error) {
        console.error('Kurye eklenirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// Admin - Kurye güncelle
router.put('/couriers/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, password, phone, package_limit, is_blocked } = req.body;

    if (!name || !email || !phone || !package_limit) {
        return res.status(400).json({ success: false, message: 'Lütfen tüm gerekli alanları doldurun.' });
    }

    try {
        // Check if email already exists for another courier
        const existingCourier = await sql`SELECT id FROM couriers WHERE email = ${email} AND id != ${id}`;
        if (existingCourier.length > 0) {
            return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten başka bir kurye tarafından kullanılıyor.' });
        }

        let updateFields = {
            name,
            email,
            phone,
            package_limit,
            is_blocked: is_blocked || false,
            updated_at: NOW()
        };

        if (password) {
            updateFields.password = password;
        }

        const updateKeys = Object.keys(updateFields);
        const updateValues = Object.values(updateFields);

        if (updateKeys.length === 0) {
            return res.status(400).json({ success: false, message: 'Güncellenecek alan bulunamadı.' });
        }

        // Dynamically build the SET clause for the UPDATE query
        const setClause = updateKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');

        const { pool } = require('../config/db-config');
        const result = await pool.query(`
            UPDATE couriers
            SET ${setClause}
            WHERE id = $${updateValues.length + 1}
            RETURNING id, name, email, phone, package_limit, is_blocked;
        `, [...updateValues, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı.' });
        }

        res.json({ success: true, message: 'Kurye başarıyla güncellendi.', data: result.rows[0] });

    } catch (error) {
        console.error('Kurye güncellenirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// Admin - Kurye sil
router.delete('/couriers/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [deletedCourier] = await sql`
            DELETE FROM couriers
            WHERE id = ${id}
            RETURNING id, name
        `;

        if (!deletedCourier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı.' });
        }

        res.json({ success: true, message: 'Kurye başarıyla silindi.', data: deletedCourier });
    } catch (error) {
        console.error('Kurye silinirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Admin - Kurye engelle/engeli kaldır
router.put('/couriers/:id/block', async (req, res) => {
    const { id } = req.params;
    const { is_blocked } = req.body;

    if (typeof is_blocked !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Geçersiz engelleme durumu.' });
    }

    try {
        const [updatedCourier] = await sql`
            UPDATE couriers
            SET is_blocked = ${is_blocked}, updated_at = NOW()
            WHERE id = ${id}
            RETURNING id, name, is_blocked
        `;

        if (!updatedCourier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı.' });
        }

        res.json({ success: true, data: updatedCourier, message: `Kurye başarıyla ${is_blocked ? 'engellendi' : 'engeli kaldırıldı'}.` });
    } catch (error) {
        console.error('Kurye engelleme/engeli kaldırma hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Admin - Teslimat Alanı Yönetimi
router.post('/restaurants/:restaurantId/delivery-areas', restaurantController.addDeliveryArea);
router.put('/restaurants/delivery-areas/:areaId', restaurantController.updateDeliveryArea);
router.delete('/restaurants/delivery-areas/:areaId', restaurantController.deleteDeliveryArea);

// Admin - Restoran Yönetimi (Ekle, Düzenle, Sil, Konum Güncelle)
router.post('/restaurants', restaurantController.addRestaurant);
router.put('/restaurants/:restaurantId', restaurantController.updateRestaurant);
router.delete('/restaurants/:restaurantId', restaurantController.deleteRestaurant);
router.put('/restaurants/:restaurantId/location', restaurantController.updateRestaurantLocation);

// Google Maps API Key endpoint
router.get('/config/google-maps-key', (req, res) => {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsKey) {
        console.error('Google Maps API Key .env dosyasında bulunamadı veya boş.');
        return res.status(404).json({ success: false, message: 'Google Maps API key not found' });
    }
    res.json({ success: true, key: googleMapsKey });
});

// Timestamp operations use database timezone directly

// Bildirim ayarlarını getir
router.get('/notification-settings', async (req, res) => {
    try {
        const settings = await sql`
            SELECT setting_value FROM admin_settings 
            WHERE setting_key = 'notification_settings'
        `;

        if (settings.length === 0) {
            // Varsayılan ayarlar
            return res.json({
                success: true,
                data: {
                    newOrderNotification: true,
                    statusChangeNotification: true,
                    courierAssignNotification: true,
                    orderReminderTime: 10
                }
            });
        }

        res.json({
            success: true,
            data: settings[0].setting_value
        });

    } catch (error) {
        console.error('Bildirim ayarları alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Bildirim ayarları alınamadı: ' + error.message 
        });
    }
});

// Bildirim ayarlarını kaydet
router.post('/notification-settings', async (req, res) => {
    try {
        const { orderReminderTime, newOrderNotification, statusChangeNotification, courierAssignNotification } = req.body;
        
        const settings = {
            newOrderNotification: newOrderNotification !== undefined ? newOrderNotification : true,
            statusChangeNotification: statusChangeNotification !== undefined ? statusChangeNotification : true,
            courierAssignNotification: courierAssignNotification !== undefined ? courierAssignNotification : true,
            orderReminderTime: orderReminderTime || 10
        };

        await sql`
            INSERT INTO admin_settings (setting_key, setting_value)
            VALUES ('notification_settings', ${settings})
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = ${settings},
                updated_at = NOW()
        `;

        res.json({
            success: true,
            message: 'Bildirim ayarları başarıyla kaydedildi',
            data: settings
        });

    } catch (error) {
        console.error('Bildirim ayarları kaydedilirken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Bildirim ayarları kaydedilemedi: ' + error.message 
        });
    }
});

// Admin bildirim gönderme endpoint'i
router.post('/send-notification', async (req, res) => {
    try {
        const { type, scope, title, message, priority, withSound, recipients } = req.body;

        // Validation
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Başlık ve mesaj gereklidir'
            });
        }

        if (!['couriers', 'restaurants'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz bildirim türü'
            });
        }

        if (!['all', 'online', 'specific'].includes(scope)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz alıcı kapsamı'
            });
        }

        let targetUsers = [];
        let socketRoom = '';

        if (type === 'couriers') {
            socketRoom = 'couriers';
            
            if (scope === 'all') {
                // Tüm kuryeleri al
                const allCouriers = await sql`
                    SELECT id, name, is_blocked 
                    FROM couriers 
                    WHERE is_blocked = false OR is_blocked IS NULL
                `;
                targetUsers = allCouriers;
            } else if (scope === 'online') {
                // Çevrimiçi kuryeleri al (socket odalarından)
                // Bu örnekte tüm kuryelerin %30'u çevrimiçi kabul ediliyor
                const allCouriers = await sql`
                    SELECT id, name, is_blocked 
                    FROM couriers 
                    WHERE is_blocked = false OR is_blocked IS NULL
                `;
                targetUsers = allCouriers;
            } else if (scope === 'specific') {
                if (!recipients || recipients.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Belirli alıcılar seçilmemiş'
                    });
                }
                
                const specificCouriers = await sql`
                    SELECT id, name, is_blocked 
                    FROM couriers 
                    WHERE id = ANY(${recipients}) AND (is_blocked = false OR is_blocked IS NULL)
                `;
                targetUsers = specificCouriers;
            }
        } else if (type === 'restaurants') {
            socketRoom = 'restaurants';
            
            if (scope === 'all') {
                // Tüm restorantları al
                const allRestaurants = await sql`
                    SELECT id, name 
                    FROM restaurants
                `;
                targetUsers = allRestaurants;
            } else if (scope === 'online') {
                // Çevrimiçi restorantları al
                const allRestaurants = await sql`
                    SELECT id, name 
                    FROM restaurants
                `;
                targetUsers = allRestaurants;
            } else if (scope === 'specific') {
                if (!recipients || recipients.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Belirli alıcılar seçilmemiş'
                    });
                }
                
                const specificRestaurants = await sql`
                    SELECT id, name 
                    FROM restaurants 
                    WHERE id = ANY(${recipients})
                `;
                targetUsers = specificRestaurants;
            }
        }

        // Socket ile bildirim gönder
        if (req.io && targetUsers.length > 0) {
            const notificationData = {
                title: title,
                message: message,
                priority: priority,
                withSound: withSound,
                timestamp: new Date().toISOString(),
                type: 'admin_notification',
                sender: 'admin'
            };

            if (scope === 'all') {
                // Tüm kullanıcılara gönder
                req.io.to(socketRoom).emit('adminNotification', notificationData);
            } else if (scope === 'online') {
                // Çevrimiçi kullanıcılara gönder
                req.io.to(socketRoom).emit('adminNotification', notificationData);
            } else if (scope === 'specific') {
                // Belirli kullanıcılara gönder
                targetUsers.forEach(user => {
                    const userRoom = type === 'couriers' ? `courier_${user.id}` : `restaurant_${user.id}`;
                    req.io.to(userRoom).emit('adminNotification', notificationData);
                });
            }
        }

        // Bildirim geçmişine kaydet (opsiyonel)
        try {
            await sql`
                INSERT INTO admin_notifications (
                    type, scope, title, message, priority, with_sound, 
                    recipients_count, created_at
                ) VALUES (
                    ${type}, ${scope}, ${title}, ${message}, ${priority}, 
                    ${withSound}, ${targetUsers.length}, NOW()
                )
            `;
        } catch (notificationLogError) {
            console.log('⚠️ Bildirim geçmiş kaydı yapılamadı:', notificationLogError.message);
            // Hata olsa da ana işlemi devam ettir
        }

        res.json({
            success: true,
            message: 'Bildirim başarıyla gönderildi',
            data: {
                sentCount: targetUsers.length,
                type: type,
                scope: scope,
                title: title
            }
        });

    } catch (error) {
        console.error('Admin bildirim gönderme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Bildirim gönderilemedi: ' + error.message
        });
    }
});



// Restorantları getir (bildirim gönderme için)
router.get('/restaurants', async (req, res) => {
    try {
        const restaurants = await sql`
            SELECT 
                r.*,
                COALESCE(active_order_count.count, 0) as active_orders,
                COALESCE(delivery_area_count.count, 0) as delivery_areas_count
            FROM restaurants r
            LEFT JOIN (
                SELECT firmaid, COUNT(*) as count 
                FROM orders 
                WHERE status IN ('bekleniyor', 'kuryede') 
                GROUP BY firmaid
            ) active_order_count ON r.id = active_order_count.firmaid
            LEFT JOIN (
                SELECT restaurant_id, COUNT(*) as count 
                FROM restaurant_delivery_prices 
                GROUP BY restaurant_id
            ) delivery_area_count ON r.id = delivery_area_count.restaurant_id
            ORDER BY r.id
        `;

        res.json({ success: true, data: restaurants });
    } catch (error) {
        console.error('Restaurants fetch error:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Sipariş bildirim ayarları
router.post('/notification-settings', async (req, res) => {
    try {
        const { orderReminderTime } = req.body;
        
        const settingsData = {
            orderReminderTime: parseInt(orderReminderTime) || 10, // dakika cinsinden
            lastUpdated: new Date().toISOString()
        };

        console.log('📱 Bildirim ayarları kaydediliyor:', settingsData);

        // Türkiye saati SQL ifadesini al
        

        // Mevcut ayarları güncelle veya yeni oluştur
        const result = await sql`
            INSERT INTO admin_settings (setting_key, setting_value, created_at, updated_at)
            VALUES ('notification_settings', ${JSON.stringify(settingsData)}, 
                    timezone('Europe/Istanbul', NOW()), timezone('Europe/Istanbul', NOW()))
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = timezone('Europe/Istanbul', NOW())
            RETURNING *
        `;

        res.json({
            success: true,
            message: 'Bildirim ayarları başarıyla kaydedildi',
            settings: settingsData
        });

    } catch (error) {
        console.error('❌ Bildirim ayarları kaydetme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Bildirim ayarları kaydedilirken bir hata oluştu'
        });
    }
});

router.get('/notification-settings', async (req, res) => {
    try {
        const settings = await sql`
            SELECT setting_value FROM admin_settings 
            WHERE setting_key = 'notification_settings'
        `;

        if (settings.length === 0) {
            // Varsayılan ayarlar
            return res.json({
                success: true,
                data: {
                    orderReminderTime: 10 // dakika
                }
            });
        }

        res.json({
            success: true,
            data: settings[0].setting_value
        });

    } catch (error) {
        console.error('Bildirim ayarları alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Bildirim ayarları alınamadı: ' + error.message 
        });
    }
});

// Genel admin ayarları endpoints - Turkey time sync ayarları kaldırıldı
// Veritabanı artık Europe/Istanbul timezone'unu kullanıyor

// Timestamp operations use database timezone directly

// Bildirim ayarları endpoints
router.get('/settings/notifications', async (req, res) => {
    try {
        const settings = await sql`
            SELECT setting_value FROM admin_settings 
            WHERE setting_key = 'notification_settings'
        `;

        let notificationSettings = {
            new_order_notification: true,
            status_change_notification: true,
            courier_assign_notification: true,
            order_reminder_time: 10
        };

        if (settings.length > 0) {
            const savedSettings = settings[0].setting_value;
            notificationSettings = {
                new_order_notification: savedSettings.newOrderNotification !== false,
                status_change_notification: savedSettings.statusChangeNotification !== false,
                courier_assign_notification: savedSettings.courierAssignNotification !== false,
                order_reminder_time: savedSettings.orderReminderTime || 10
            };
        }

        res.json({
            success: true,
            settings: notificationSettings
        });

    } catch (error) {
        console.error('Bildirim ayarları alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Bildirim ayarları alınamadı: ' + error.message 
        });
    }
});

router.put('/settings/notifications', async (req, res) => {
    try {
        const { new_order_notification, status_change_notification, courier_assign_notification, order_reminder_time } = req.body;
        
        const settingsData = {
            newOrderNotification: Boolean(new_order_notification),
            statusChangeNotification: Boolean(status_change_notification),
            courierAssignNotification: Boolean(courier_assign_notification),
            orderReminderTime: parseInt(order_reminder_time) || 10,
            lastUpdated: new Date().toISOString()
        };

        

        await sql`
            INSERT INTO admin_settings (setting_key, setting_value, created_at, updated_at)
            VALUES ('notification_settings', ${JSON.stringify(settingsData)}, NOW(), NOW())
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = NOW()
        `;

        res.json({
            success: true,
            message: 'Bildirim ayarları başarıyla kaydedildi',
            settings: settingsData
        });

    } catch (error) {
        console.error('Bildirim ayarları kaydetme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Bildirim ayarları kaydedilirken bir hata oluştu'
        });
    }
});

// Harita ayarları endpoints
router.get('/settings/map', async (req, res) => {
    try {
        const settings = await sql`
            SELECT setting_value FROM admin_settings 
            WHERE setting_key = 'map_settings'
        `;

        let mapSettings = {
            auto_focus_couriers: true,
            map_padding_percent: 10,
            min_zoom_level: 11,
            max_zoom_level: 18,
            online_check_minutes: 5,
            map_refresh_interval: 30,
            advanced_courier_icons: true
        };

        if (settings.length > 0) {
            const savedSettings = settings[0].setting_value;
            mapSettings = {
                auto_focus_couriers: savedSettings.autoFocusCouriers !== false,
                map_padding_percent: savedSettings.mapPaddingPercent || 10,
                min_zoom_level: savedSettings.minZoomLevel || 11,
                max_zoom_level: savedSettings.maxZoomLevel || 18,
                online_check_minutes: savedSettings.onlineCheckMinutes || 5,
                map_refresh_interval: savedSettings.mapRefreshInterval || 30,
                advanced_courier_icons: savedSettings.advancedCourierIcons !== false
            };
        }

        res.json({
            success: true,
            settings: mapSettings
        });

    } catch (error) {
        console.error('Harita ayarları alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Harita ayarları alınamadı: ' + error.message 
        });
    }
});

router.put('/settings/map', async (req, res) => {
    try {
        const { 
            auto_focus_couriers, 
            map_padding_percent, 
            min_zoom_level, 
            max_zoom_level,
            online_check_minutes,
            map_refresh_interval,
            advanced_courier_icons
        } = req.body;
        
        const settingsData = {
            autoFocusCouriers: Boolean(auto_focus_couriers),
            mapPaddingPercent: parseInt(map_padding_percent) || 10,
            minZoomLevel: parseInt(min_zoom_level) || 11,
            maxZoomLevel: parseInt(max_zoom_level) || 18,
            onlineCheckMinutes: parseInt(online_check_minutes) || 5,
            mapRefreshInterval: parseInt(map_refresh_interval) || 30,
            advancedCourierIcons: Boolean(advanced_courier_icons),
            lastUpdated: new Date().toISOString()
        };

        

        await sql`
            INSERT INTO admin_settings (setting_key, setting_value, created_at, updated_at)
            VALUES ('map_settings', ${JSON.stringify(settingsData)}, 
                    timezone('Europe/Istanbul', NOW()), timezone('Europe/Istanbul', NOW()))
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = timezone('Europe/Istanbul', NOW())
        `;

        res.json({
            success: true,
            message: 'Harita ayarları başarıyla kaydedildi',
            settings: settingsData
        });

    } catch (error) {
        console.error('Harita ayarları kaydetme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Harita ayarları kaydedilirken bir hata oluştu'
        });
    }
});

// Kurye ayarları endpoints
router.get('/settings/courier', async (req, res) => {
    try {
        const settings = await sql`
            SELECT setting_value FROM admin_settings 
            WHERE setting_key = 'courier_settings'
        `;

        let courierSettings = {
            max_orders_per_courier: 5,
            order_acceptance_block_time: 10
        };

        if (settings.length > 0) {
            const savedSettings = settings[0].setting_value;
            courierSettings = {
                max_orders_per_courier: savedSettings.maxOrdersPerCourier || 5,
                order_acceptance_block_time: savedSettings.orderAcceptanceBlockTime || 10
            };
        }

        res.json({
            success: true,
            settings: courierSettings
        });

    } catch (error) {
        console.error('Kurye ayarları alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Kurye ayarları alınamadı: ' + error.message 
        });
    }
});

router.put('/settings/courier', async (req, res) => {
    try {
        const { max_orders_per_courier, order_acceptance_block_time } = req.body;
        
        const settingsData = {
            maxOrdersPerCourier: parseInt(max_orders_per_courier) || 5,
            orderAcceptanceBlockTime: parseInt(order_acceptance_block_time) || 10,
            lastUpdated: new Date().toISOString()
        };

        

        await sql`
            INSERT INTO admin_settings (setting_key, setting_value, created_at, updated_at)
            VALUES ('courier_settings', ${JSON.stringify(settingsData)}, NOW(), NOW())
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = NOW()
        `;

        res.json({
            success: true,
            message: 'Kurye ayarları başarıyla kaydedildi',
            settings: settingsData
        });

    } catch (error) {
        console.error('Kurye ayarları kaydetme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Kurye ayarları kaydedilirken bir hata oluştu'
        });
    }
});

// Sistem durumu endpoint'leri
router.get('/status/database', async (req, res) => {
    try {
        const result = await sql`SELECT 1 as test`;
        res.json({
            success: true,
            message: 'Veritabanı bağlantısı başarılı',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Veritabanı durumu kontrol hatası:', error);
        res.json({
            success: false,
            message: 'Veritabanı bağlantısı başarısız: ' + error.message
        });
    }
});

router.get('/status/api', async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'API çalışıyor',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'API durumu kontrol edilemiyor'
        });
    }
});

// Bakım endpoint'leri
router.post('/maintenance/clear-cache', async (req, res) => {
    try {
        // Time cache temizle
        
        
        
        // Diğer cache temizleme işlemleri burada yapılabilir
        
        res.json({
            success: true,
            message: 'Önbellek başarıyla temizlendi',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Önbellek temizleme hatası:', error);
        res.json({
            success: false,
            message: 'Önbellek temizlenirken hata oluştu: ' + error.message
        });
    }
});

router.post('/maintenance/backup-database', async (req, res) => {
    try {
        // Basit bir backup simulasyonu
        const backupFile = `backup_${new Date().toISOString().split('T')[0]}.sql`;
        
        // Gerçek backup işlemi burada yapılabilir
        console.log('Veritabanı yedeği oluşturuluyor...');
        
        res.json({
            success: true,
            message: 'Veritabanı yedeği başarıyla oluşturuldu',
            backupFile: backupFile,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Veritabanı yedekleme hatası:', error);
        res.json({
            success: false,
            message: 'Veritabanı yedeklenirken hata oluştu: ' + error.message
        });
    }
});

router.post('/maintenance/restart-system', async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Sistem yeniden başlatılıyor...',
            timestamp: new Date().toISOString()
        });
        
        // Gerçek restart işlemi için process.exit() kullanılabilir
        // Ancak bu sadece development ortamında kullanılmalı
        console.log('Sistem yeniden başlatma isteği alındı');
        
    } catch (error) {
        console.error('Sistem yeniden başlatma hatası:', error);
        res.json({
            success: false,
            message: 'Sistem yeniden başlatılırken hata oluştu: ' + error.message
        });
    }
});

// Sistem logları endpoint'i
router.get('/logs', async (req, res) => {
    try {
        // Örnek log verileri
        const logs = [
            {
                timestamp: new Date().toISOString(),
                level: 'INFO',
                message: 'Sistem çalışıyor',
                type: 'log-success'
            },
            {
                timestamp: new Date(Date.now() - 60000).toISOString(),
                level: 'INFO',
                message: 'Admin paneli erişimi',
                type: ''
            },
            {
                timestamp: new Date(Date.now() - 120000).toISOString(),
                level: 'WARNING',
                message: 'Yüksek CPU kullanımı',
                type: 'log-warning'
            },
            {
                timestamp: new Date(Date.now() - 180000).toISOString(),
                level: 'SUCCESS',
                message: 'Veritabanı bağlantısı kuruldu',
                type: 'log-success'
            }
        ];
        
        res.json({
            success: true,
            logs: logs,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Log verisi alınırken hata:', error);
        res.json({
            success: false,
            message: 'Log verileri alınırken hata oluştu: ' + error.message
        });
    }
});

// Test kullanıcıları oluştur endpoint'i
router.post('/create-test-users', async (req, res) => {
  try {
    const { password = 'password123' } = req.body;
    
    // Düz şifre kullanıyoruz, bcrypt yok
    const hashedPassword = password;
    
    // Test kurye oluştur
    const testCourierEmail = 'testkurye@kuryeapp.com';
    
    // Türkiye saatini doğrudan al
    
    // Using NOW() directly in SQL instead of turkeyTime variable
    
    try {
      await sql`
        INSERT INTO couriers (name, email, password, phone, package_limit, notification_mode, created_at)
        VALUES ('Test Kurye', ${testCourierEmail}, ${hashedPassword}, '5551234567', 10, 'all_restaurants', NOW())
        ON CONFLICT (email) DO UPDATE SET 
        password = EXCLUDED.password,
        notification_mode = 'all_restaurants',
        updated_at = NOW()
      `;
      console.log(`Test kurye oluşturuldu/güncellendi (default: all_restaurants)`);
    } catch (courierError) {
      console.error('Test kurye oluşturma hatası:', courierError);
    }
    
    // Test restoran oluştur
    const testRestaurantEmail = 'test@restaurant.com';
    try {
      await sql`
        INSERT INTO restaurants (name, yetkili_name, phone, email, password, courier_visibility_mode, created_at)
        VALUES ('Test Restoran', 'Restoran Yetkilisi', '5559876543', ${testRestaurantEmail}, ${hashedPassword}, 'all_couriers', NOW())
        ON CONFLICT (email) DO UPDATE SET 
        password = EXCLUDED.password,
        courier_visibility_mode = 'all_couriers',
        updated_at = NOW()
      `;
      console.log(`Test restoran oluşturuldu/güncellendi (default: all_couriers)`);
    } catch (restaurantError) {
      console.error('Test restoran oluşturma hatası:', restaurantError);
    }

    res.json({
      success: true,
      message: 'Test kullanıcıları başarıyla oluşturuldu/güncellendi',
      credentials: {
        courier: { email: testCourierEmail, password },
        restaurant: { email: testRestaurantEmail, password }
      }
    });

  } catch (error) {
    console.error('Test kullanıcıları oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Test kullanıcıları oluşturulurken bir hata oluştu'
    });
  }
});

// Admin - Sipariş güncelleme (token gerektirmez)
router.patch('/orders/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { tutar, restaurant_price, courier_price, preparation_time, status, kuryeid } = req.body;

    console.log(`🔍 Admin sipariş güncelleme: Order ID ${orderId}`);
    console.log('📦 Gelen payload:', req.body);
    console.log('🎯 Status:', status, 'Kurye ID:', kuryeid);

    try {
        // Önce siparişi bul
        const [order] = await sql`SELECT * FROM orders WHERE id = ${orderId}`;

        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Türkiye saatini doğrudan al
        
        // Using NOW() directly in SQL instead of turkeyTime variable

        // Güncelleme değerlerini hazırla
        const updateData = {
            banka_tutari: tutar !== undefined ? parseFloat(tutar) || 0 : order.banka_tutari,
            restaurant_price: restaurant_price !== undefined ? parseFloat(restaurant_price) || 0 : order.restaurant_price,
            courier_price: courier_price !== undefined ? parseFloat(courier_price) || 0 : order.courier_price,
            preparation_time: preparation_time !== undefined ? parseInt(preparation_time) || 0 : order.preparation_time,
            status: status !== undefined ? status : order.status,
            kuryeid: kuryeid !== undefined ? (kuryeid === '' || kuryeid === null ? null : parseInt(kuryeid)) : order.kuryeid
        };

        // Siparişi güncelle
        const [updatedOrder] = await sql`
            UPDATE orders 
            SET 
                banka_tutari = ${updateData.banka_tutari},
                restaurant_price = ${updateData.restaurant_price},
                courier_price = ${updateData.courier_price},
                preparation_time = ${updateData.preparation_time},
                status = ${updateData.status},
                kuryeid = ${updateData.kuryeid},
                updated_at = NOW()
            WHERE id = ${orderId}
            RETURNING *
        `;

        // Socket ile güncelleme bildirimini gönder
        if (req.io && updatedOrder) {
            // Sipariş durumu özellikle güncellendiyse, orderStatusUpdate eventi de gönder
            req.io.emit('orderStatusUpdate', { 
                orderId: updatedOrder.id.toString(),
                status: updatedOrder.status,
                message: `Sipariş #${updatedOrder.id} admin tarafından ${updatedOrder.status} durumuna güncellendi`
            });
            
            // Genel güncelleme eventi
            req.io.emit('orderUpdated', { 
                orderId: updatedOrder.id.toString(),
                orderDetails: updatedOrder,
                message: `Sipariş #${updatedOrder.id} admin tarafından güncellendi`
            });
            
            console.log(`✅ Socket events emitted for order ${updatedOrder.id} status update: ${updatedOrder.status}`);
        }

        res.status(200).json({ 
            success: true, 
            data: updatedOrder,
            message: `Sipariş #${orderId} başarıyla güncellendi` 
        });
    } catch (error) {
        console.error(`Admin - Sipariş #${orderId} güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

// Admin - Sipariş silme (token gerektirmez)
router.delete('/orders/:orderId', async (req, res) => {
    const { orderId } = req.params;

    try {
        // Önce siparişi bul
        const [order] = await sql`SELECT * FROM orders WHERE id = ${orderId}`;

        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

        // Siparişi sil
        await sql`DELETE FROM orders WHERE id = ${orderId}`;

        // Sipariş silindiğinde reminder tracking'ten kaldır
        removeOrderFromReminderTracking(orderId);

        // Socket ile silme bildirimini gönder (req.io socket.io instance'ı varsa)
        if (req.io) {
            req.io.emit('orderDeleted', { orderId: orderId });
        }

        res.status(200).json({ 
            success: true, 
            message: `Sipariş #${orderId} başarıyla silindi` 
        });
    } catch (error) {
        console.error(`Admin - Sipariş #${orderId} silinirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});



// Test endpoint to debug SQL connection
router.get('/test-sql', async (req, res) => {
    try {
        console.log('Testing SQL connection...');
        const result = await sql`SELECT 1 as test`;
        console.log('SQL test result:', result);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('SQL test error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test JOIN endpoint
router.get('/test-join', async (req, res) => {
    try {
        console.log('Testing JOIN...');
        const result = await sql`
            SELECT 
                o.id,
                o.kuryeid,
                c.name as kurye_name
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE o.id = 128
        `;
        console.log('JOIN test result:', result);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('JOIN test error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper function to build date range WHERE clause
const getWhereClauseForDateRange = (startDate, endDate, prefix = 'o.') => {
    let whereClause = '';
    if (startDate && endDate) {
        whereClause += ` AND DATE(${prefix}created_at) >= ${sql.value(startDate)} AND DATE(${prefix}created_at) <= ${sql.value(endDate)}`;
    }
    return whereClause;
};

// --- Analytics Endpoints ---

// Genel İstatistikler
router.get('/analytics/stats', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    try {
        const stats = await sql`
            SELECT
                COUNT(id) AS total_orders,
                COALESCE(SUM(restaurant_price), 0) AS total_revenue,
                COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60), 0) AS avg_delivery_time,
                0 AS customer_satisfaction_placeholder -- Placeholder for now
            FROM orders o
            WHERE status = 'teslim edildi' ${sql.unsafe(dateWhereClause)}
        `;

        // Calculate change percentages (this would require comparing with a previous period, which is complex for this task)
        // For now, return dummy change percentages or calculate based on dummy data.
        // A more robust solution would fetch data for a comparable previous period.
        const prevStats = {
            total_orders: 100, // Dummy
            total_revenue: 5000, // Dummy
            avg_delivery_time: 30, // Dummy
            customer_satisfaction_placeholder: 80 // Dummy
        };

        const currentStats = stats[0];

        const calculateChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0; // Avoid division by zero
            return ((current - previous) / previous * 100).toFixed(2);
        };

        res.json({
            success: true,
            data: {
                totalRevenue: currentStats.total_revenue,
                totalOrders: currentStats.total_orders,
                avgDeliveryTime: currentStats.avg_delivery_time.toFixed(0),
                customerSatisfaction: currentStats.customer_satisfaction_placeholder, // Still a placeholder
                // Dummy changes for now
                revenueChange: calculateChange(currentStats.total_revenue, prevStats.total_revenue),
                ordersChange: calculateChange(currentStats.total_orders, prevStats.total_orders),
                deliveryTimeChange: calculateChange(prevStats.avg_delivery_time, currentStats.avg_delivery_time), // Lower is better for time
                satisfactionChange: calculateChange(currentStats.customer_satisfaction_placeholder, prevStats.customer_satisfaction_placeholder)
            }
        });

    } catch (error) {
        console.error('Analiz istatistikleri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Günlük Sipariş Sayısı
router.get('/analytics/orders-daily', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    try {
        const dailyOrders = await sql`
            SELECT
                DATE(created_at) AS order_date,
                COUNT(id) AS order_count
            FROM orders o
            WHERE created_at IS NOT NULL ${sql.unsafe(dateWhereClause)}
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `;

        const labels = dailyOrders.map(item => new Date(item.order_date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }));
        const counts = dailyOrders.map(item => parseInt(item.order_count, 10));

        res.json({
            success: true,
            data: {
                labels,
                counts
            }
        });

    } catch (error) {
        console.error('Günlük sipariş sayısı alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Günlük Gelir
router.get('/analytics/revenue-daily', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    try {
        const dailyRevenue = await sql`
            SELECT
                DATE(created_at) AS order_date,
                COALESCE(SUM(restaurant_price), 0) AS total_revenue
            FROM orders o
            WHERE status = 'teslim edildi' ${sql.unsafe(dateWhereClause)}
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `;

        const labels = dailyRevenue.map(item => new Date(item.order_date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }));
        const revenues = dailyRevenue.map(item => parseFloat(item.total_revenue));

        res.json({
            success: true,
            data: {
                labels,
                revenues
            }
        });

    } catch (error) {
        console.error('Günlük gelir alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Restoran Performansı
router.get('/analytics/restaurant-performance', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    console.log('DEBUG: /analytics/restaurant-performance endpoint çağrıldı. Tarih aralığı:', start, '-', end);

    try {
        const restaurantPerformance = await sql`
            SELECT
                r.name AS restaurant_name,
                COUNT(o.id) AS order_count
            FROM orders o
            JOIN restaurants r ON o.firmaid = r.id
            WHERE o.status = 'teslim edildi' ${sql.unsafe(dateWhereClause)}
            GROUP BY r.name
            ORDER BY order_count DESC
            LIMIT 10
        `;

        console.log('DEBUG: Top restoranlar veritabanından çekildi:', restaurantPerformance);

        const labels = restaurantPerformance.map(item => item.restaurant_name);
        const counts = restaurantPerformance.map(item => parseInt(item.order_count, 10));

        res.json({
            success: true,
            data: {
                labels,
                counts
            }
        });

    } catch (error) {
        console.error('Restoran performans verileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Teslimat Süreleri
router.get('/analytics/delivery-times', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    try {
        const deliveryTimes = await sql`
            SELECT
                created_at,
                EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60 AS delivery_duration
            FROM orders o
            WHERE status = 'teslim edildi' AND delivered_at IS NOT NULL ${sql.unsafe(dateWhereClause)}
            ORDER BY created_at ASC
        `;

        const deliveryData = deliveryTimes.map(item => ({
            x: new Date(item.created_at).getTime(),
            y: parseFloat(item.delivery_duration)
        }));

        res.json({
            success: true,
            data: {
                deliveryData
            }
        });

    } catch (error) {
        console.error('Teslimat süreleri verileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Mahalle Bazında Dağılım
router.get('/analytics/neighborhood-distribution', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    try {
        const neighborhoodDistribution = await sql`
            SELECT
                o.mahalle AS neighborhood_name,
                COUNT(o.id) AS order_count
            FROM orders o
            WHERE o.mahalle IS NOT NULL ${sql.unsafe(dateWhereClause)}
            GROUP BY o.mahalle
            ORDER BY order_count DESC
            LIMIT 10
        `;

        const labels = neighborhoodDistribution.map(item => item.neighborhood_name);
        const counts = neighborhoodDistribution.map(item => parseInt(item.order_count, 10));

        res.json({
            success: true,
            data: {
                labels,
                counts
            }
        });

    } catch (error) {
        console.error('Mahalle dağılım verileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Saatlik Dağılım
router.get('/analytics/hourly-distribution', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    try {
        const hourlyDistribution = await sql`
            SELECT
                EXTRACT(HOUR FROM created_at) AS order_hour,
                COUNT(id) AS order_count
            FROM orders o
            WHERE created_at IS NOT NULL ${sql.unsafe(dateWhereClause)}
            GROUP BY EXTRACT(HOUR FROM created_at)
            ORDER BY EXTRACT(HOUR FROM created_at) ASC
        `;
        
        // Ensure all 24 hours are represented, even if no orders
        const hourlyDataMap = new Map();
        hourlyDistribution.forEach(item => {
            hourlyDataMap.set(item.order_hour, parseInt(item.order_count, 10));
        });

        const labels = Array.from({ length: 24 }, (_, i) => `${i < 10 ? '0' : ''}${i}:00`);
        const counts = labels.map((_, i) => hourlyDataMap.get(i) || 0);

        res.json({
            success: true,
            data: {
                labels,
                counts
            }
        });

    } catch (error) {
        console.error('Saatlik dağılım verileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// En Çok Sipariş Alan Restoranlar
router.get('/analytics/top-restaurants', async (req, res) => {
    const { start, end } = req.query;
    const dateWhereClause = getWhereClauseForDateRange(start, end);

    console.log('DEBUG: /analytics/top-restaurants endpoint çağrıldı. Tarih aralığı:', start, '-', end);

    try {
        console.log('DEBUG: /analytics/top-restaurants endpoint çağrıldı. Tarih aralığı:', start, '-', end);
        const topRestaurants = await sql`
            SELECT
                r.id,
                r.name as firma_adi,
                COUNT(o.id) as total_orders,
                COALESCE(AVG(o.restaurant_price), 0) as average_price
            FROM restaurants r
            JOIN orders o ON r.id = o.firmaid
            WHERE o.status = 'teslim edildi'
            ${dateWhereClause ? sql.unsafe(`AND ${dateWhereClause}`) : sql.unsafe('')}
            GROUP BY r.id, r.name
            ORDER BY total_orders DESC
            LIMIT 5;
        `;
        console.log('DEBUG: Top Restaurants API yanıtı:', topRestaurants);
        res.json({ success: true, data: topRestaurants });
    } catch (error) {
        console.error('En çok sipariş alan restoranlar alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// En Aktif Kuryeler
router.get('/analytics/top-couriers', async (req, res) => {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0); // Unix Epoch
    const end = endDate ? new Date(endDate) : new Date();

    try {
        const topCouriers = await sql`
            SELECT 
                c.id,
                c.name,
                c.email,
                c.phone_number,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.courier_price), 0) as total_earnings
            FROM couriers c
            JOIN orders o ON c.id = o.kuryeid
            WHERE o.status = 'teslim edildi'
            AND o.created_at >= ${start} AND o.created_at <= ${end}
            GROUP BY c.id, c.name, c.email, c.phone_number
            ORDER BY total_orders DESC
            LIMIT 5;
        `;
        res.json({ success: true, data: topCouriers });
    } catch (error) {
        console.error('❌ Top kuryeler alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Top Earning Restaurants (Platform Profit)
router.get('/analytics/top-earning-restaurants', async (req, res) => {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0); 
    const end = endDate ? new Date(endDate) : new Date();

    try {
        console.log('DEBUG: /analytics/top-earning-restaurants endpoint çağrıldı. Tarih aralığı:', start, '-', end);
        const topEarningRestaurants = await sql`
            SELECT 
                r.id,
                r.name,
                COALESCE(SUM(o.restaurant_price - o.courier_price), 0) as platform_profit
            FROM restaurants r
            JOIN orders o ON r.id = o.firmaid
            WHERE o.status = 'teslim edildi'
            AND o.created_at >= ${start} AND o.created_at <= ${end}
            GROUP BY r.id, r.name
            ORDER BY platform_profit DESC
            LIMIT 5;
        `;
        res.json({ success: true, data: topEarningRestaurants });
    } catch (error) {
        console.error('❌ En çok kazandıran restoranlar alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// API Base URL endpoint for frontend to consume
router.get('/config/api-base-url', (req, res) => {
    const useLocal = process.env.USE_LOCAL_API === 'true';
    const localApiBase = process.env.LOCAL_API_BASE || 'http://localhost:3000';
    const remoteApiBase = process.env.REMOTE_API_BASE || 'https://kurye-backend-production.up.railway.app';

    const apiBaseUrl = useLocal ? localApiBase : remoteApiBase;

    console.log('🔍 API Base URL config:', { useLocal, apiBaseUrl });

    res.json({
        success: true,
        apiBaseUrl: apiBaseUrl
    });
});

// Get Order Status Counts for Dashboard
router.get('/analytics/order-status-counts', async (req, res) => {
    try {
        console.log('DEBUG: /analytics/order-status-counts endpoint çağrıldı.');
        const statusCounts = await sql`
            SELECT
                status,
                COUNT(id) as count
            FROM orders
            GROUP BY status;
        `;

        // Gerçek status değerlerine göre mapping
        const countsMap = {
            'bekleniyor': 0,
            'onay bekliyor': 0,
            'kuryede': 0,
            'teslim edildi': 0,
            'iptal edildi': 0
        };
        
        statusCounts.forEach(row => {
            const status = row.status.toLowerCase();
            if (countsMap.hasOwnProperty(status)) {
                countsMap[status] = parseInt(row.count, 10);
            }
        });

        console.log('DEBUG: Sipariş Durumu Sayıları API yanıtı:', countsMap);
        res.json({
            success: true,
            data: {
                bekliyor: countsMap['bekleniyor'],
                hazirlaniyor: 0, // Hazırlanıyor durumunu kaldırıyoruz
                onayBekliyor: countsMap['onay bekliyor'], // Onay bekleyenleri ekliyoruz
                kuryede: countsMap['kuryede'],
                teslimEdildi: countsMap['teslim edildi'],
                iptalEdildi: countsMap['iptal edildi']
            }
        });

    } catch (error) {
        console.error('❌ Sipariş durumu sayıları alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Admin - Test Verisi Oluştur
router.post('/create-test-data', async (req, res) => {
    try {
        // Create a test courier
        const testCourierEmail = 'testkurye_temp@example.com';
        const testCourierPassword = 'password123';
        const hashedCourierPassword = await bcrypt.hash(testCourierPassword, 10);

        await sql`
            INSERT INTO couriers (name, email, password_hash, phone_number, delivery_capacity, notification_mode, is_blocked, created_at, updated_at)
            VALUES ('Test Kurye', ${testCourierEmail}, ${hashedCourierPassword}, '5551112233', 5, 'all_restaurants', FALSE, ${NOW()}, ${NOW()})
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, notification_mode = 'all_restaurants', updated_at = EXCLUDED.updated_at;
        `;

        // Create a test restaurant
        const testRestaurantEmail = 'testrestaurant_temp@example.com';
        const testRestaurantPassword = 'password123';
        const hashedRestaurantPassword = await bcrypt.hash(testRestaurantPassword, 10);

        await sql`
            INSERT INTO restaurants (name, email, password_hash, yetkili_name, role, courier_visibility_mode, created_at, updated_at)
            VALUES ('Test Restoran', ${testRestaurantEmail}, ${hashedRestaurantPassword}, 'Test Yetkilisi', 'restaurant', 'all_couriers', ${NOW()}, ${NOW()})
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, courier_visibility_mode = 'all_couriers', updated_at = EXCLUDED.updated_at;
        `;

        res.json({ success: true, message: 'Test verisi başarıyla oluşturuldu.' });
    } catch (error) {
        console.error('❌ Test verisi oluşturulurken hata:', error);
        res.status(500).json({ success: false, message: 'Test verisi oluşturulurken hata oluştu.' });
    }
});

// Admin - Bildirim Ayarları Kaydetme
router.post('/notification-settings', async (req, res) => {
    try {
        const { notificationEnabled, notificationChannel } = req.body;

        const settingsData = {
            notificationEnabled: Boolean(notificationEnabled),
            notificationChannel: notificationChannel || 'all',
            lastUpdated: new Date().toISOString()
        };

        await sql`
            INSERT INTO admin_settings (setting_key, setting_value, created_at, updated_at)
            VALUES ('notification_settings', ${JSON.stringify(settingsData)}, ${NOW()}, ${NOW()})
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = ${NOW()}
            RETURNING *
        `;

        res.json({ success: true, message: 'Bildirim ayarları başarıyla kaydedildi' });

    } catch (error) {
        console.error('❌ Bildirim ayarları kaydetme hatası:', error);
        res.status(500).json({ success: false, message: 'Bildirim ayarları kaydedilirken bir hata oluştu' });
    }
});

// Admin - Test Bildirimi Gönder
router.post('/send-test-notification', async (req, res) => {
    try {
        const { type, scope, title, message, priority, withSound, recipients } = req.body;

        // Validation
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Başlık ve mesaj gereklidir'
            });
        }

        if (!['couriers', 'restaurants'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz bildirim türü'
            });
        }

        if (!['all', 'online', 'specific'].includes(scope)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz alıcı kapsamı'
            });
        }

        let targetUsers = [];
        let socketRoom = '';

        if (type === 'couriers') {
            socketRoom = 'couriers';
            
            if (scope === 'all') {
                // Tüm kuryeleri al
                const allCouriers = await sql`
                    SELECT id, name, is_blocked 
                    FROM couriers 
                    WHERE is_blocked = false OR is_blocked IS NULL
                `;
                targetUsers = allCouriers;
            } else if (scope === 'online') {
                // Çevrimiçi kuryeleri al (socket odalarından)
                // Bu örnekte tüm kuryelerin %30'u çevrimiçi kabul ediliyor
                const allCouriers = await sql`
                    SELECT id, name, is_blocked 
                    FROM couriers 
                    WHERE is_blocked = false OR is_blocked IS NULL
                `;
                targetUsers = allCouriers;
            } else if (scope === 'specific') {
                if (!recipients || recipients.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Belirli alıcılar seçilmemiş'
                    });
                }
                
                const specificCouriers = await sql`
                    SELECT id, name, is_blocked 
                    FROM couriers 
                    WHERE id = ANY(${recipients}) AND (is_blocked = false OR is_blocked IS NULL)
                `;
                targetUsers = specificCouriers;
            }
        } else if (type === 'restaurants') {
            socketRoom = 'restaurants';
            
            if (scope === 'all') {
                // Tüm restorantları al
                const allRestaurants = await sql`
                    SELECT id, name 
                    FROM restaurants
                `;
                targetUsers = allRestaurants;
            } else if (scope === 'online') {
                // Çevrimiçi restorantları al
                const allRestaurants = await sql`
                    SELECT id, name 
                    FROM restaurants
                `;
                targetUsers = allRestaurants;
            } else if (scope === 'specific') {
                if (!recipients || recipients.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Belirli alıcılar seçilmemiş'
                    });
                }
                
                const specificRestaurants = await sql`
                    SELECT id, name 
                    FROM restaurants 
                    WHERE id = ANY(${recipients})
                `;
                targetUsers = specificRestaurants;
            }
        }

        // Socket ile bildirim gönder
        if (req.io && targetUsers.length > 0) {
            const notificationData = {
                title: title,
                message: message,
                priority: priority,
                withSound: withSound,
                timestamp: new Date().toISOString(),
                type: 'admin_notification',
                sender: 'admin'
            };

            if (scope === 'all') {
                // Tüm kullanıcılara gönder
                req.io.to(socketRoom).emit('adminNotification', notificationData);
            } else if (scope === 'online') {
                // Çevrimiçi kullanıcılara gönder
                req.io.to(socketRoom).emit('adminNotification', notificationData);
            } else if (scope === 'specific') {
                // Belirli kullanıcılara gönder
                targetUsers.forEach(user => {
                    const userRoom = type === 'couriers' ? `courier_${user.id}` : `restaurant_${user.id}`;
                    req.io.to(userRoom).emit('adminNotification', notificationData);
                });
            }
        }

        // Bildirim geçmişine kaydet (opsiyonel)
        try {
            await sql`
                INSERT INTO admin_notifications (
                    type, scope, title, message, priority, with_sound, 
                    recipients_count, created_at
                ) VALUES (
                    ${type}, ${scope}, ${title}, ${message}, ${priority}, 
                    ${withSound}, ${targetUsers.length}, NOW()
                )
            `;
        } catch (notificationLogError) {
            console.log('⚠️ Bildirim geçmiş kaydı yapılamadı:', notificationLogError.message);
            // Hata olsa da ana işlemi devam ettir
        }

        res.json({
            success: true,
            message: 'Bildirim başarıyla gönderildi',
            data: {
                sentCount: targetUsers.length,
                type: type,
                scope: scope,
                title: title
            }
        });

    } catch (error) {
        console.error('Admin bildirim gönderme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Bildirim gönderilemedi: ' + error.message
        });
    }
});

// Admin - Veritabanı Bağlantı Testi (Geliştirme için)
router.get('/db-test', async (req, res) => {
    try {
        const result = await sql`SELECT 1 as test_col`;

        // Test a join query to ensure relations are working
        const joinResult = await sql`
            SELECT o.id, r.name as restaurant_name
            FROM orders o
            JOIN restaurants r ON o.firmaid = r.id
            LIMIT 1;
        `;

        res.json({ success: true, message: 'Database bağlantısı ve JOIN testi başarılı!' });
    } catch (error) {
        console.error('❌ Veritabanı bağlantı testi hatası:', error);
        res.status(500).json({ success: false, message: 'Veritabanı bağlantı testi sırasında hata oluştu.' });
    }
});

// --- Analiz Endpoints ---

// Admin - En çok sipariş yapan kuryeler
router.get('/analytics/top-couriers', async (req, res) => {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0); // Unix Epoch
    const end = endDate ? new Date(endDate) : new Date();

    try {
        const topCouriers = await sql`
            SELECT 
                c.id,
                c.name,
                c.email,
                c.phone_number,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.courier_price), 0) as total_earnings
            FROM couriers c
            JOIN orders o ON c.id = o.kuryeid
            WHERE o.status = 'teslim edildi'
            AND o.created_at >= ${start} AND o.created_at <= ${end}
            GROUP BY c.id, c.name, c.email, c.phone_number
            ORDER BY total_orders DESC
            LIMIT 5;
        `;
        res.json({ success: true, data: topCouriers });
    } catch (error) {
        console.error('❌ Top kuryeler alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Admin - En çok kazandıran restoranlar (platform karı)
router.get('/analytics/top-earning-restaurants', async (req, res) => {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0); 
    const end = endDate ? new Date(endDate) : new Date();

    try {
        const topEarningRestaurants = await sql`
            SELECT 
                r.id,
                r.name,
                COALESCE(SUM(o.restaurant_price - o.courier_price), 0) as platform_profit
            FROM restaurants r
            JOIN orders o ON r.id = o.firmaid
            WHERE o.status = 'teslim edildi'
            AND o.created_at >= ${start} AND o.created_at <= ${end}
            GROUP BY r.id, r.name
            ORDER BY platform_profit DESC
            LIMIT 5;
        `;
        res.json({ success: true, data: topEarningRestaurants });
    } catch (error) {
        console.error('❌ En çok kazandıran restoranlar alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});



// --- Notification Endpoints ---

// Get notifications for a specific user (restaurant or courier)
router.get('/notifications/:userType/:userId', async (req, res) => {
    const { userType, userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Validate userType
    if (!['restaurant', 'courier'].includes(userType)) {
        return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı tipi' });
    }
    
    try {
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Get notifications for the user
        const notifications = await sql`
            SELECT 
                id,
                title,
                message,
                type,
                is_read,
                created_at,
                data
            FROM admin_notifications
            WHERE user_type = ${userType} 
            AND (user_id = ${userId} OR user_id IS NULL)
            ORDER BY created_at DESC
            LIMIT ${parseInt(limit)}
            OFFSET ${offset}
        `;
        
        // Get total count
        const totalCount = await sql`
            SELECT COUNT(*) as count
            FROM admin_notifications
            WHERE user_type = ${userType} 
            AND (user_id = ${userId} OR user_id IS NULL)
        `;
        
        // Get unread count
        const unreadCount = await sql`
            SELECT COUNT(*) as count
            FROM admin_notifications
            WHERE user_type = ${userType} 
            AND (user_id = ${userId} OR user_id IS NULL)
            AND is_read = false
        `;
        
        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount[0].count,
                    totalPages: Math.ceil(totalCount[0].count / parseInt(limit))
                },
                unreadCount: unreadCount[0].count
            }
        });
        
    } catch (error) {
        console.error('Bildirimler alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Mark notifications as read
router.put('/notifications/:userType/:userId/mark-read', async (req, res) => {
    const { userType, userId } = req.params;
    const { notificationIds } = req.body; // Array of notification IDs, or empty for all
    
    if (!['restaurant', 'courier'].includes(userType)) {
        return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı tipi' });
    }
    
    try {
        
        
        if (notificationIds && notificationIds.length > 0) {
            // Mark specific notifications as read
            await sql`
                UPDATE admin_notifications
                SET is_read = true, updated_at = NOW()
                WHERE user_type = ${userType} 
                AND (user_id = ${userId} OR user_id IS NULL)
                AND id = ANY(${notificationIds})
            `;
        } else {
            // Mark all notifications as read
            await sql`
                UPDATE admin_notifications
                SET is_read = true, updated_at = NOW()
                WHERE user_type = ${userType} 
                AND (user_id = ${userId} OR user_id IS NULL)
                AND is_read = false
            `;
        }
        
        res.json({ success: true, message: 'Bildirimler okundu olarak işaretlendi' });
        
    } catch (error) {
        console.error('Bildirimler okundu olarak işaretlenirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Create a new notification (for admin use)
router.post('/notifications', async (req, res) => {
    const { title, message, type, userType, userId, data } = req.body;
    
    if (!title || !message || !userType) {
        return res.status(400).json({ success: false, message: 'Başlık, mesaj ve kullanıcı tipi gereklidir' });
    }
    
    if (!['restaurant', 'courier'].includes(userType)) {
        return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı tipi' });
    }
    
    try {
        
        
        const [notification] = await sql`
            INSERT INTO admin_notifications (
                title, message, type, user_type, user_id, data, created_at, updated_at
            ) VALUES (
                ${title}, ${message}, ${type || 'info'}, ${userType}, ${userId || null}, 
                ${data ? JSON.stringify(data) : null}, NOW(), NOW()
            ) RETURNING *
        `;
        
        res.json({ success: true, data: notification, message: 'Bildirim oluşturuldu' });
        
    } catch (error) {
        console.error('Bildirim oluşturulurken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Delete a notification
router.delete('/notifications/:notificationId', async (req, res) => {
    const { notificationId } = req.params;
    
    try {
        const result = await sql`
            DELETE FROM admin_notifications
            WHERE id = ${notificationId}
            RETURNING *
        `;
        
        if (result.length === 0) {
            return res.status(404).json({ success: false, message: 'Bildirim bulunamadı' });
        }
        
        res.json({ success: true, message: 'Bildirim silindi' });
        
    } catch (error) {
        console.error('Bildirim silinirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Get unread notification count
router.get('/notifications/:userType/:userId/unread-count', async (req, res) => {
    const { userType, userId } = req.params;
    
    if (!['restaurant', 'courier'].includes(userType)) {
        return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı tipi' });
    }
    
    try {
        const unreadCount = await sql`
            SELECT COUNT(*) as count
            FROM admin_notifications
            WHERE user_type = ${userType} 
            AND (user_id = ${userId} OR user_id IS NULL)
            AND is_read = false
        `;
        
        res.json({ success: true, count: unreadCount[0].count });
        
    } catch (error) {
        console.error('Okunmamış bildirim sayısı alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Clear all notifications for a user
router.delete('/notifications/:userType/:userId/clear-all', async (req, res) => {
    const { userType, userId } = req.params;
    
    if (!['restaurant', 'courier'].includes(userType)) {
        return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı tipi' });
    }
    
    try {
        const result = await sql`
            DELETE FROM admin_notifications
            WHERE user_type = ${userType} 
            AND (user_id = ${userId} OR user_id IS NULL)
            RETURNING id
        `;
        
        res.json({ 
            success: true, 
            message: 'Tüm bildirimler temizlendi',
            deletedCount: result.length
        });
        
    } catch (error) {
        console.error('Bildirimler temizlenirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// --- Configuration Endpoints ---

// Get API base URL for admin panel
router.get('/config/api-base-url', async (req, res) => {
    try {
        // Get the current request's base URL
        const protocol = req.protocol;
        const host = req.get('host');
        const apiBaseUrl = `${protocol}://${host}`;
        
        res.json({
            success: true,
            apiBaseUrl: apiBaseUrl
        });
    } catch (error) {
        console.error('API base URL alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası' 
        });
    }
});

// --- Order Management Endpoints for Admin Panel ---

// Get all orders for admin panel with filters
router.get('/orders', async (req, res) => {
    try {
        console.log('🔍 Admin orders endpoint called with query:', req.query);
        
        const { search, status, restaurantId, courierId, startDate, endDate } = req.query;
        
        // Build base query
        let baseQuery = `
            SELECT 
                o.*,
                r.name as firma_name,
                c.name as kurye_name
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            LEFT JOIN couriers c ON o.kuryeid = c.id
        `;

        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        // Date filter (for daily orders) - Default olarak bugünün siparişleri
        if (startDate && endDate) {
            whereConditions.push(`o.created_at >= $${paramIndex} AND o.created_at <= $${paramIndex + 1}`);
            queryParams.push(startDate);
            queryParams.push(endDate);
            paramIndex += 2;
        } else {
            // Tarih belirtilmemişse bugünün siparişlerini getir (Türkiye saati)
            whereConditions.push(`DATE(o.created_at AT TIME ZONE 'Europe/Istanbul') = CURRENT_DATE`);
        }

        // Search filter (order ID, restaurant name, or neighborhood)
        if (search && search.trim()) {
            whereConditions.push(`(
                o.id::text ILIKE $${paramIndex} OR 
                r.name ILIKE $${paramIndex} OR 
                o.mahalle ILIKE $${paramIndex}
            )`);
            queryParams.push(`%${search.trim()}%`);
            paramIndex++;
        }

        // Status filter
        if (status && status.trim()) {
            whereConditions.push(`o.status = $${paramIndex}`);
            queryParams.push(status.trim());
            paramIndex++;
        }

        // Restaurant filter
        if (restaurantId && restaurantId.trim()) {
            whereConditions.push(`o.firmaid = $${paramIndex}`);
            queryParams.push(parseInt(restaurantId));
            paramIndex++;
        }

        // Courier filter
        if (courierId && courierId.trim()) {
            whereConditions.push(`o.kuryeid = $${paramIndex}`);
            queryParams.push(parseInt(courierId));
            paramIndex++;
        }

        // Add WHERE clause if conditions exist
        if (whereConditions.length > 0) {
            baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        // Add ORDER BY and LIMIT
        baseQuery += ` ORDER BY o.created_at DESC LIMIT 200`;

        console.log('🔍 Final query:', baseQuery);
        console.log('📊 Query params:', queryParams);

        // Execute query using pool directly
        const { pool } = require('../config/db-config');
        const result = await pool.query(baseQuery, queryParams);
        const orders = result.rows;

        console.log(`✅ Admin orders fetched: ${orders.length} orders`);

        res.json({
            success: true,
            data: orders,
            count: orders.length
        });

    } catch (error) {
        console.error('❌ Admin siparişler alınırken hata:', error);
        console.error('❌ Error details:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası',
            error: error.message 
        });
    }
});

// Get all restaurants for admin panel filters
router.get('/restaurants-for-admin', async (req, res) => {
    try {
        const restaurants = await sql`
            SELECT id, name as firma_adi 
            FROM restaurants 
            ORDER BY name ASC
        `;
        
        res.json({ success: true, data: restaurants });
    } catch (error) {
        console.error('Restoranlar alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Test database timezone
router.get('/time-status', async (req, res) => {
    try {
        const result = await sql`
            SELECT 
                NOW() as db_time,
                CURRENT_TIMESTAMP as db_timestamp,
                timezone('Europe/Istanbul', NOW()) as istanbul_time,
                EXTRACT(TIMEZONE_HOUR FROM NOW()) as timezone_offset
        `;
        
        const dbTime = result[0];
        const jsTime = new Date();
        
        res.json({
            success: true,
            database_time: dbTime.db_time,
            database_timestamp: dbTime.db_timestamp,
            istanbul_time: dbTime.istanbul_time,
            timezone_offset: dbTime.timezone_offset,
            javascript_time: jsTime.toISOString(),
            javascript_local: jsTime.toLocaleString('tr-TR'),
            message: 'Database timezone test'
        });
    } catch (error) {
        console.error('Timezone test hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Timezone test hatası: ' + error.message 
        });
    }
});

// Check table structure
router.get('/table-structure/:tableName', async (req, res) => {
    try {
        const { tableName } = req.params;
        const result = await sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = ${tableName}
            ORDER BY ordinal_position
        `;
        
        res.json({
            success: true,
            table: tableName,
            columns: result
        });
    } catch (error) {
        console.error('Tablo yapısı kontrol hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Tablo yapısı kontrol hatası: ' + error.message 
        });
    }
});

// Test timezone function
router.get('/timezone-function-test', async (req, res) => {
    try {
        const result = await sql`
            SELECT 
                NOW() as utc_now,
                NOW() AT TIME ZONE 'Europe/Istanbul' as istanbul_now,
                CURRENT_TIMESTAMP as current_ts,
                EXTRACT(HOUR FROM NOW()) as utc_hour,
                EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Istanbul') as istanbul_hour
        `;
        
        const data = result[0];
        
        res.json({
            success: true,
            utc_now: data.utc_now,
            istanbul_now: data.istanbul_now,
            current_ts: data.current_ts,
            utc_hour: data.utc_hour,
            istanbul_hour: data.istanbul_hour,
            message: 'Timezone function test'
        });
    } catch (error) {
        console.error('Timezone function test hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Timezone function test hatası: ' + error.message 
        });
    }
});

module.exports = router; 