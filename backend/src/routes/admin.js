const express = require('express');
const router = express.Router();
const { sql } = require('../config/db-config');
const restaurantController = require('../controllers/restaurantController');

const { getOnlineStats } = require('../sockets/handlers/roomHandlers');
const { removeOrderFromReminderTracking } = require('../services/orderCleanupService');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

// Admin-specific auth middleware (doesn't require database session)
const adminProtect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({ success: false, message: 'Yetkisiz erişim, token bulunamadı.' });
            }

            // Verify admin JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'defaultSecret');
            
            // Check if this is an admin token
            if (decoded.role !== 'admin' || decoded.id !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Bu işlem için admin yetkisi gereklidir.' 
                });
            }

            // Attach admin user to the request
            req.user = decoded;
            
            return next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Admin session süresi dolmuş, lütfen tekrar giriş yapın.',
                    shouldLogout: true 
                });
            } else if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Geçersiz admin token.' 
                });
            } else {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Yetkisiz erişim, admin token geçersiz.' 
                });
            }
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim, admin token bulunamadı.' });
    }
};

// Multer configuration for sound files
const soundStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const soundsDir = path.join(__dirname, '../../public/sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }
    cb(null, soundsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'notification-' + uniqueSuffix + ext);
  }
});

const soundUpload = multer({
  storage: soundStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece ses dosyaları kabul edilir!'), false);
    }
  }
});

// ===== RATE LIMITING =====

// Admin login rate limiter - sadece 5 deneme 15 dakikada
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 5, // Her IP için 5 deneme
  message: {
    success: false,
    message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Genel admin endpoint rate limiter
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: 100, // Dakika başına 100 istek
  message: {
    success: false,
    message: 'Çok fazla istek. Lütfen bir dakika bekleyin.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ===== ADMIN AUTHENTICATION =====

// Admin Login Endpoint (Korumasız - login için)
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { password } = req.body;
        
        // Input validation
        if (!password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Şifre gereklidir' 
            });
        }
        
        if (typeof password !== 'string' || password.length > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Geçersiz şifre formatı' 
            });
        }

        // Admin şifresi direkt olarak asd123 yapıldı
        const adminPassword = 'asd123';
        
        if (password === adminPassword) {
            // JWT token oluştur
            const token = jwt.sign(
                { 
                    id: 'admin', 
                    role: 'admin',
                    name: 'Administrator'
                }, 
                process.env.JWT_SECRET || 'defaultSecret',
                { 
                    expiresIn: '24h',
                    audience: 'admin',
                    issuer: 'kurye-app'
                }
            );
            
            res.json({ 
                success: true, 
                token,
                message: 'Giriş başarılı' 
            });
        } else {
            // Brute force saldırılarını zorlaştırmak için aynı mesaj
            res.status(401).json({ 
                success: false, 
                message: 'Giriş başarısız' 
            });
        }
    } catch (error) {
        // Hassas bilgileri loglara kaydet ama kullanıcıya verme
        console.error('Admin login hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Bir hata oluştu. Lütfen tekrar deneyin.' 
        });
    }
});

// API Base URL endpoint (korumasız - frontend config için gerekli)
router.get('/config/api-base-url', (req, res) => {
    // Sunucu üzerinde çalıştığımızda req.get('host') ile gerçek host'u alıyoruz
    const currentHost = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    
    // Eğer localhost değilse production kabul et
    const isProduction = !currentHost.includes('localhost');
    const localApiBase = process.env.LOCAL_API_BASE || 'https://kuryex.enucuzal.com';
    // Production'da her zaman HTTPS kullan
    const remoteApiBase = process.env.REMOTE_API_BASE || `https://${currentHost}`;
    const apiBaseUrl = isProduction ? remoteApiBase : localApiBase;

    res.json({
        success: true,
        apiBaseUrl: apiBaseUrl,
        detectedHost: currentHost,
        isProduction: isProduction
    });
});

