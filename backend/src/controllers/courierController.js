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
                COALESCE(SUM(o.courier_price), 0) as total_earnings
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
                id, 
                name, 
                email,
                phone,
                password,
                is_blocked,
                is_online, 
                package_limit,
                total_earnings,
                total_deliveries,
                last_activity,
                last_seen,
                created_at,
                updated_at,
                latitude,
                longitude,
                total_online_minutes
            FROM couriers 
            WHERE id = ${id}
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
                last_seen = NOW()
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
                NOW()
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
                last_seen = NOW()
            WHERE id = ${id}
            RETURNING *
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
                updated_at = NOW()
            WHERE id = ${id}
            RETURNING *
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
    const { name, phone, password } = req.body;
    const { id: userId, role } = req.user;

    // Authorization check - sadece kendi profilini güncelleyebilir
    if (role !== 'admin' && parseInt(id) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Türkiye saati SQL ifadesini al
        
        
        let updateQuery;
        if (password) {
            // Şifre de güncellenecekse
            updateQuery = sql`
                UPDATE couriers
                SET 
                    name = ${name},
                    phone_number = ${phone_number || null},
                    password = ${password},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING id, name, email, phone_number, package_limit, total_earnings, total_deliveries, created_at, updated_at
            `;
        } else {
            // Sadece isim ve telefon güncellenecek
            updateQuery = sql`
                UPDATE couriers
                SET 
                    name = ${name},
                    phone_number = ${phone_number || null},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING id, name, email, phone_number, package_limit, total_earnings, total_deliveries, created_at, updated_at
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
        
        
        const [newSession] = await sql`
            INSERT INTO courier_activity_sessions (courier_id, session_start, is_active)
            VALUES (${courierId}, NOW(), true)
            RETURNING *
        `;

        res.json({ 
            success: true, 
            data: newSession,
            message: 'Aktivite oturumu başlatıldı'
        });
    } catch (error) {
        console.error(`❌ Kurye #${courierId} aktivite oturumu başlatılırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye aktivite oturumu sonlandırma
const endCourierActivitySession = async (req, res) => {
    const { courierId } = req.params;

    try {
        
        
        const [activeSession] = await sql`
            SELECT * FROM courier_activity_sessions 
            WHERE courier_id = ${courierId} AND is_active = true
            ORDER BY session_start DESC
            LIMIT 1
        `;

        if (!activeSession) {
            return res.status(404).json({ success: false, message: 'Aktif oturum bulunamadı' });
        }

        const sessionStartTime = new Date(activeSession.session_start);
        const sessionEndTime = new Date();
        const durationMinutes = Math.round((sessionEndTime - sessionStartTime) / (1000 * 60));

        await sql`
            UPDATE courier_activity_sessions 
            SET session_end = NOW(), 
                duration_minutes = ${durationMinutes}, 
                is_active = false
            WHERE id = ${activeSession.id}
        `;

        await updateDailyActivity(courierId, durationMinutes);

        res.json({ 
            success: true, 
            message: 'Aktivite oturumu sonlandırıldı',
            duration: durationMinutes
        });
    } catch (error) {
        console.error(`❌ Kurye #${courierId} aktivite oturumu sonlandırılırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Günlük aktivite özetini güncelle
const updateDailyActivity = async (courierId, sessionMinutes) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [dailyActivity] = await sql`
            INSERT INTO courier_daily_activity (courier_id, activity_date, total_minutes, session_count, first_login, last_logout)
            VALUES (${courierId}, ${today}, ${sessionMinutes}, 1, NOW()::TIME, NOW()::TIME)
            ON CONFLICT (courier_id, activity_date)
            DO UPDATE SET
                total_minutes = courier_daily_activity.total_minutes + ${sessionMinutes},
                session_count = courier_daily_activity.session_count + 1,
                last_logout = NOW()::TIME,
                updated_at = NOW()
            RETURNING total_minutes, session_count
        `;

        // Reduced logging - only log errors or significant milestones
        await updateWeeklyActivity(courierId);
        
    } catch (error) {
        console.error(`❌ Kurye #${courierId} günlük aktivite güncellenirken hata:`, error);
    }
};

const updateWeeklyActivity = async (courierId) => {
    try {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        
        const weekStartStr = startOfWeek.toISOString().split('T')[0];
        const weekEndStr = endOfWeek.toISOString().split('T')[0];

        // Get weekly stats
        const weeklyStatsResult = await sql`
            SELECT 
                COALESCE(SUM(total_minutes), 0) as total_minutes,
                COUNT(DISTINCT activity_date) as total_days_active
            FROM courier_daily_activity 
            WHERE courier_id = ${courierId} 
            AND activity_date BETWEEN ${weekStartStr} AND ${weekEndStr}
        `;

        const weeklyStats = weeklyStatsResult[0];
        const avgDailyMinutes = weeklyStats.total_days_active > 0 ? 
            (weeklyStats.total_minutes / weeklyStats.total_days_active) : 0;

        await sql`
            INSERT INTO courier_weekly_activity (courier_id, week_start, week_end, total_minutes, total_days_active, average_daily_minutes)
            VALUES (${courierId}, ${weekStartStr}, ${weekEndStr}, ${weeklyStats.total_minutes}, ${weeklyStats.total_days_active}, ${avgDailyMinutes})
            ON CONFLICT (courier_id, week_start)
            DO UPDATE SET
                total_minutes = ${weeklyStats.total_minutes},
                total_days_active = ${weeklyStats.total_days_active},
                average_daily_minutes = ${avgDailyMinutes},
                updated_at = NOW()
        `;
        
    } catch (error) {
        console.error(`❌ Kurye #${courierId} haftalık aktivite güncellenirken hata:`, error);
    }
};

// Kurye aktivite raporunu getir
const getCourierActivityReport = async (req, res) => {
    const { courierId } = req.params;
    const { period = 'daily', limit = 30 } = req.query;
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        let report = {};

        if (period === 'daily') {
            // Günlük aktivite raporu
            const dailyReport = await sql`
                SELECT 
                    activity_date,
                    total_minutes,
                    session_count,
                    first_login,
                    last_logout,
                    FLOOR(total_minutes / 60) as hours,
                    (total_minutes % 60) as minutes
                FROM courier_daily_activity
                WHERE courier_id = ${courierId}
                ORDER BY activity_date DESC
                LIMIT ${limit}
            `;
            report.daily = dailyReport;
        }

        if (period === 'weekly' || period === 'all') {
            // Haftalık aktivite raporu
            const weeklyReport = await sql`
                SELECT 
                    week_start,
                    week_end,
                    total_minutes,
                    total_days_active,
                    average_daily_minutes,
                    FLOOR(total_minutes / 60) as total_hours,
                    (total_minutes % 60) as remaining_minutes
                FROM courier_weekly_activity
                WHERE courier_id = ${courierId}
                ORDER BY week_start DESC
                LIMIT ${limit}
            `;
            report.weekly = weeklyReport;
        }

        if (period === 'sessions' || period === 'all') {
            // Son oturum detayları
            const sessions = await sql`
                SELECT 
                    session_start,
                    session_end,
                    duration_minutes,
                    is_active,
                    FLOOR(duration_minutes / 60) as hours,
                    (duration_minutes % 60) as minutes
                FROM courier_activity_sessions
                WHERE courier_id = ${courierId}
                ORDER BY session_start DESC
                LIMIT ${Math.min(limit, 50)}
            `;
            report.sessions = sessions;
        }

        // Özet istatistikler
        const [summary] = await sql`
            SELECT 
                COUNT(*) as total_sessions,
                COALESCE(SUM(duration_minutes), 0) as total_minutes_all_time,
                COALESCE(AVG(duration_minutes), 0) as avg_session_minutes,
                MAX(session_start) as last_activity
            FROM courier_activity_sessions
            WHERE courier_id = ${courierId} AND is_active = false
        `;

        report.summary = {
            ...summary,
            total_hours_all_time: Math.floor(summary.total_minutes_all_time / 60),
            total_minutes_remaining: summary.total_minutes_all_time % 60,
            avg_session_hours: Math.floor(summary.avg_session_minutes / 60),
            avg_session_minutes_remaining: Math.round(summary.avg_session_minutes % 60)
        };

        res.json({ success: true, data: report });
    } catch (error) {
        console.error(`❌ Kurye #${courierId} aktivite raporu alınırken hata:`, error);
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
        const today = new Date().toISOString().split('T')[0];
        
        const summary = await sql`
            SELECT 
                c.id,
                c.name,
                c.is_online,
                c.last_activity,
                COALESCE(da.total_minutes, 0) as today_minutes,
                COALESCE(da.session_count, 0) as today_sessions,
                da.first_login as today_first_login,
                da.last_logout as today_last_logout,
                COALESCE(all_time.total_sessions, 0) as total_sessions,
                COALESCE(all_time.total_minutes, 0) as total_minutes_all_time,
                COALESCE(all_time.avg_session_minutes, 0) as avg_session_minutes
            FROM users c
            WHERE c.role = 'courier'
            LEFT JOIN courier_daily_activity da ON c.id = da.courier_id AND da.activity_date = ${today}
            LEFT JOIN (
                SELECT 
                    courier_id,
                    COUNT(*) as total_sessions,
                    SUM(duration_minutes) as total_minutes,
                    AVG(duration_minutes) as avg_session_minutes
                FROM courier_activity_sessions
                WHERE is_active = false
                GROUP BY courier_id
            ) all_time ON c.id = all_time.courier_id
            ORDER BY c.is_online DESC, today_minutes DESC, c.name ASC
        `;

        // Format the data for better readability
        const formattedSummary = summary.map(courier => ({
            ...courier,
            today_hours: Math.floor(courier.today_minutes / 60),
            today_minutes_remaining: courier.today_minutes % 60,
            total_hours_all_time: Math.floor(courier.total_minutes_all_time / 60),
            total_minutes_remaining_all_time: courier.total_minutes_all_time % 60,
            avg_session_hours: Math.floor(courier.avg_session_minutes / 60),
            avg_session_minutes_remaining: Math.round(courier.avg_session_minutes % 60)
        }));

        res.json({ success: true, data: formattedSummary });
    } catch (error) {
        console.error('❌ Tüm kuryelerin aktivite özeti alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye toplam çevrimiçi süresini getir
const getTotalOnlineTime = async (req, res) => {
    const { courierId } = req.params;
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Önce kurye tablosundan total_online_minutes değerini al
        const [courier] = await sql`
            SELECT total_online_minutes
            FROM couriers
            WHERE id = ${courierId}
        `;

        if (!courier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }

        const totalMinutes = courier.total_online_minutes || 0;
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;

        res.json({ 
            success: true, 
            totalTime: {
                hours: totalHours,
                minutes: remainingMinutes,
                totalMinutes: totalMinutes
            }
        });
    } catch (error) {
        console.error(`❌ Kurye #${courierId} toplam çevrimiçi süre alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye toplam çevrimiçi süresini güncelle (ek dakika ekle)
const updateTotalOnlineTime = async (req, res) => {
    const { courierId } = req.params;
    const { additionalMinutes = 1 } = req.body;

    try {
        // Get current total online time
        const courierResult = await sql`
            SELECT total_online_minutes
            FROM couriers 
            WHERE id = ${courierId}
        `;

        if (courierResult.length === 0) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }

        const currentMinutes = courierResult[0].total_online_minutes || 0;
        const newTotalMinutes = currentMinutes + additionalMinutes;

        // Update total online time
        await sql`
            UPDATE couriers 
            SET total_online_minutes = ${newTotalMinutes},
                updated_at = NOW()
            WHERE id = ${courierId}
        `;

        const totalHours = Math.floor(newTotalMinutes / 60);
        const remainingMinutes = newTotalMinutes % 60;

        res.json({ 
            success: true, 
            message: 'Çevrimiçi süre başarıyla kaydedildi',
            totalTime: {
                hours: totalHours,
                minutes: remainingMinutes,
                totalMinutes: newTotalMinutes
            }
        });
    } catch (error) {
        console.error(`❌ Kurye #${courierId} toplam çevrimiçi süre güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

module.exports = {
    getAllCouriers,
    getCourierById,
    login,
    updateLocationAndStatus,
    getCourierEarnings,
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