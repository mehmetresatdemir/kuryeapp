const express = require('express');
const router = express.Router();
const { sql } = require('../config/db-config');
const { protect } = require('../middleware/authMiddleware');

// Ana earnings endpoint - genel kazanç özeti
router.get('/', protect, async (req, res) => {
    const { role } = req.user;

    // Admin dışında erişim yok
    if (role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Genel kazanç istatistikleri
        const stats = await sql`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN status = 'teslim edildi' THEN 1 END) as delivered_orders,
                COUNT(CASE WHEN status = 'kuryede' THEN 1 END) as active_orders,
                COALESCE(SUM(CASE WHEN status = 'teslim edildi' THEN courier_price ELSE 0 END), 0) as total_courier_earnings,
                COALESCE(SUM(CASE WHEN status = 'teslim edildi' THEN (nakit_tutari + banka_tutari + hediye_tutari) ELSE 0 END), 0) as total_restaurant_earnings,
                COALESCE(SUM(CASE WHEN status = 'teslim edildi' THEN (courier_price + nakit_tutari + banka_tutari + hediye_tutari) ELSE 0 END), 0) as total_revenue
            FROM orders
        `;

        // Bugünkü kazançlar
        const todayStats = await sql`
            SELECT 
                COUNT(CASE WHEN status = 'teslim edildi' THEN 1 END) as today_orders,
                COALESCE(SUM(CASE WHEN status = 'teslim edildi' THEN courier_price ELSE 0 END), 0) as today_courier_earnings,
                COALESCE(SUM(CASE WHEN status = 'teslim edildi' THEN (nakit_tutari + banka_tutari + hediye_tutari) ELSE 0 END), 0) as today_restaurant_earnings
            FROM orders
            WHERE DATE(created_at) = CURRENT_DATE
        `;

        // Son 7 günün kazanç trendi
        const weeklyTrend = await sql`
            SELECT 
                DATE(created_at) as date,
                COUNT(CASE WHEN status = 'teslim edildi' THEN 1 END) as orders_count,
                COALESCE(SUM(CASE WHEN status = 'teslim edildi' THEN (courier_price + nakit_tutari + banka_tutari + hediye_tutari) ELSE 0 END), 0) as daily_revenue
            FROM orders
            WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `;

        res.json({
            success: true,
            data: {
                general: stats[0] || {},
                today: todayStats[0] || {},
                weekly_trend: weeklyTrend
            }
        });
    } catch (error) {
        console.error('Genel kazanç bilgileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Kurye aylık kazançları
router.get('/monthly/:courierId', protect, async (req, res) => {
    const { courierId } = req.params;
    const { date } = req.query; // YYYY-MM format veya boş
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        let whereClause = `WHERE o.kuryeid = ${courierId} AND o.status = 'teslim edildi'`;
        
        if (date) {
            if (date.length === 7) { // YYYY-MM format
                whereClause += ` AND DATE_TRUNC('month', o.created_at) = '${date}-01'::date`;
            } else if (date.length === 10) { // YYYY-MM-DD format
                whereClause += ` AND DATE(o.created_at) = '${date}'`;
            }
        }

        const monthlyEarnings = await sql`
            WITH monthly_data AS (
                SELECT 
                    TO_CHAR(o.created_at, 'YYYY-MM') as month,
                    COALESCE(SUM(o.courier_price), 0) as total_kurye,
                    COALESCE(SUM(CASE WHEN LOWER(o.odeme_yontemi) LIKE '%nakit%' THEN o.nakit_tutari ELSE 0 END), 0) as total_nakit,
                    COALESCE(SUM(CASE WHEN LOWER(o.odeme_yontemi) LIKE '%kredi%' OR LOWER(o.odeme_yontemi) LIKE '%kart%' OR LOWER(o.odeme_yontemi) LIKE '%banka%' THEN o.banka_tutari ELSE 0 END), 0) as total_banka,
                    COALESCE(SUM(CASE WHEN LOWER(o.odeme_yontemi) LIKE '%hediye%' THEN o.hediye_tutari ELSE 0 END), 0) as total_hediye
                FROM orders o
                WHERE o.kuryeid = ${courierId} AND o.status = 'teslim edildi'
                ${date ? (date.length === 7 ? sql`AND DATE_TRUNC('month', o.created_at) = ${date + '-01'}::date` : sql`AND DATE(o.created_at) = ${date}`) : sql``}
                GROUP BY TO_CHAR(o.created_at, 'YYYY-MM')
                ORDER BY month DESC
                LIMIT 12
            )
            SELECT * FROM monthly_data
        `;

        res.json({ success: true, data: monthlyEarnings });
    } catch (error) {
        console.error(`Kurye #${courierId} aylık kazançları alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Kurye teslim edilen siparişler
router.get('/delivered/:courierId', protect, async (req, res) => {
    const { courierId } = req.params;
    const { date, week, start, end } = req.query;
    const { id: userId, role } = req.user;

    // Authorization check
    if (role !== 'admin' && parseInt(courierId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Build WHERE clause manually
        let whereClause = `o.kuryeid = ${courierId} AND o.status = 'teslim edildi'`;
        
        if (date) {
            if (date.length === 7) { // YYYY-MM format (aylık)
                whereClause += ` AND DATE_TRUNC('month', o.created_at) = '${date}-01'::date`;
            } else if (date.length === 10) { // YYYY-MM-DD format (günlük)
                whereClause += ` AND DATE(o.created_at) = '${date}'`;
            }
        } else if (week) {
            // Haftalık: week parametresi haftanın başlangıç tarihidir (YYYY-MM-DD)
            whereClause += ` AND DATE(o.created_at) >= '${week}' AND DATE(o.created_at) <= '${week}'::date + INTERVAL '6 days'`;
        } else if (start && end) {
            // Özel tarih aralığı
            whereClause += ` AND DATE(o.created_at) >= '${start}' AND DATE(o.created_at) <= '${end}'`;
        }

        const deliveredOrders = await sql`
            SELECT 
                o.id::text,
                o.created_at,
                COALESCE(o.courier_price, 0) as courier_price,
                COALESCE(o.nakit_tutari, 0) as nakit_tutari,
                COALESCE(o.banka_tutari, 0) as banka_tutari,
                COALESCE(o.hediye_tutari, 0) as hediye_tutari,
                o.firma_adi as title,
                o.odeme_yontemi as odeme_tipi,
                r.name as firma_adi,
                o.mahalle,
                o.resim
            FROM orders o
            LEFT JOIN restaurants r ON o.firmaid = r.id
            WHERE ${sql.unsafe(whereClause)}
            ORDER BY o.created_at DESC
        `;

        res.json({ success: true, data: deliveredOrders });
    } catch (error) {
        console.error(`Kurye #${courierId} teslim edilen siparişler alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Restoran aylık kazançları
router.get('/firmmonthly/:firmId', protect, async (req, res) => {
    const { firmId } = req.params;
    const { date } = req.query;
    const { id: userId, role } = req.user;

    // Authorization check for restaurant
    if (role !== 'admin' && role !== 'restaurant' && parseInt(firmId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        const monthlyEarnings = await sql`
            WITH monthly_data AS (
                SELECT 
                    TO_CHAR(o.created_at, 'YYYY-MM') as month,
                    COALESCE(SUM(o.courier_price), 0) as total_kurye,
                    COALESCE(SUM(CASE WHEN LOWER(o.odeme_yontemi) LIKE '%nakit%' THEN o.nakit_tutari ELSE 0 END), 0) as total_nakit,
                    COALESCE(SUM(CASE WHEN LOWER(o.odeme_yontemi) LIKE '%kredi%' OR LOWER(o.odeme_yontemi) LIKE '%kart%' OR LOWER(o.odeme_yontemi) LIKE '%banka%' THEN o.banka_tutari ELSE 0 END), 0) as total_banka,
                    COALESCE(SUM(CASE WHEN LOWER(o.odeme_yontemi) LIKE '%hediye%' THEN o.hediye_tutari ELSE 0 END), 0) as total_hediye
                FROM orders o
                WHERE o.firmaid = ${firmId} AND o.status = 'teslim edildi'
                ${date ? (date.length === 7 ? sql`AND DATE_TRUNC('month', o.created_at) = ${date + '-01'}::date` : sql`AND DATE(o.created_at) = ${date}`) : sql``}
                GROUP BY TO_CHAR(o.created_at, 'YYYY-MM')
                ORDER BY month DESC
                LIMIT 12
            )
            SELECT * FROM monthly_data
        `;

        res.json({ success: true, data: monthlyEarnings });
    } catch (error) {
        console.error(`Restoran #${firmId} aylık kazançları alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Restoran teslim edilen siparişler
router.get('/firmdelivered/:firmId', protect, async (req, res) => {
    const { firmId } = req.params;
    const { date, week, start, end } = req.query;
    const { id: userId, role } = req.user;

    // Authorization check for restaurant
    if (role !== 'admin' && role !== 'restaurant' && parseInt(firmId) !== userId) {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

    try {
        // Build WHERE clause manually
        let whereClause = `o.firmaid = ${firmId} AND o.status = 'teslim edildi'`;
        
        if (date) {
            if (date.length === 7) { // YYYY-MM format (aylık)
                whereClause += ` AND DATE_TRUNC('month', o.created_at) = '${date}-01'::date`;
            } else if (date.length === 10) { // YYYY-MM-DD format (günlük)
                whereClause += ` AND DATE(o.created_at) = '${date}'`;
            }
        } else if (week) {
            // Haftalık: week parametresi haftanın başlangıç tarihidir (YYYY-MM-DD)
            whereClause += ` AND DATE(o.created_at) >= '${week}' AND DATE(o.created_at) <= '${week}'::date + INTERVAL '6 days'`;
        } else if (start && end) {
            // Özel tarih aralığı
            whereClause += ` AND DATE(o.created_at) >= '${start}' AND DATE(o.created_at) <= '${end}'`;
        }

        const deliveredOrders = await sql`
            SELECT 
                o.id::text,
                o.created_at,
                COALESCE(o.courier_price, 0) as kurye_tutari,
                COALESCE(o.nakit_tutari, 0) as nakit_tutari,
                COALESCE(o.banka_tutari, 0) as banka_tutari,
                COALESCE(o.hediye_tutari, 0) as hediye_tutari,
                o.firma_adi as title,
                o.odeme_yontemi as odeme_tipi,
                c.name as kurye_adi,
                o.mahalle
            FROM orders o
            LEFT JOIN couriers c ON o.kuryeid = c.id
            WHERE ${sql.unsafe(whereClause)}
            ORDER BY o.created_at DESC
        `;

        res.json({ success: true, data: deliveredOrders });
    } catch (error) {
        console.error(`Restoran #${firmId} teslim edilen siparişler alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Genel kazanç özeti (admin için)
router.get('/summary', protect, async (req, res) => {
    const { startDate, endDate, restaurantId, courierId } = req.query;
    const { role } = req.user;

    // Only admin can access general summary
    if (role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
    }

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
                COALESCE(SUM(o.courier_price + o.nakit_tutari + o.banka_tutari + o.hediye_tutari), 0) as total_revenue,
                COALESCE(SUM(o.courier_price), 0) as total_courier_payout,
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
                (o.courier_price + o.nakit_tutari + o.banka_tutari + o.hediye_tutari) as amount,
                o.odeme_yontemi as payment_method,
                o.courier_price as courier_earning,
                (o.nakit_tutari + o.banka_tutari + o.hediye_tutari) as restaurant_earning
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
        console.error('Kazanç özeti alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

module.exports = router; 