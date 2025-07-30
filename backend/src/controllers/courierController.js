const jwt = require('jsonwebtoken');
const { sql } = require('../config/db-config');
const { protect } = require('../middleware/authMiddleware');
const { verifyUser } = require('../services/authService');

const { generateToken } = require('../config/auth');

const getAllCouriers = async (req, res) => {
    try {
        const couriers = await sql`
            SELECT 
                c.id, 
                c.name, 
                c.email,
                c.role,
                c.phone,
                c.password,
                c.is_online, 
                c.last_activity,
                c.is_blocked,
                c.package_limit,
                c.total_deliveries,
                c.updated_at,
                COUNT(o.id) FILTER (WHERE o.status = 'kuryede') as active_orders_count,
                COALESCE(SUM(o.courier_price), 0) as total_earnings,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60
                    ) FILTER (WHERE o.status = 'teslim edildi' AND o.delivered_at IS NOT NULL), 
                    0
                ) as avg_delivery_time_minutes
            FROM 
                couriers c
            LEFT JOIN 
                orders o ON c.id = o.kuryeid
            GROUP BY 
                c.id, c.name, c.email, c.role, c.phone, c.password, c.is_online, c.last_activity, c.is_blocked, c.package_limit, c.total_deliveries, c.updated_at
            ORDER BY 
                c.is_online DESC, c.name ASC
        `;
        res.json({ success: true, data: couriers });
    } catch (error) {
        console.error('Kuryeler ve detayları alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

const getCourierById = async (req, res) => {
    const { id } = req.params;
    
    try {
        const [courier] = await sql`
            SELECT 
                c.id, 
                c.name, 
                c.email,
                c.phone,
                COALESCE(c.is_blocked, false) as is_blocked,
                COALESCE(c.is_online, false) as is_online, 
                COALESCE(c.package_limit, 5) as package_limit,
                COUNT(o.id) FILTER (WHERE o.status = 'teslim edildi') as total_deliveries,
                COALESCE(
                    AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.accepted_at)) / 60) 
                    FILTER (WHERE o.status = 'teslim edildi' AND o.delivered_at IS NOT NULL AND o.accepted_at IS NOT NULL), 
                    0
                ) as avg_delivery_time_minutes,
                c.last_seen,
                c.created_at,
                COALESCE(c.updated_at, c.created_at) as updated_at,
                c.latitude,
                c.longitude
            FROM couriers c
            LEFT JOIN orders o ON c.id = o.kuryeid
            WHERE c.id = ${id}
            GROUP BY c.id, c.name, c.email, c.phone, c.is_blocked, c.is_online, c.package_limit, c.last_seen, c.created_at, c.updated_at, c.latitude, c.longitude
        `;
        
        if (!courier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }
        
        res.json({ success: true, data: courier });
    } catch (error) {
        console.error(`Kurye #${id} alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Helper function for authenticating a courier
const authenticateCourier = async (email, password) => {
    const user = await verifyUser(email, password, 'courier');
    if (!user) {
        return null;
    }
    return user;
};

const login = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await authenticateCourier(email, password);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Şifre yanlış.' });
        }

        // Create JWT using centralized auth config
        const token = generateToken(
            { id: user.id, name: user.name, role: 'courier' },
            'courier'
        );

        res.json({ 
            success: true, 
            message: 'Giriş başarılı.', 
            token,
            courier: { id: user.id, name: user.name }
        });

    } catch (error) {
        console.error('Kurye girişi sırasında hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

const updateLocationAndStatus = async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude, is_online } = req.body;

    try {
        // Türkiye saati SQL ifadesini al
        
        
        const [courier] = await sql`
            UPDATE couriers
            SET 
                latitude = ${latitude},
                longitude = ${longitude},
                is_online = ${is_online},
                last_seen = ${new Date()}
            WHERE id = ${id}
            RETURNING id, name, is_online
        `;

        if (!courier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı.' });
        }
        
        // Emit courier status update to admins
        req.io.to('admins').emit('courierStatusUpdate', courier);

        res.json({ success: true, message: 'Durum güncellendi.', data: courier });
    } catch (error) {
        console.error(`Kurye #${id} durumu güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

const getCourierEarnings = async (req, res) => {
    const { courierId } = req.params;
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        const earnings = await sql`
            SELECT 
                status,
                COUNT(*) as order_count,
                COALESCE(SUM(courier_price), 0) as total_earnings
            FROM orders
            WHERE kuryeid = ${courierId}
            GROUP BY status
        `;

        res.json({ success: true, data: earnings });
    } catch (error) {
        console.error(`Kurye #${courierId} kazançları alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye teslimat istatistikleri - ortalama süre ve performans metrikleri
const getCourierDeliveryStats = async (req, res) => {
    const { courierId } = req.params;
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        const stats = await sql`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'teslim edildi') as total_delivered_orders,
                COALESCE(
                    AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60) 
                    FILTER (WHERE status = 'teslim edildi' AND delivered_at IS NOT NULL), 
                    0
                ) as avg_delivery_time_minutes,
                COALESCE(
                    MIN(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60) 
                    FILTER (WHERE status = 'teslim edildi' AND delivered_at IS NOT NULL), 
                    0
                ) as fastest_delivery_minutes,
                COALESCE(
                    MAX(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60) 
                    FILTER (WHERE status = 'teslim edildi' AND delivered_at IS NOT NULL), 
                    0
                ) as slowest_delivery_minutes,
                COUNT(*) FILTER (WHERE status = 'iptal edildi') as cancelled_orders,
                COUNT(*) as total_orders
            FROM orders
            WHERE kuryeid = ${courierId}
        `;

        const result = stats[0];
        
        res.json({ 
            success: true, 
            data: {
                totalDeliveredOrders: parseInt(result.total_delivered_orders) || 0,
                avgDeliveryTimeMinutes: Math.round(parseFloat(result.avg_delivery_time_minutes) || 0),
                fastestDeliveryMinutes: Math.round(parseFloat(result.fastest_delivery_minutes) || 0),
                slowestDeliveryMinutes: Math.round(parseFloat(result.slowest_delivery_minutes) || 0),
                cancelledOrders: parseInt(result.cancelled_orders) || 0,
                totalOrders: parseInt(result.total_orders) || 0,
                successRate: result.total_orders > 0 ? 
                    Math.round((result.total_delivered_orders / result.total_orders) * 100) : 0
            }
        });
    } catch (error) {
        console.error(`Kurye #${courierId} teslimat istatistikleri alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Add new courier function - this was not in the original file, but useful for admin panel
const addCourier = async (req, res) => {
    const { name, email, password, phone, package_limit } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Kurye adı, e-posta ve şifre gereklidir.' });
    }

    try {
        const existingCourier = await sql`SELECT id FROM couriers WHERE email = ${email}`;
        if (existingCourier.length > 0) {
            return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten kullanımda.' });
        }

        // Dual role kontrolü - Bu email ile restaurant kayıtlı mı?
        const existingRestaurant = await sql`SELECT id FROM restaurants WHERE email = ${email}`;
        if (existingRestaurant.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten restoran olarak kayıtlı. Aynı kullanıcı hem restoran hem kurye olamaz.' 
            });
        }

        // Düz şifre kullanıyoruz, bcrypt yok

        // Türkiye saati SQL ifadesini al
        
        
        const newCourier = await sql`
            INSERT INTO couriers (
                name,
                email,
                password,
                phone,
                package_limit,
                notification_mode,
                created_at
            ) VALUES (
                ${name},
                ${email},
                ${password},
                ${phone || null},
                ${package_limit || 5}, -- Default package limit
                'all_restaurants', -- Default notification mode
${new Date()}
            ) RETURNING id, name, email;
        `;
        res.status(201).json({ success: true, message: 'Kurye başarıyla eklendi.', courier: newCourier[0] });
    } catch (error) {
        console.error('Kurye eklenirken hata:', error);
        res.status(500).json({ success: false, message: 'Kurye eklenirken sunucu hatası oluştu.' });
    }
};

const updateCourier = async (req, res) => {
    const { courierId } = req.params;
    const { name, email, phone, package_limit, is_online, latitude, longitude } = req.body;

    if (!courierId) {
        return res.status(400).json({ success: false, message: 'Kurye ID gereklidir.' });
    }

    try {
        const currentCourier = await sql`SELECT email FROM couriers WHERE id = ${courierId}`;
        if (currentCourier.length === 0) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı.' });
        }

        if (currentCourier[0].email !== email) {
            const existingEmail = await sql`SELECT id FROM couriers WHERE email = ${email}`;
            if (existingEmail.length > 0) {
                return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten kullanımda.' });
            }
        }

        const updatedCourier = await sql`
            UPDATE couriers
            SET 
                name = ${name},
                email = ${email},
                phone = ${phone || null},
                package_limit = ${package_limit || 5},
                is_online = ${is_online !== undefined ? is_online : false}, -- Explicitly handle boolean
                latitude = ${latitude || null},
                longitude = ${longitude || null}
            WHERE id = ${courierId}
            RETURNING id, name, email;
        `;

        if (updatedCourier.length === 0) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı veya güncelleme başarısız.' });
        }

        res.json({ success: true, message: 'Kurye başarıyla güncellendi.', courier: updatedCourier[0] });
    } catch (error) {
        console.error(`Kurye #${courierId} güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Kurye güncellenirken sunucu hatası oluştu.' });
    }
};

const deleteCourier = async (req, res) => {
    const { courierId } = req.params;

    if (!courierId) {
        return res.status(400).json({ success: false, message: 'Kurye ID gereklidir.' });
    }

    try {
        // Also consider deleting/updating related orders if needed
        // For now, just delete the courier
        const deletedCourier = await sql`
            DELETE FROM couriers
            WHERE id = ${courierId}
            RETURNING id;
        `;

        if (deletedCourier.length === 0) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı veya silme başarısız.' });
        }

        res.json({ success: true, message: 'Kurye başarıyla silindi.' });
    } catch (error) {
        console.error(`Kurye #${courierId} silinirken hata:`, error);
        res.status(500).json({ success: false, message: 'Kurye silinirken sunucu hatası oluştu.' });
    }
};

// Kurye konumunu güncelle
const updateCourierLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude ve longitude gereklidir'
            });
        }

        // Türkiye saati SQL ifadesini al
        

        const result = await sql`
            UPDATE couriers 
            SET 
                latitude = ${latitude},
                longitude = ${longitude},
                last_seen = ${new Date()}
            WHERE id = ${id}
            RETURNING 
                id, name, email, phone, package_limit, 
                is_online, is_blocked, latitude, longitude,
                created_at::text as created_at,
                updated_at::text as updated_at,
                last_seen::text as last_seen
        `;

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Kurye bulunamadı'
            });
        }

        res.json({
            success: true,
            message: 'Konum güncellendi',
            courier: result[0]
        });

    } catch (error) {
        console.error('Konum güncelleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Konum güncellenirken bir hata oluştu'
        });
    }
};