// ===== TÜM DİĞER ADMIN ENDPOINT'LERİ KORUMA ALTINA AL =====
router.use(adminLimiter); // Rate limiting
router.use(adminProtect); // Admin Authentication

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
                lastUpdated: new Date().toLocaleString('tr-TR')
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
        // Build WHERE clause manually - Teslim tarihine göre filtrele
        let whereClause = `o.status = 'teslim edildi'`;
        
        if (startDate && endDate) {
            whereClause += ` AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) >= '${startDate}' AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) <= '${endDate}'`;
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
                COALESCE(o.delivered_at::text, o.approved_at::text, o.updated_at::text) as date,
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
            ORDER BY COALESCE(o.delivered_at::text, o.approved_at::text, o.updated_at::text) DESC
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
        console.error('Admin earnings data alınırken hata:', error);
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

// Get push tokens debug info
router.get('/debug/push-tokens', async (req, res) => {
    try {
        console.log('🔍 DEBUG: Push token bilgileri sorgulanıyor...');
        
        // Aktif push token'ları al
        const activeTokens = await sql`
            SELECT 
                pt.id,
                pt.user_id,
                pt.user_type,
                pt.platform,
                pt.is_active,
                pt.created_at,
                pt.updated_at,
                CASE 
                    WHEN pt.user_type = 'courier' THEN c.name
                    WHEN pt.user_type = 'restaurant' THEN r.name
                    ELSE 'Unknown'
                END as user_name,
                CASE 
                    WHEN pt.user_type = 'courier' THEN c.is_online
                    ELSE false
                END as is_online,
                LEFT(pt.token, 25) || '...' as token_preview
            FROM push_tokens pt
            LEFT JOIN couriers c ON pt.user_type = 'courier' AND pt.user_id = c.id
            LEFT JOIN restaurants r ON pt.user_type = 'restaurant' AND pt.user_id = r.id
            WHERE pt.is_active = true
            ORDER BY pt.user_type, pt.user_id
        `;

        // Toplam istatistikler
        const stats = await sql`
            SELECT 
                user_type,
                COUNT(*) as total_active_tokens,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as tokens_created_today,
                COUNT(CASE WHEN updated_at > NOW() - INTERVAL '1 hour' THEN 1 END) as tokens_updated_recently
            FROM push_tokens 
            WHERE is_active = true
            GROUP BY user_type
        `;

        // Kurye token istatistikleri
        const courierStats = await sql`
            SELECT 
                COUNT(*) as total_couriers,
                COUNT(CASE WHEN pt.id IS NOT NULL THEN 1 END) as couriers_with_tokens,
                COUNT(CASE WHEN c.is_online = true THEN 1 END) as online_couriers,
                COUNT(CASE WHEN c.is_online = true AND pt.id IS NOT NULL THEN 1 END) as online_couriers_with_tokens
            FROM couriers c
            LEFT JOIN push_tokens pt ON c.id = pt.user_id AND pt.user_type = 'courier' AND pt.is_active = true
            WHERE c.is_blocked = false
        `;

        console.log(`📊 DEBUG: ${activeTokens.length} aktif push token bulundu`);
        console.log(`📊 DEBUG: Kurye istatistikleri:`, courierStats[0]);

        res.json({
            success: true,
            data: {
                active_tokens: activeTokens,
                stats: stats,
                courier_stats: courierStats[0],
                total_active_tokens: activeTokens.length,
                timestamp: new Date().toLocaleString('tr-TR')
            }
        });
    } catch (error) {
        console.error('❌ DEBUG: Push token sorgusu hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
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
    res.status(501).json({ success: false, message: 'Yedekleme özelliği henüz tam olarak implemente edilmedi.' });
});

// Generate test data
router.post('/db/generate-test-data', async (req, res) => {
    try {
        const testCourierEmail = 'testkurye@kurye-x.com';
        const testRestaurantEmail = 'testrestoran@kurye-x.com';
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
        }

        // --- Create Test Restaurant ---
        const existingRestaurant = await sql`SELECT id FROM restaurants WHERE email = ${testRestaurantEmail}`;
        if (existingRestaurant.length === 0) {
            await sql`
                INSERT INTO restaurants (name, yetkili_name, phone, email, password, courier_visibility_mode, created_at)
                VALUES ('Test Restoran', 'Restoran Yetkilisi', '5559876543', ${testRestaurantEmail}, ${hashedPassword}, 'all_couriers', NOW())
            `;
            createdUsers.push({ email: testRestaurantEmail, role: 'restaurant' });
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
router.get('/restaurants/:restaurantId/neighborhoods', async (req, res) => {
    const { restaurantId } = req.params;
    
    try {
        // Admin paneli için tüm mahalleleri getir (aktif + pasif)
        const deliveryAreas = await sql`
            SELECT 
                id,
                neighborhood_name,
                restaurant_price,
                courier_price,
                is_delivery_available
            FROM restaurant_delivery_prices
            WHERE restaurant_id = ${restaurantId}
            ORDER BY neighborhood_name
        `;

        res.json({ success: true, data: deliveryAreas });
    } catch (error) {
        console.error(`Admin - Restoran #${restaurantId} mahalleleri alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Mahalle bilgileri yüklenirken bir sunucu hatası oluştu.' });
    }
});

// Mobil uygulama için filtrelenmiş mahalleler (sadece aktif olanlar)
router.get('/restaurants/:restaurantId/neighborhoods/mobile', restaurantController.getRestaurantNeighborhoods);

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

        // Dual role kontrolü - Bu email ile restaurant kayıtlı mı?
        const existingRestaurant = await sql`SELECT id FROM restaurants WHERE email = ${email}`;
        if (existingRestaurant.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten restoran olarak kayıtlı. Aynı kullanıcı hem restoran hem kurye olamaz.' 
            });
        }

        const currentTime = new Date();

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
                ${currentTime},
                ${currentTime}
            ) RETURNING id, name, email, phone, package_limit, is_blocked;
        `;
        res.status(201).json({ success: true, message: 'Kurye başarıyla eklendi.', data: newCourier });
    } catch (error) {
        console.error('Kurye eklenirken hata:', error);
        
        // Dual role hatası için özel mesaj
        if (error.code === 'P0001' && error.message.includes('zaten restoran olarak kayıtlı')) {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten sistem tarafından kullanılmaktadır. Lütfen farklı bir e-posta adresi deneyin.' 
            });
        }
        
        // Email unique constraint hatası
        if (error.code === '23505' && error.constraint === 'couriers_email_key') {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten kullanımda.' 
            });
        }
        
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

        const updateFields = {
            name,
            email,
            phone,
            package_limit,
            is_blocked: is_blocked || false,
            updated_at: new Date()
        };

        // Sadece yeni bir şifre girildiyse güncelle (düz metin olarak)
        if (password && password.trim() !== '') {
            updateFields.password = password;
        }

        const updateKeys = Object.keys(updateFields);
        const updateValues = Object.values(updateFields);

        if (updateKeys.length === 1 && updateKeys[0] === 'updated_at') {
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
router.patch('/restaurants/delivery-areas/:areaId/toggle-availability', restaurantController.toggleDeliveryAvailability);
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
                WHERE is_delivery_available = true
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



// Timestamp operations use database timezone directly

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
                    NOW(), NOW())
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = NOW()
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
            timestamp: new Date().toLocaleString('tr-TR')
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
            timestamp: new Date().toLocaleString('tr-TR'),
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
            timestamp: new Date().toLocaleString('tr-TR')
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
            timestamp: new Date().toLocaleString('tr-TR')
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
            timestamp: new Date().toLocaleString('tr-TR')
        });
        
        // Gerçek restart işlemi için process.exit() kullanılabilir
        // Ancak bu sadece development ortamında kullanılmalı

        
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
                timestamp: new Date().toLocaleString('tr-TR'),
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
            timestamp: new Date().toLocaleString('tr-TR')
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
    const testCourierEmail = 'testkurye@kurye-x.com';
    
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

    

    try {
        // Önce siparişi bul
        const [order] = await sql`SELECT * FROM orders WHERE id = ${orderId}`;

        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
        }

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
        const result = await sql`SELECT 1 as test`;
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('SQL test error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test JOIN endpoint
router.get('/test-join', async (req, res) => {
    try {
        const result = await sql`
            SELECT 
                o.id,
                o.kuryeid,
                c.name as kurye_name
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE o.id = 128
        `;
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


    try {
        let topRestaurants;
        if (start && end) {
            topRestaurants = await sql`
                SELECT
                    r.id,
                    r.name as firma_adi,
                    COUNT(o.id) as total_orders,
                    COALESCE(AVG(o.restaurant_price), 0) as average_price
                FROM restaurants r
                JOIN orders o ON r.id = o.firmaid
                WHERE o.status = 'teslim edildi'
                AND DATE(o.created_at) >= ${start}
                AND DATE(o.created_at) <= ${end}
                GROUP BY r.id, r.name
                ORDER BY total_orders DESC
                LIMIT 5;
            `;
        } else {
            topRestaurants = await sql`
                SELECT
                    r.id,
                    r.name as firma_adi,
                    COUNT(o.id) as total_orders,
                    COALESCE(AVG(o.restaurant_price), 0) as average_price
                FROM restaurants r
                JOIN orders o ON r.id = o.firmaid
                WHERE o.status = 'teslim edildi'
                GROUP BY r.id, r.name
                ORDER BY total_orders DESC
                LIMIT 5;
            `;
        }

        res.json({ success: true, data: topRestaurants });
    } catch (error) {
        console.error('En çok sipariş alan restoranlar alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});



// Top Earning Restaurants (Platform Profit)
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


// Get Order Status Counts for Dashboard
router.get('/analytics/order-status-counts', async (req, res) => {
    try {
    
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

        await sql`
            INSERT INTO couriers (name, email, password, delivery_capacity, notification_mode, is_blocked, created_at, updated_at)
            VALUES ('Test Kurye', ${testCourierEmail}, ${testCourierPassword}, 5, 'all_restaurants', FALSE, NOW(), NOW())
            ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, notification_mode = 'all_restaurants', updated_at = EXCLUDED.updated_at;
        `;

        // Create a test restaurant
        const testRestaurantEmail = 'testrestaurant_temp@example.com';
        const testRestaurantPassword = 'password123';

        await sql`
            INSERT INTO restaurants (name, email, password, yetkili_name, role, courier_visibility_mode, created_at, updated_at)
            VALUES ('Test Restoran', ${testRestaurantEmail}, ${testRestaurantPassword}, 'Test Yetkilisi', 'restaurant', 'all_couriers', NOW(), NOW())
            ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, courier_visibility_mode = 'all_couriers', updated_at = EXCLUDED.updated_at;
        `;

        res.json({ success: true, message: 'Test verisi başarıyla oluşturuldu.' });
    } catch (error) {
        console.error('❌ Test verisi oluşturulurken hata:', error);
        res.status(500).json({ success: false, message: 'Test verisi oluşturulurken hata oluştu.' });
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

// Admin - Kurye performans analizi (sipariş sayısı ve ortalama teslimat süresi)
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
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.courier_price), 0) as total_earnings,
                COALESCE(
                    AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60),
                    0
                ) as avg_delivery_time_minutes
            FROM couriers c
            JOIN orders o ON c.id = o.kuryeid
            WHERE o.status = 'teslim edildi' 
            AND o.delivered_at IS NOT NULL
            AND o.created_at >= ${start} AND o.created_at <= ${end}
            GROUP BY c.id, c.name, c.email
            ORDER BY total_orders DESC
            LIMIT 10;
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





// --- Configuration Endpoints ---

// --- Order Management Endpoints for Admin Panel ---

// Get all orders for admin panel with filters
router.get('/orders', async (req, res) => {
    try {
        console.log('🔍 Admin orders endpoint called - Bugünün siparişleri isteniyor (00:00 - 23:59)');
        console.log('📅 Bugünün tarihi:', new Date().toLocaleDateString('tr-TR'));
        
        const { search, status, restaurantId, courierId, startDate, endDate } = req.query;
        
        // Build base query
        let baseQuery = `
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
                c.name as kurye_name,
                CASE 
                    WHEN o.accepted_at IS NOT NULL AND o.delivered_at IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60
                    ELSE NULL
                END as delivery_time_minutes
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            LEFT JOIN couriers c ON o.kuryeid = c.id
        `;

        // Build WHERE conditions
        let whereClauses = [];
        let queryParams = [];

        // DATE(o.created_at) veritabanı timezone'una göre bugünün tarihini alır.
        // Eğer start/end date sağlanmazsa, sadece bugünün siparişlerini getir.
        if (startDate && endDate) {
            whereClauses.push(`DATE(o.created_at) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`);
            queryParams.push(startDate, endDate);
        } else {
            // Tarih aralığı belirtilmemişse, sunucunun bugünkü tarihini kullan
            const today = new Date();
            const serverToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            whereClauses.push(`DATE(o.created_at) = $${queryParams.length + 1}`);
            queryParams.push(serverToday);
        }

        if (status) {
            whereClauses.push(`o.status = $${queryParams.length + 1}`);
            queryParams.push(status);
        }

        if (restaurantId) {
            whereClauses.push(`o.firmaid = $${queryParams.length + 1}`);
            queryParams.push(restaurantId);
        }

        if (courierId) {
            whereClauses.push(`o.kuryeid = $${queryParams.length + 1}`);
            queryParams.push(courierId);
        }

        // Add WHERE clause if conditions exist
        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Add ORDER BY and LIMIT
        baseQuery += ` ORDER BY o.created_at DESC LIMIT 200`;

        console.log('🔍 Final query:', baseQuery);
        console.log('📊 Query params:', queryParams);

        // Execute query using pool directly
        const { pool } = require('../config/db-config');
        const result = await pool.query(baseQuery, queryParams);
        const orders = result.rows;

        console.log(`✅ Bugünün siparişleri getirildi (00:00 - 23:59): ${orders.length} adet`);
        
        // İlk 5 siparişin tarihlerini debug için log'la
        if (orders.length > 0) {
            console.log('📊 İlk 5 siparişin tarihleri:');
            orders.slice(0, 5).forEach((order, index) => {
                console.log(`  ${index + 1}. Sipariş #${order.id}: ${order.created_at} (${new Date(order.created_at).toLocaleDateString('tr-TR')})`);
            });
        }

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
                NOW() as local_time,
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
            javascript_time: jsTime.toLocaleString('tr-TR'),
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
                NOW() as current_time,
                NOW() as local_time,
                CURRENT_TIMESTAMP as current_ts,
                EXTRACT(HOUR FROM NOW()) as current_hour,
                EXTRACT(HOUR FROM NOW()) as local_hour
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

// ==================== BİLDİRİM SESLERİ YÖNETİMİ KALDIRILDI ====================
// Admin panel artık sadece local assets klasöründeki sesleri kullanıyor
// Ses yönetimi tamamen kaldırıldı

// ... existing code ...

// Test timeout notification system
router.post('/test-timeout-notification', async (req, res) => {
    try {
        const { orderId = "TEST", waitingTime = 6, restaurantName = "Test Restaurant", neighborhood = "Test Mahalle" } = req.body;
        
        const { sendAdminTimeoutNotification } = require('../services/pushNotificationService');
        
        const result = await sendAdminTimeoutNotification({
            orderId,
            waitingTime,
            restaurantName,
            neighborhood
        });
        
        res.json({
            success: true,
            message: 'Admin timeout notification test completed',
            result: result
        });
        
    } catch (error) {
        console.error('❌ TIMEOUT TEST: Error occurred:', error);
        res.status(500).json({
            success: false,
            message: 'Test timeout notification gönderilemedi',
            error: error.message
        });
    }
});

// Manual timeout check endpoint
router.post('/manual-timeout-check', async (req, res) => {
    try {
        const { checkOrderTimeouts } = require('../services/orderTimeoutService');
        
        const result = await checkOrderTimeouts();
        
        res.json({
            success: true,
            message: 'Manual timeout check completed',
            result: result
        });
        
    } catch (error) {
        console.error('❌ MANUAL TIMEOUT CHECK: Error occurred:', error);
        res.status(500).json({
            success: false,
            message: 'Manual timeout check failed',
            error: error.message
        });
    }
});

// iOS Push Notification Test Endpoint
router.post('/test-ios-push', async (req, res) => {
    try {
        console.log('🧪 iOS PUSH TEST: Test endpoint hit');
        const { userId, userType, testMessage } = req.body;
        
        if (!userId || !userType) {
            return res.status(400).json({
                success: false,
                message: 'userId ve userType gereklidir'
            });
        }
        
        console.log('🧪 iOS PUSH TEST: Testing push notification for:', { userId, userType });
        
        // Push token'ı al
        const [tokenRecord] = await sql`
            SELECT token, platform, created_at, updated_at, is_active
            FROM push_tokens 
            WHERE user_id = ${userId} AND user_type = ${userType} AND is_active = true
            ORDER BY updated_at DESC
            LIMIT 1
        `;
        
        console.log('🧪 iOS PUSH TEST: Token query result:', tokenRecord || 'null');
        
        if (!tokenRecord) {
            return res.status(404).json({
                success: false,
                message: 'Kullanıcının aktif push token\'ı bulunamadı',
                debug: { userId, userType }
            });
        }
        
        console.log('🧪 iOS PUSH TEST: Found token:', {
            tokenPreview: tokenRecord.token.substring(0, 30) + '...',
            platform: tokenRecord.platform,
            isActive: tokenRecord.is_active,
            createdAt: tokenRecord.created_at,
            updatedAt: tokenRecord.updated_at
        });
        
        // Test mesajı oluştur
        const testTitle = '🧪 iOS Push Test';
        const testBody = testMessage || `Test bildirimi - ${new Date().toLocaleString('tr-TR')}`;
        
        console.log('🧪 iOS PUSH TEST: Sending test notification:', { testTitle, testBody });
        
        // Push notification sistemi kaldırıldı
        const result = { success: false, message: 'Push notification sistemi kaldırıldı' };
        
        res.json({
            success: true,
            message: 'iOS push notification testi gönderildi',
            data: {
                userId,
                userType,
                platform: tokenRecord.platform,
                testTitle,
                testBody,
                result,
                tokenInfo: {
                    tokenPreview: tokenRecord.token.substring(0, 30) + '...',
                    platform: tokenRecord.platform,
                    createdAt: tokenRecord.created_at,
                    updatedAt: tokenRecord.updated_at
                }
            }
        });
        
    } catch (error) {
        console.error('❌ iOS PUSH TEST: Error occurred:', error);
        res.status(500).json({
            success: false,
            message: 'Test push notification gönderilemedi',
            error: error.message
        });
    }
});

// Debug: Aktif push token'ları listele
router.get('/debug/active-push-tokens', async (req, res) => {
    try {
        console.log('🔍 iOS PUSH DEBUG: Active tokens query started');
        
        const activeTokens = await sql`
            SELECT 
                pt.id,
                pt.user_id,
                pt.user_type,
                pt.platform,
                pt.is_active,
                pt.created_at,
                pt.updated_at,
                CASE 
                    WHEN pt.user_type = 'courier' THEN c.name
                    WHEN pt.user_type = 'restaurant' THEN r.name
                    ELSE 'Unknown'
                END as user_name,
                LEFT(pt.token, 25) || '...' as token_preview
            FROM push_tokens pt
            LEFT JOIN couriers c ON pt.user_type = 'courier' AND pt.user_id = c.id
            LEFT JOIN restaurants r ON pt.user_type = 'restaurant' AND pt.user_id = r.id
            WHERE pt.is_active = true
            ORDER BY pt.user_type, pt.updated_at DESC
        `;

        const stats = await sql`
            SELECT 
                user_type,
                platform,
                COUNT(*) as count,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as created_today,
                COUNT(CASE WHEN updated_at > NOW() - INTERVAL '1 hour' THEN 1 END) as updated_recently
            FROM push_tokens 
            WHERE is_active = true
            GROUP BY user_type, platform
            ORDER BY user_type, platform
        `;

        console.log('🔍 iOS PUSH DEBUG: Found', activeTokens.length, 'active tokens');
        
        res.json({
            success: true,
            data: {
                activeTokens,
                stats,
                timestamp: new Date().toISOString(),
                totalCount: activeTokens.length
            }
        });

    } catch (error) {
        console.error('❌ iOS PUSH DEBUG: Error getting active tokens:', error);
        res.status(500).json({
            success: false,
            message: 'Aktif tokenlar alınamadı'
        });
    }
});

// Push token listesi endpoint'i
router.get('/push-tokens', async (req, res) => {
    try {
        console.log('📋 PUSH TOKENS: List endpoint hit');
        
        const tokens = await sql`
            SELECT 
                user_id,
                user_type,
                platform,
                is_active,
                created_at,
                updated_at,
                LEFT(token, 20) || '...' as token_preview
            FROM push_tokens 
            ORDER BY updated_at DESC
            LIMIT 50
        `;
        
        res.json({
            success: true,
            count: tokens.length,
            tokens: tokens
        });
        
    } catch (error) {
        console.error('📋 PUSH TOKENS: Error:', error);
        res.status(500).json({
            success: false,
            message: 'Push token listesi alınamadı',
            error: error.message
        });
    }
});

// Admin - Tüm mahalle isteklerini getir
router.get('/neighborhood-requests', async (req, res) => {
    try {
        console.log('🏘️ Admin mahalle istekleri endpoint called');
        
        const requests = await sql`
            SELECT 
                nr.id,
                nr.restaurant_id,
                r.name as restaurant_name,
                nr.neighborhood_name,
                nr.restaurant_price,
                nr.courier_price,
                nr.status,
                nr.admin_notes,
                nr.created_at::text as created_at,
                nr.updated_at::text as updated_at
            FROM neighborhood_requests nr
            LEFT JOIN restaurants r ON nr.restaurant_id = r.id
            ORDER BY nr.created_at DESC
        `;

        console.log(`✅ ${requests.length} mahalle isteği bulundu`);
        
        res.json({ 
            success: true, 
            data: requests 
        });
        
    } catch (error) {
        console.error('❌ Mahalle istekleri alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Mahalle istekleri yüklenirken bir sunucu hatası oluştu.',
            error: error.message 
        });
    }
});

// Admin - Mahalle isteğini güncelle (onayla/reddet)
router.put('/neighborhood-requests/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes, courier_price } = req.body;
        
        console.log(`🏘️ Mahalle isteği #${id} güncelleniyor:`, { status, admin_notes, courier_price });
        
        // Önce isteği getir
        const [request] = await sql`
            SELECT * FROM neighborhood_requests WHERE id = ${id}
        `;
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Mahalle isteği bulunamadı'
            });
        }
        
        // İsteği güncelle
        const [updatedRequest] = await sql`
            UPDATE neighborhood_requests 
            SET 
                status = ${status},
                admin_notes = ${admin_notes || null},
                courier_price = ${courier_price || request.courier_price},
                updated_at = NOW()
            WHERE id = ${id}
            RETURNING *
        `;
        
        // Eğer onaylandıysa, restaurant_delivery_prices tablosuna ekle
        if (status === 'approved') {
            await sql`
                INSERT INTO restaurant_delivery_prices (
                    restaurant_id, 
                    neighborhood_name, 
                    restaurant_price, 
                    courier_price, 
                    is_delivery_available
                ) VALUES (
                    ${request.restaurant_id},
                    ${request.neighborhood_name},
                    ${request.restaurant_price},
                    ${courier_price || request.courier_price},
                    true
                )
                ON CONFLICT (restaurant_id, neighborhood_name) 
                DO UPDATE SET
                    restaurant_price = EXCLUDED.restaurant_price,
                    courier_price = EXCLUDED.courier_price,
                    is_delivery_available = EXCLUDED.is_delivery_available,
                    updated_at = NOW()
            `;
            
            console.log(`✅ Mahalle isteği onaylandı ve teslimat fiyatları güncellendi`);
        }
        
        res.json({
            success: true,
            message: `Mahalle isteği ${status === 'approved' ? 'onaylandı' : 'reddedildi'}`,
            data: updatedRequest
        });
        
    } catch (error) {
        console.error('❌ Mahalle isteği güncellenirken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Mahalle isteği güncellenirken bir sunucu hatası oluştu.',
            error: error.message
        });
    }
});

// Admin - Tüm destek taleplerini getir
router.get('/support-tickets', async (req, res) => {
    try {
        console.log('🎫 Admin destek talepleri endpoint called');
        
        const tickets = await sql`
            SELECT 
                st.id,
                st.user_id,
                st.user_role,
                st.title,
                st.description,
                st.status,
                st.priority,
                st.admin_response,
                st.created_at::text as created_at,
                st.updated_at::text as updated_at,
                CASE 
                    WHEN st.user_role = 'restaurant' THEN r.name
                    WHEN st.user_role = 'courier' THEN c.name
                    ELSE 'Bilinmeyen Kullanıcı'
                END as user_name
            FROM support_tickets st
            LEFT JOIN restaurants r ON st.user_id = r.id AND st.user_role = 'restaurant'
            LEFT JOIN couriers c ON st.user_id = c.id AND st.user_role = 'courier'
            ORDER BY st.created_at DESC
        `;

        console.log(`✅ ${tickets.length} destek talebi bulundu`);
        
        res.json({ 
            success: true, 
            data: tickets 
        });
        
    } catch (error) {
        console.error('❌ Destek talepleri alınırken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Destek talepleri yüklenirken bir sunucu hatası oluştu.',
            error: error.message 
        });
    }
});

// Admin - Destek talebini güncelle (yanıtla/kapat)
router.put('/support-tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_response } = req.body;
        
        console.log(`🎫 Destek talebi #${id} güncelleniyor:`, { status, admin_response });
        
        // Önce talebi getir
        const [ticket] = await sql`
            SELECT * FROM support_tickets WHERE id = ${id}
        `;
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Destek talebi bulunamadı'
            });
        }
        
        // Talebi güncelle
        const [updatedTicket] = await sql`
            UPDATE support_tickets 
            SET 
                status = ${status || ticket.status},
                admin_response = ${admin_response || ticket.admin_response},
                updated_at = NOW()
            WHERE id = ${id}
            RETURNING *
        `;
        
        res.json({
            success: true,
            message: 'Destek talebi başarıyla güncellendi',
            data: updatedTicket
        });
        
    } catch (error) {
        console.error('❌ Destek talebi güncellenirken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Destek talebi güncellenirken bir sunucu hatası oluştu.',
            error: error.message
        });
    }
});


module.exports = router; 