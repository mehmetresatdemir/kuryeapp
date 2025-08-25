const express = require('express');
const { pool, sql } = require('../config/db-config');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Kurye kazançları - aylık gruplu
router.get('/courier/:courierId', protect, async (req, res) => {
  try {
    const { courierId } = req.params;
    const { date } = req.query;

    const query = sql`
      SELECT 
        COUNT(*) as total_orders,
        SUM(courier_price) as total_earnings,
        TO_CHAR(COALESCE(o.delivered_at, o.approved_at, o.updated_at), 'YYYY-MM') as month,
        COALESCE(SUM(courier_price), 0) as earnings
      FROM orders o
      WHERE o.kuryeid = ${courierId} 
        AND o.status = 'teslim edildi'
        ${date ? (date.length === 7 ? sql`AND DATE_TRUNC('month', COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = ${date + '-01'}::date` : sql`AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = ${date}`) : sql``}
      GROUP BY TO_CHAR(COALESCE(o.delivered_at, o.approved_at, o.updated_at), 'YYYY-MM')
      ORDER BY month DESC
    `;

    const result = await query;
    const monthlyData = result.rows || [];

    res.json({
      success: true,
      monthlyData,
      totalEarnings: monthlyData.reduce((sum, month) => sum + parseFloat(month.total_earnings || 0), 0),
      totalOrders: monthlyData.reduce((sum, month) => sum + parseInt(month.total_orders || 0), 0)
    });

  } catch (error) {
    console.error('Kurye kazançları alınırken hata:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Kazanç verileri alınamadı',
      details: error.message 
    });
  }
});

// Kurye detay kazançları
router.get('/courier/:courierId/details', protect, async (req, res) => {
  try {
    const { courierId } = req.params;
    const { date, week, start, end } = req.query;

         let whereClause = `o.kuryeid = ${courierId} AND o.status = 'teslim edildi'`;
    
    // Normal sistem saati kullanarak tarih filtrelerini uygula
    if (date) {
      if (date.length === 7) { // YYYY-MM format
        whereClause += ` AND (DATE_TRUNC('month', COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = '${date}-01'::date)`;
      } else { // YYYY-MM-DD format
        whereClause += ` AND (DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = '${date}'::date)`;
      }
    } else if (week) {
      // Haftalık filtre
      whereClause += ` AND (DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) >= '${week}'::date AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) <= '${week}'::date + INTERVAL '6 days')`;
    } else if (start && end) {
      // Özel tarih aralığı
      whereClause += ` AND (DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) >= '${start}'::date AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) <= '${end}'::date)`;
    }

    const query = `
      SELECT 
        o.id,
        o.created_at::text as created_at,
        o.firma_adi,
        o.mahalle,
        o.courier_price,
        o.nakit_tutari,
        o.banka_tutari,
        o.hediye_tutari,
        o.odeme_yontemi as odeme_tipi,
        o.status,
        o.updated_at::text as updated_at,
        o.delivered_at::text as delivered_at,
        o.approved_at::text as approved_at,
        COALESCE(o.delivered_at::text, o.approved_at::text, o.updated_at::text) as actual_completion_time,
        o.resim,
        r.name as restaurant_name,
        r.address as restaurant_address
      FROM orders o
      LEFT JOIN restaurants r ON o.firmaid = r.id
      WHERE ${whereClause}
      ORDER BY actual_completion_time DESC
    `;

    const result = await pool.query(query);
    const orders = result.rows;

    const totalEarnings = orders.reduce((sum, order) => sum + parseFloat(order.courier_price || 0), 0);
    
    res.json({
      success: true,
      data: orders, // Frontend 'data' field'ını bekliyor
      totalEarnings,
      totalOrders: orders.length,
      deliveredOrders: orders.filter(o => o.status === 'teslim edildi').length
    });

  } catch (error) {
    console.error('Kurye detay kazançları alınırken hata:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Detay kazanç verileri alınamadı',
      details: error.message 
    });
  }
});