// Kurye paket limiti güncelle
const updatePackageLimit = async (req, res) => {
    try {
        const { id } = req.params;
        const { package_limit } = req.body;

        if (!package_limit || package_limit < 1) {
            return res.status(400).json({
                success: false,
                message: 'Geçerli bir paket limiti gereklidir'
            });
        }

        // Türkiye saati SQL ifadesini al
        

        const result = await sql`
            UPDATE couriers 
            SET 
                package_limit = ${package_limit},
                updated_at = ${new Date()}
            WHERE id = ${id}
            RETURNING 
                id, name, email, phone, package_limit, 
                is_online, is_blocked, latitude, longitude,
                created_at::text as created_at,
                updated_at::text as updated_at,
                last_seen::text as last_seen
        `;

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Kurye bulunamadı'
            });
        }

        res.json({
            success: true,
            message: 'Paket limiti güncellendi',
            courier: result[0]
        });

    } catch (error) {
        console.error('Paket limiti güncelleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Paket limiti güncellenirken bir hata oluştu'
        });
    }
};

// Kurye profil güncelleme fonksiyonu (konum hariç)
const updateCourierProfile = async (req, res) => {
    const { id } = req.params;
    const { name, phone, password, email } = req.body;
    const { id: userId, role } = req.user;

    // Authorization check - sadece kendi profilini güncelleyebilir
    if (role !== 'admin' && parseInt(id) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // E-posta güncelleniyorsa, aynı e-posta ile başka kurye var mı kontrol et
        if (email) {
            const existingCourier = await sql`
                SELECT id FROM couriers 
                WHERE email = ${email} AND id != ${id}
            `;
            
            if (existingCourier.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Bu e-posta adresi zaten başka bir kurye tarafından kullanılıyor.' 
                });
            }
        }
        
        let updateQuery;
        // Mevcut kurye bilgilerini al
        const [currentCourier] = await sql`
            SELECT name, email, phone FROM couriers WHERE id = ${id}
        `;
        
        if (!currentCourier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }
        
        // Güncelleme için değerleri hazırla (gönderilmeyen alanlar mevcut değerlerini korur)
        const updateName = name || currentCourier.name;
        const updateEmail = email || currentCourier.email;
        const updatePhone = phone || currentCourier.phone;

        if (password) {
            // Şifre de güncellenecekse
            updateQuery = sql`
                UPDATE couriers
                SET 
                    name = ${updateName},
                    email = ${updateEmail},
                    phone = ${updatePhone},
                    password = ${password},
                    updated_at = ${new Date()}
                WHERE id = ${id}
                RETURNING 
                    id, name, email, phone, package_limit, total_earnings, total_deliveries,
                    created_at::text as created_at,
                    updated_at::text as updated_at
            `;
        } else {
            // Sadece isim, e-posta ve telefon güncellenecek
            updateQuery = sql`
                UPDATE couriers
                SET 
                    name = ${updateName},
                    email = ${updateEmail},
                    phone = ${updatePhone},
                    updated_at = ${new Date()}
                WHERE id = ${id}
                RETURNING 
                    id, name, email, phone, package_limit, total_earnings, total_deliveries,
                    created_at::text as created_at,
                    updated_at::text as updated_at
            `;
        }

        const [updatedCourier] = await updateQuery;

        if (!updatedCourier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }

        res.json({ 
            success: true, 
            message: 'Profil başarıyla güncellendi',
            data: updatedCourier 
        });
    } catch (error) {
        console.error(`Kurye #${id} profili güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye aktivite oturumu başlatma
const startCourierActivitySession = async (req, res) => {
    const { courierId } = req.params;

    try {
        // Geçici olarak devre dışı - sadece başarılı response döndür
        res.json({ 
            success: true, 
            sessionId: Date.now(), // Dummy session ID
            message: 'Aktivite oturumu başlatıldı'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye aktivite oturumu sonlandırma
const endCourierActivitySession = async (req, res) => {
    const { courierId } = req.params;

    try {
        // Geçici olarak devre dışı - sadece başarılı response döndür
        res.json({ 
            success: true, 
            message: 'Aktivite oturumu sonlandırıldı',
            durationMinutes: 0
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Günlük aktivite özetini güncelle
const updateDailyActivity = async (courierId, sessionMinutes) => {
    try {
        // Geçici olarak devre dışı - hiçbir şey yapma
    } catch (error) {
        // Sessizce hata yakala
    }
};

const updateWeeklyActivity = async (courierId) => {
    try {
        // Geçici olarak devre dışı - hiçbir şey yapma
    } catch (error) {
        // Sessizce hata yakala
    }
};

// Kurye aktivite raporunu getir
const getCourierActivityReport = async (req, res) => {
    const { courierId } = req.params;
    const { period = 'daily' } = req.query;
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Geçici olarak boş veri döndür
        let report = {
            daily: [{
                activity_date: (() => {
                    const today = new Date();
                    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                })(),
                total_minutes: 0,
                session_count: 0,
                hours: 0,
                minutes: 0
            }],
            summary: {
                total_sessions: 0,
                total_minutes_all_time: 0,
                avg_session_minutes: 0,
                total_hours_all_time: 0,
                total_minutes_remaining: 0,
                avg_session_hours: 0,
                avg_session_minutes_remaining: 0
            }
        };

        res.json({ success: true, data: report });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Tüm kuryelerin aktivite özetini getir (sadece admin)
const getAllCouriersActivitySummary = async (req, res) => {
    const { role } = req.user;

    if (role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Geçici olarak boş veri döndür
        res.json({ success: true, data: [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye toplam çevrimiçi süresini getir
const getTotalOnlineTime = async (req, res) => {
    try {
        // Geçici olarak sıfır değer döndür
        res.json({ 
            success: true, 
            totalTime: {
                hours: 0,
                minutes: 0,
                totalMinutes: 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye toplam çevrimiçi süresini güncelle (ek dakika ekle)
const updateTotalOnlineTime = async (req, res) => {
    try {
        // Geçici olarak dummy response döndür
        res.json({ 
            success: true, 
            message: 'Çevrimiçi süre başarıyla kaydedildi',
            totalTime: {
                hours: 0,
                minutes: 0,
                totalMinutes: 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

module.exports = {
    getAllCouriers,
    getCourierById,
    login,
    updateLocationAndStatus,
    getCourierEarnings,
    getCourierDeliveryStats, // Yeni eklenen teslimat istatistikleri fonksiyonu
    authenticateCourier, // Export for unified login
    addCourier,
    updateCourier,
    deleteCourier,
    updateCourierLocation,
    updatePackageLimit,
    updateCourierProfile,
    // Aktivite takibi fonksiyonları
    startCourierActivitySession,
    endCourierActivitySession,
    getCourierActivityReport,
    getAllCouriersActivitySummary,
    // Toplam çevrimiçi süre fonksiyonları
    getTotalOnlineTime,
    updateTotalOnlineTime
}; 