const { sql } = require('../config/db-config');


// Kurye tercihlerini getir
const getCourierPreferences = async (req, res) => {
    const { courierId } = req.params;
    
    try {
        // Kuryenin mevcut notification_mode'unu al
        const [courier] = await sql`
            SELECT notification_mode FROM couriers WHERE id = ${courierId}
        `;
        
        if (!courier) {
            return res.status(404).json({ success: false, message: 'Kurye bulunamadı' });
        }

        // Tüm restoranları ve seçim durumlarını getir
        let restaurants;
        if (courier.notification_mode === 'all_restaurants') {
            // Tüm restoranlar mode'unda tüm restoranlar seçili
            restaurants = await sql`
                SELECT 
                    r.id,
                    r.name,
                    true as is_selected
                FROM restaurants r
                ORDER BY r.name
            `;
        } else {
            // Selected restaurants mode'unda sadece preferences tablosundaki kayıtlar seçili
            restaurants = await sql`
                SELECT 
                    r.id,
                    r.name,
                    COALESCE(crp.is_selected, false) as is_selected
                FROM restaurants r
                LEFT JOIN courier_restaurant_preferences crp 
                    ON r.id = crp.restaurant_id AND crp.courier_id = ${courierId}
                ORDER BY r.name
            `;
        }

        res.json({
            success: true,
            data: {
                notification_mode: courier.notification_mode,
                restaurants: restaurants
            }
        });
        
    } catch (error) {
        console.error('Kurye tercihleri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye tercihlerini güncelle
const updateCourierPreferences = async (req, res) => {
    const { courierId } = req.params;
    const { notification_mode, selected_restaurants } = req.body;
    
    try {
        

        // Notification mode'u güncelle
        await sql`
            UPDATE couriers 
            SET notification_mode = ${notification_mode}, updated_at = NOW()
            WHERE id = ${courierId}
        `;

        // Notification mode değişikliği durumunda tercihleri yönet
        if (notification_mode === 'selected_restaurants') {
            // Selected restaurants modu seçildiyse, önce mevcut tercihleri sil
            await sql`
                DELETE FROM courier_restaurant_preferences 
                WHERE courier_id = ${courierId}
            `;

            // Yeni tercihleri ekle (eğer varsa)
            if (selected_restaurants && selected_restaurants.length > 0) {
                for (const restaurantId of selected_restaurants) {
                    await sql`
                        INSERT INTO courier_restaurant_preferences 
                        (courier_id, restaurant_id, is_selected, created_at, updated_at)
                        VALUES (${courierId}, ${restaurantId}, true, NOW(), NOW())
                    `;
                }
            }
        } else if (notification_mode === 'all_restaurants') {
            // All restaurants modu seçildiyse, mevcut tercihleri sil
            await sql`
                DELETE FROM courier_restaurant_preferences 
                WHERE courier_id = ${courierId}
            `;
        }

        res.json({ success: true, message: 'Tercihler başarıyla güncellendi' });
        
    } catch (error) {
        console.error('Kurye tercihleri güncellenirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Restoran tercihlerini getir
const getRestaurantPreferences = async (req, res) => {
    const { restaurantId } = req.params;
    
    try {
        // Restoranın mevcut courier_visibility_mode'unu al
        const [restaurant] = await sql`
            SELECT courier_visibility_mode FROM restaurants WHERE id = ${restaurantId}
        `;
        
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı' });
        }

        // Tüm kuryeleri ve seçim durumlarını getir
        let couriers;
        if (restaurant.courier_visibility_mode === 'all_couriers') {
            // Tüm kuryeler mode'unda tüm kuryeler seçili
            couriers = await sql`
                SELECT 
                    c.id,
                    c.name,
                    true as is_selected
                FROM couriers c
                ORDER BY c.name
            `;
        } else {
            // Selected couriers mode'unda sadece preferences tablosundaki kayıtlar seçili
            couriers = await sql`
                SELECT 
                    c.id,
                    c.name,
                    COALESCE(rcp.is_selected, false) as is_selected
                FROM couriers c
                LEFT JOIN restaurant_courier_preferences rcp 
                    ON c.id = rcp.courier_id AND rcp.restaurant_id = ${restaurantId}
                ORDER BY c.name
            `;
        }

        res.json({
            success: true,
            data: {
                courier_visibility_mode: restaurant.courier_visibility_mode,
                couriers: couriers
            }
        });
        
    } catch (error) {
        console.error('Restoran tercihleri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Restoran tercihlerini güncelle
const updateRestaurantPreferences = async (req, res) => {
    const { restaurantId } = req.params;
    const { courier_visibility_mode, selected_couriers } = req.body;
    
    try {
        

        // Courier visibility mode'u güncelle
        await sql`
            UPDATE restaurants 
            SET courier_visibility_mode = ${courier_visibility_mode}, updated_at = NOW()
            WHERE id = ${restaurantId}
        `;

        // Courier visibility mode değişikliği durumunda tercihleri yönet
        if (courier_visibility_mode === 'selected_couriers') {
            // Selected couriers modu seçildiyse, önce mevcut tercihleri sil
            await sql`
                DELETE FROM restaurant_courier_preferences 
                WHERE restaurant_id = ${restaurantId}
            `;

            // Yeni tercihleri ekle (eğer varsa)
            if (selected_couriers && selected_couriers.length > 0) {
                for (const courierId of selected_couriers) {
                    await sql`
                        INSERT INTO restaurant_courier_preferences 
                        (restaurant_id, courier_id, is_selected, created_at, updated_at)
                        VALUES (${restaurantId}, ${courierId}, true, NOW(), NOW())
                    `;
                }
            }
        } else if (courier_visibility_mode === 'all_couriers') {
            // All couriers modu seçildiyse, mevcut tercihleri sil
            await sql`
                DELETE FROM restaurant_courier_preferences 
                WHERE restaurant_id = ${restaurantId}
            `;
        }

        res.json({ success: true, message: 'Tercihler başarıyla güncellendi' });
        
    } catch (error) {
        console.error('Restoran tercihleri güncellenirken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Kurye için erişilebilir restoranları getir
const getAccessibleRestaurantsForCourier = async (courierId) => {
    try {
        const [courier] = await sql`
            SELECT notification_mode FROM couriers WHERE id = ${courierId}
        `;

        if (!courier) return [];

        if (courier.notification_mode === 'all_restaurants') {
            // Tüm restoranları döndür
            const restaurants = await sql`
                SELECT id FROM restaurants
            `;
            return restaurants.map(r => r.id);
        } else {
            // Sadece seçili restoranları döndür
            const restaurants = await sql`
                SELECT restaurant_id 
                FROM courier_restaurant_preferences 
                WHERE courier_id = ${courierId} AND is_selected = true
            `;
            return restaurants.map(r => r.restaurant_id);
        }
    } catch (error) {
        console.error('Erişilebilir restoranlar alınırken hata:', error);
        return [];
    }
};

// Restoran için erişilebilir kuryeleri getir
const getAccessibleCouriersForRestaurant = async (restaurantId) => {
    try {
        const [restaurant] = await sql`
            SELECT courier_visibility_mode FROM restaurants WHERE id = ${restaurantId}
        `;

        if (!restaurant) return [];

        if (restaurant.courier_visibility_mode === 'all_couriers') {
            // Tüm kuryeleri döndür
            const couriers = await sql`
                SELECT id FROM couriers
            `;
            return couriers.map(c => c.id);
        } else {
            // Sadece seçili kuryeleri döndür
            const couriers = await sql`
                SELECT courier_id 
                FROM restaurant_courier_preferences 
                WHERE restaurant_id = ${restaurantId} AND is_selected = true
            `;
            return couriers.map(c => c.courier_id);
        }
    } catch (error) {
        console.error('Erişilebilir kuryeler alınırken hata:', error);
        return [];
    }
};

module.exports = {
    getCourierPreferences,
    updateCourierPreferences,
    getRestaurantPreferences,
    updateRestaurantPreferences,
    getAccessibleRestaurantsForCourier,
    getAccessibleCouriersForRestaurant
}; 