// Restoran kazançları - aylık gruplu
router.get('/restaurant/:restaurantId', protect, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { date } = req.query;

    const query = sql`
      SELECT 
        COUNT(*) as total_orders,
        SUM(nakit_tutari + banka_tutari + hediye_tutari - courier_price) as total_earnings,
        TO_CHAR(COALESCE(o.delivered_at, o.approved_at, o.updated_at), 'YYYY-MM') as month,
        COALESCE(SUM(nakit_tutari + banka_tutari + hediye_tutari - courier_price), 0) as earnings
      FROM orders o
      WHERE o.firmaid = ${restaurantId} 
        AND o.status = 'teslim edildi'
        ${date ? (date.length === 7 ? sql`AND DATE_TRUNC('month', COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = ${date + '-01'}::date` : sql`AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = ${date}`) : sql``}
      GROUP BY TO_CHAR(COALESCE(o.delivered_at, o.approved_at, o.updated_at), 'YYYY-MM')
      ORDER BY month DESC
    `;

    const result = await query;
    const monthlyData = result.rows || [];

    res.json({
      success: true,
      monthlyData,
      totalEarnings: monthlyData.reduce((sum, month) => sum + parseFloat(month.total_earnings || 0), 0),
      totalOrders: monthlyData.reduce((sum, month) => sum + parseInt(month.total_orders || 0), 0)
    });

  } catch (error) {
    console.error('Restoran kazançları alınırken hata:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Kazanç verileri alınamadı',
      details: error.message 
    });
  }
});

// Restoran detay kazançları
router.get('/restaurant/:restaurantId/details', protect, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { date, week, start, end } = req.query;

         let whereClause = `o.firmaid = ${restaurantId} AND o.status = 'teslim edildi'`;
    
    // Normal sistem saati kullanarak tarih filtrelerini uygula
    if (date) {
      if (date.length === 7) { // YYYY-MM format
        whereClause += ` AND (DATE_TRUNC('month', COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = '${date}-01'::date)`;
      } else { // YYYY-MM-DD format
        whereClause += ` AND (DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) = '${date}'::date)`;
      }
    } else if (week) {
      // Haftalık filtre
      whereClause += ` AND (DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) >= '${week}'::date AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) <= '${week}'::date + INTERVAL '6 days')`;
    } else if (start && end) {
      // Özel tarih aralığı
      whereClause += ` AND (DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) >= '${start}'::date AND DATE(COALESCE(o.delivered_at, o.approved_at, o.updated_at)) <= '${end}'::date)`;
    }

    const query = `
      SELECT 
        o.id,
        o.created_at::text as created_at,
        o.firma_adi as kurye_adi, 
        o.mahalle,
        o.courier_price as kurye_tutari,
        COALESCE(o.restaurant_price, 0) as restaurant_price,
        o.nakit_tutari,
        o.banka_tutari,
        o.hediye_tutari,
        o.odeme_yontemi as odeme_tipi,
        o.status,
        o.updated_at::text as updated_at,
        o.delivered_at::text as delivered_at,
        o.approved_at::text as approved_at,
        COALESCE(o.delivered_at::text, o.approved_at::text, o.updated_at::text) as actual_completion_time,
        (o.nakit_tutari + o.banka_tutari + o.hediye_tutari - o.courier_price) as restaurant_earnings,
        o.resim,
        o.firma_adi as title,
        c.name as courier_name,
        c.phone as courier_phone
      FROM orders o
      LEFT JOIN couriers c ON o.kuryeid = c.id
      WHERE ${whereClause}
      ORDER BY actual_completion_time DESC
    `;

    const result = await pool.query(query);
    const orders = result.rows;

    const totalEarnings = orders.reduce((sum, order) => sum + parseFloat(order.restaurant_earnings || 0), 0);
    
    res.json({
      success: true,
      data: orders, // Frontend 'data' field'ını bekliyor
      totalEarnings,
      totalOrders: orders.length,
      completedOrders: orders.filter(o => o.status === 'teslim edildi').length
    });

  } catch (error) {
    console.error('Restoran detay kazançları alınırken hata:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Detay kazanç verileri alınamadı',
      details: error.message 
    });
  }
});

module.exports = router; 