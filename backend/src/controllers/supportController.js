const { sql } = require('../config/db-config');

// Sorun bildir
const createSupportTicket = async (req, res) => {
    try {
        const { title, description, priority = 'medium' } = req.body;
        const { id: userId, role } = req.user;

        if (!title || !description) {
            return res.status(400).json({ 
                success: false, 
                message: 'Başlık ve açıklama gereklidir' 
            });
        }

        const [ticket] = await sql`
            INSERT INTO support_tickets (user_id, user_role, title, description, priority)
            VALUES (${userId}, ${role}, ${title}, ${description}, ${priority})
            RETURNING id, title, description, priority, status, created_at
        `;

        res.status(201).json({
            success: true,
            message: 'Destek talebi başarıyla oluşturuldu',
            data: ticket
        });
    } catch (error) {
        console.error('Destek talebi oluşturulurken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası' 
        });
    }
};

// Kullanıcının destek taleplerini getir
const getUserSupportTickets = async (req, res) => {
    try {
        const { id: userId, role } = req.user;

        const tickets = await sql`
            SELECT id, title, description, status, priority, admin_response, created_at, updated_at
            FROM support_tickets
            WHERE user_id = ${userId} AND user_role = ${role}
            ORDER BY created_at DESC
        `;

        res.status(200).json({
            success: true,
            data: tickets
        });
    } catch (error) {
        console.error('Destek talepleri getirilirken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası' 
        });
    }
};

// Mahalle ekleme talebi oluştur
const createNeighborhoodRequest = async (req, res) => {
    try {
        const { neighborhood_name, restaurant_price } = req.body;
        const { id: restaurantId, role } = req.user;

        if (role !== 'restaurant') {
            return res.status(403).json({ 
                success: false, 
                message: 'Bu işlem sadece restoranlar tarafından yapılabilir' 
            });
        }

        if (!neighborhood_name || !restaurant_price) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mahalle adı ve fiyat gereklidir' 
            });
        }

        // Aynı mahalle için önceki talep var mı kontrol et
        const existingRequest = await sql`
            SELECT id FROM neighborhood_requests 
            WHERE restaurant_id = ${restaurantId} 
            AND neighborhood_name = ${neighborhood_name}
            AND status = 'pending'
        `;

        if (existingRequest.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Bu mahalle için zaten bekleyen bir talebiniz var'
            });
        }

        const [request] = await sql`
            INSERT INTO neighborhood_requests (restaurant_id, neighborhood_name, restaurant_price, is_active)
            VALUES (${restaurantId}, ${neighborhood_name}, ${restaurant_price}, false)
            RETURNING id, neighborhood_name, restaurant_price, status, created_at
        `;

        res.status(201).json({
            success: true,
            message: 'Mahalle ekleme talebi başarıyla oluşturuldu',
            data: request
        });
    } catch (error) {
        console.error('Mahalle ekleme talebi oluşturulurken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası' 
        });
    }
};

// Restoran'ın mahalle taleplerini getir
const getRestaurantNeighborhoodRequests = async (req, res) => {
    try {
        const { id: restaurantId, role } = req.user;

        if (role !== 'restaurant') {
            return res.status(403).json({ 
                success: false, 
                message: 'Bu işlem sadece restoranlar tarafından yapılabilir' 
            });
        }

        const requests = await sql`
            SELECT id, neighborhood_name, restaurant_price, courier_price, status, admin_notes, created_at, updated_at
            FROM neighborhood_requests
            WHERE restaurant_id = ${restaurantId}
            ORDER BY created_at DESC
        `;

        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        console.error('Mahalle talepleri getirilirken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası' 
        });
    }
};

module.exports = {
    createSupportTicket,
    getUserSupportTickets,
    createNeighborhoodRequest,
    getRestaurantNeighborhoodRequests
}; 