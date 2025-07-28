const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { sql } = require('../config/db-config');
const { protect } = require('../middleware/authMiddleware');
const { verifyUser } = require('../services/authService');

const { generateToken } = require('../config/auth');

const getAllRestaurants = async (req, res) => {
    try {
        const result = await sql`
      SELECT 
        id,
        name as firma_adi,
        email,
        password,
        yetkili_name,
        phone,
        latitude::text AS latitude,  -- Explicitly cast to text to avoid btrim(numeric) error
        longitude::text AS longitude, -- Explicitly cast to text to avoid btrim(numeric) error
        -- COALESCE(COUNT(rdp.id), 0) as delivery_areas_count, -- This will be calculated separately if needed
        0 as active_orders -- This needs to be calculated dynamically
      FROM restaurants
      ORDER BY id
    `;
    
    // Parse latitude and longitude to numbers, handle invalid values
    const parsedData = result.map(restaurant => ({
        ...restaurant,
        latitude: parseFloat(restaurant.latitude) || null, // Convert to float, if NaN then null
        longitude: parseFloat(restaurant.longitude) || null // Convert to float, if NaN then null
    }));

    // Fetch delivery areas count for each restaurant
    for (let i = 0; i < parsedData.length; i++) {
        const deliveryAreasCountResult = await sql`
            SELECT COUNT(*) FROM restaurant_delivery_prices WHERE restaurant_id = ${parsedData[i].id} AND is_delivery_available = true;
        `;
        parsedData[i].delivery_areas_count = deliveryAreasCountResult[0].count;
    }



    res.json({
      success: true,
      data: parsedData,
      count: parsedData.length
    });
    } catch (error) {
        console.error('Restoranlar ve detayları alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Helper function for authenticating a restaurant
const authenticateRestaurant = async (email, password) => {
    const user = await verifyUser(email, password, 'restaurant');
    if (!user) {
        return null;
    }
    return user;
};

const loginRestaurant = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email ve password gerekli'
            });
        }

        const query = 'SELECT * FROM restaurants WHERE email = ?';
        const restaurants = await executeQuery(query, [email]);

        if (restaurants.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Geçersiz email veya şifre'
            });
        }

        const restaurant = restaurants[0];

        // Direct password comparison (plain text for now)
        if (restaurant.password === password) {
            const user = {
                id: restaurant.id,
                name: restaurant.name,
                email: restaurant.email,
                role: 'restaurant'
            };

            const token = generateToken(user, 'restaurant');

            res.status(200).json({
                success: true,
                message: 'Giriş başarılı',
                token,
                user
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Geçersiz email veya şifre'
            });
        }

    } catch (error) {
        console.error('Restaurant login error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
};

const getRestaurantNeighborhoods = async (req, res) => {
    // restaurantId'yi URL parametresinden veya JWT'den al
    // Admin paneli için doğrudan restaurantId parametresini kullan.
    // Mobil uygulama için JWT'deki user ID'yi kullanır.
    const restaurantId = req.params.restaurantId || (req.user ? req.user.id : null);

    if (!restaurantId) {
        return res.status(401).json({ success: false, message: 'Yetkilendirme başarısız: Restoran ID bulunamadı.' });
    }

    try {
        const deliveryAreas = await sql`
            SELECT 
                id,
                neighborhood_name,
                restaurant_price,
                courier_price,
                is_delivery_available
            FROM restaurant_delivery_prices
            WHERE restaurant_id = ${restaurantId} AND is_delivery_available = true
            ORDER BY neighborhood_name
        `;

        res.json({ success: true, data: deliveryAreas });
    } catch (error) {
        console.error(`Restoran #${restaurantId} mahalleleri alınırken hata:`, error);
        res.status(500).json({ success: false, message: 'Mahalle bilgileri yüklenirken bir sunucu hatası oluştu.' });
    }
};

const addDeliveryArea = async (req, res) => {
    const { restaurantId } = req.params;
    const { neighborhood_name, restaurant_price, courier_price, is_delivery_available } = req.body;

    if (!restaurantId || !neighborhood_name || restaurant_price === undefined || courier_price === undefined) {
        return res.status(400).json({ success: false, message: 'Eksik bilgi: restoran ID, mahalle adı, restoran ve kurye ücretleri gereklidir.' });
    }

    try {
        const newArea = await sql`
            INSERT INTO restaurant_delivery_prices (
                restaurant_id, 
                neighborhood_name, 
                restaurant_price, 
                courier_price, 
                is_delivery_available
            ) VALUES (
                ${restaurantId},
                ${neighborhood_name},
                ${restaurant_price},
                ${courier_price},
                ${is_delivery_available || true}
            ) RETURNING id;
        `;
        res.status(201).json({ success: true, message: 'Teslimat alanı başarıyla eklendi.', data: newArea[0] });
    } catch (error) {
        console.error(`Restoran #${restaurantId} için teslimat alanı eklenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Teslimat alanı eklenirken sunucu hatası oluştu.' });
    }
};

const updateDeliveryArea = async (req, res) => {
    const { areaId } = req.params;
    const { neighborhood_name, restaurant_price, courier_price, is_delivery_available } = req.body;



    if (!areaId || !neighborhood_name || restaurant_price === undefined || courier_price === undefined) {
        return res.status(400).json({ success: false, message: 'Eksik bilgi: alan ID, mahalle adı, restoran ve kurye ücretleri gereklidir.' });
    }

    try {


        const updatedArea = await sql`
            UPDATE restaurant_delivery_prices
            SET 
                neighborhood_name = ${neighborhood_name},
                restaurant_price = ${restaurant_price},
                courier_price = ${courier_price},
                is_delivery_available = ${is_delivery_available !== undefined ? is_delivery_available : true}
            WHERE id = ${areaId}
            RETURNING id, neighborhood_name, is_delivery_available;
        `;
        

        
        if (updatedArea.length === 0) {
            return res.status(404).json({ success: false, message: 'Teslimat alanı bulunamadı.' });
        }
        res.json({ success: true, message: 'Teslimat alanı başarıyla güncellendi.', data: updatedArea[0] });
    } catch (error) {
        console.error(`Teslimat alanı #${areaId} güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Teslimat alanı güncellenirken sunucu hatası oluştu.' });
    }
};

const deleteDeliveryArea = async (req, res) => {
    const { areaId } = req.params;

    if (!areaId) {
        return res.status(400).json({ success: false, message: 'Eksik bilgi: alan ID gereklidir.' });
    }

    try {
        const deletedArea = await sql`
            DELETE FROM restaurant_delivery_prices
            WHERE id = ${areaId}
            RETURNING id;
        `;
        if (deletedArea.length === 0) {
            return res.status(404).json({ success: false, message: 'Teslimat alanı bulunamadı.' });
        }
        res.json({ success: true, message: 'Teslimat alanı başarıyla silindi.' });
    } catch (error) {
        console.error(`Teslimat alanı #${areaId} silinirken hata:`, error);
        res.status(500).json({ success: false, message: 'Teslimat alanı silinirken sunucu hatası oluştu.' });
    }
};

const toggleDeliveryAvailability = async (req, res) => {
    const { areaId } = req.params;

    if (!areaId) {
        return res.status(400).json({ success: false, message: 'Eksik bilgi: alan ID gereklidir.' });
    }

    try {
        // Önce mevcut durumu al
        const currentArea = await sql`
            SELECT is_delivery_available
            FROM restaurant_delivery_prices
            WHERE id = ${areaId}
        `;
        
        if (currentArea.length === 0) {
            return res.status(404).json({ success: false, message: 'Teslimat alanı bulunamadı.' });
        }

        // Durumu toggle et
        const newStatus = !currentArea[0].is_delivery_available;
        
        const updatedArea = await sql`
            UPDATE restaurant_delivery_prices
            SET is_delivery_available = ${newStatus}
            WHERE id = ${areaId}
            RETURNING id, neighborhood_name, is_delivery_available;
        `;
        
        res.json({ 
            success: true, 
            message: `Teslimat durumu ${newStatus ? 'aktif' : 'pasif'} olarak güncellendi.`, 
            data: updatedArea[0] 
        });
    } catch (error) {
        console.error(`Teslimat alanı #${areaId} durumu güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Teslimat durumu güncellenirken sunucu hatası oluştu.' });
    }
};

const addRestaurant = async (req, res) => {
    const { name, yetkili_name, phone, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Restoran adı, e-posta ve şifre gereklidir.' });
    }

    try {
        // E-posta zaten kullanımda mı kontrol et
        const existingRestaurant = await sql`SELECT id FROM restaurants WHERE email = ${email}`;
        if (existingRestaurant.length > 0) {
            return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten kullanımda.' });
        }

        // Dual role kontrolü - Bu email ile courier kayıtlı mı?
        const existingCourier = await sql`SELECT id FROM couriers WHERE email = ${email}`;
        if (existingCourier.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten kurye olarak kayıtlı. Aynı kullanıcı hem kurye hem restoran olamaz.' 
            });
        }

        // Şifreyi düz metin olarak sakla
        const newRestaurant = await sql`
            INSERT INTO restaurants (
                name, 
                yetkili_name,
                phone,
                email,
                password,
                courier_visibility_mode,
                created_at
            ) VALUES (
                ${name},
                ${yetkili_name},
                ${phone},
                ${email},
                ${password},
                'all_couriers',
                NOW()
            ) RETURNING id, name, email;
        `;
        res.status(201).json({ success: true, message: 'Restoran başarıyla eklendi.', restaurant: newRestaurant[0] });
    } catch (error) {
        console.error('Restoran eklenirken hata:', error);
        
        // Dual role hatası için özel mesaj
        if (error.code === 'P0001' && error.message.includes('zaten kurye olarak kayıtlı')) {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten sistem tarafından kullanılmaktadır. Lütfen farklı bir e-posta adresi deneyin.' 
            });
        }
        
        // Email unique constraint hatası
        if (error.code === '23505' && error.constraint === 'restaurants_email_key') {
            return res.status(409).json({ 
                success: false, 
                message: 'Bu e-posta adresi zaten kullanımda.' 
            });
        }
        
        res.status(500).json({ success: false, message: 'Restoran eklenirken sunucu hatası oluştu.' });
    }
};

const updateRestaurant = async (req, res) => {
    const { restaurantId } = req.params;
    const { name, yetkili_name, email, phone, password } = req.body;



    if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Restoran ID gereklidir.' });
    }

    try {
        const currentRestaurant = await sql`SELECT email FROM restaurants WHERE id = ${restaurantId}`;
        if (currentRestaurant.length === 0) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı.' });
        }

        if (currentRestaurant[0].email !== email) {
            const existingEmail = await sql`SELECT id FROM restaurants WHERE email = ${email}`;
            if (existingEmail.length > 0) {
                return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten kullanımda.' });
            }
        }

        // Update query - sadece gönderilen alanları güncelle, konum bilgilerini dokunma
        let updatedRestaurant;
        
        // Eğer şifre verilmişse şifreyi de güncelle
        if (password && password.trim() !== '') {
            // Şifreyi düz metin olarak sakla

            const result = await sql`
                UPDATE restaurants
                SET 
                    name = ${name},
                    yetkili_name = ${yetkili_name},
                    email = ${email},
                    phone = ${phone},
                    password = ${password}
                WHERE id = ${restaurantId}
                RETURNING id, name, email, phone, yetkili_name;
            `;
            updatedRestaurant = result[0];
        } else {

            const result = await sql`
                UPDATE restaurants
                SET 
                    name = ${name},
                    yetkili_name = ${yetkili_name},
                    email = ${email},
                    phone = ${phone}
                WHERE id = ${restaurantId}
                RETURNING id, name, email, phone, yetkili_name;
            `;
            updatedRestaurant = result[0];
        }



        res.json({ success: true, message: 'Restoran başarıyla güncellendi.', restaurant: updatedRestaurant });
    } catch (error) {
        console.error(`Restoran #${restaurantId} güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Restoran güncellenirken sunucu hatası oluştu.' });
    }
};

const deleteRestaurant = async (req, res) => {
    const { restaurantId } = req.params;

    if (!restaurantId) {
        return res.status(400).json({ success: false, message: 'Restoran ID gereklidir.' });
    }

    try {
        // İlişkili kayıtları silin (örneğin restaurant_delivery_prices)
        await sql`DELETE FROM restaurant_delivery_prices WHERE restaurant_id = ${restaurantId}`;
        

        const [deletedRestaurant] = await sql`
            DELETE FROM restaurants
            WHERE id = ${restaurantId}
            RETURNING id, name;
        `;

        if (!deletedRestaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı.' });
        }

        res.json({ success: true, message: 'Restoran başarıyla silindi.', restaurant: deletedRestaurant });
    } catch (error) {
        console.error(`Restoran #${restaurantId} silinirken hata:`, error);
        res.status(500).json({ success: false, message: 'Restoran silinirken sunucu hatası oluştu.' });
    }
};

const updateRestaurantLocation = async (req, res) => {
    const { restaurantId } = req.params;
    const { latitude, longitude } = req.body;

    if (!restaurantId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ success: false, message: 'Restoran ID, enlem ve boylam gereklidir.' });
    }

    try {
        const updatedLocation = await sql`
            UPDATE restaurants
            SET 
                latitude = ${latitude},
                longitude = ${longitude}
            WHERE id = ${restaurantId}
            RETURNING id, latitude, longitude;
        `;

        if (updatedLocation.length === 0) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı.' });
        }

        res.json({ success: true, message: 'Restoran konumu başarıyla güncellendi.', location: updatedLocation[0] });
    } catch (error) {
        console.error(`Restoran #${restaurantId} konumu güncellenirken hata:`, error);
        res.status(500).json({ success: false, message: 'Restoran konumu güncellenirken sunucu hatası oluştu.' });
    }
};

// Tek bir restoranı getir (kurye navigasyon için)
const getRestaurant = async (req, res) => {
    try {
        const { restaurantId } = req.params;

        const [restaurant] = await sql`
            SELECT 
                id,
                name as firma_adi,
                email,
                yetkili_name,
                phone,
                latitude::text AS latitude,
                longitude::text AS longitude
            FROM restaurants 
            WHERE id = ${restaurantId}
        `;

        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı' });
        }

        // Parse latitude and longitude to numbers
        const parsedRestaurant = {
            ...restaurant,
            latitude: parseFloat(restaurant.latitude) || null,
            longitude: parseFloat(restaurant.longitude) || null
        };

        res.status(200).json({ success: true, data: parsedRestaurant });
    } catch (error) {
        console.error('Restoran bilgileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Restoran profil bilgilerini getir
const getRestaurantProfile = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { id: userId, role } = req.user;

        // Sadece kendi profilini görebilir veya admin
        if (role !== 'admin' && parseInt(restaurantId) !== userId) {
            return res.status(403).json({ success: false, message: 'Bu bilgilere erişim yetkiniz yok.' });
        }

        const [restaurant] = await sql`
            SELECT 
                id, name, email, phone, yetkili_name, address,
                logo, created_at, role
            FROM restaurants 
            WHERE id = ${restaurantId}
        `;

        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı' });
        }

        res.status(200).json({ success: true, data: restaurant });
    } catch (error) {
        console.error('Restoran profil bilgileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
};

// Restoran profil bilgilerini güncelle
const updateRestaurantProfile = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { id: userId, role } = req.user;
        const { name, phone, yetkili_name, address } = req.body;

        // Sadece kendi profilini güncelleyebilir veya admin
        if (role !== 'admin' && parseInt(restaurantId) !== userId) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        // Mevcut restoran bilgilerini kontrol et
        const [existingRestaurant] = await sql`
            SELECT * FROM restaurants WHERE id = ${restaurantId}
        `;

        if (!existingRestaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı' });
        }

        // Türkiye saati SQL ifadesini al
        

        // Profil bilgilerini güncelle
        const [updatedRestaurant] = await sql`
            UPDATE restaurants 
            SET 
                name = ${name || existingRestaurant.name},
                phone = ${phone || existingRestaurant.phone},
                yetkili_name = ${yetkili_name || existingRestaurant.yetkili_name},
                address = ${address || existingRestaurant.address}
            WHERE id = ${restaurantId}
            RETURNING id, name, email, phone, yetkili_name, address, logo, created_at, role
        `;

        res.status(200).json({ 
            success: true, 
            data: updatedRestaurant,
            message: 'Profil bilgileri başarıyla güncellendi' 
        });
    } catch (error) {
        console.error('Restoran profil güncellenirken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Profil güncellenirken sunucu hatası oluştu.',
            details: error.message 
        });
    }
};

// Restoran şifresini değiştir
const changeRestaurantPassword = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { id: userId, role } = req.user;
        const { currentPassword, newPassword } = req.body;

        // Sadece kendi şifresini değiştirebilir
        if (role !== 'admin' && parseInt(restaurantId) !== userId) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mevcut şifre ve yeni şifre gereklidir' 
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Yeni şifre en az 6 karakter olmalıdır' 
            });
        }

        // Mevcut restoran bilgilerini al
        const [restaurant] = await sql`
            SELECT id, password FROM restaurants WHERE id = ${restaurantId}
        `;

        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı' });
        }

        // Mevcut şifreyi kontrol et (düz metin karşılaştırması)
        if (restaurant.password !== currentPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mevcut şifre yanlış' 
            });
        }

        // Yeni şifreyi düz metin olarak güncelle
        await sql`
            UPDATE restaurants 
            SET 
                password = ${newPassword}
            WHERE id = ${restaurantId}
        `;

        res.status(200).json({ 
            success: true, 
            message: 'Şifre başarıyla değiştirildi' 
        });
    } catch (error) {
        console.error('Restoran şifresi değiştirilirken hata:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Şifre değiştirilirken sunucu hatası oluştu.',
            details: error.message 
        });
    }
};

// Restoran logosu yükleme fonksiyonu
const uploadRestaurantLogo = async (req, res) => {
    const { restaurantId } = req.params;
    const { id: userId, role } = req.user;

    try {
        // Yetki kontrolü
        if (role !== 'admin' && parseInt(restaurantId) !== userId) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        // Dosya kontrolü
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Logo dosyası gereklidir.' });
        }

        // Dosya türü kontrolü
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Sadece JPEG, PNG ve GIF formatları desteklenir.' 
            });
        }

        // Dosya boyutu kontrolü (5MB)
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({ 
                success: false, 
                message: 'Logo dosyası 5MB\'dan küçük olmalıdır.' 
            });
        }

        const logoPath = `/uploads/${req.file.filename}`;
        

        // Database'i güncelle
        const [updatedRestaurant] = await sql`
            UPDATE restaurants 
            SET 
                logo = ${logoPath}
            WHERE id = ${restaurantId}
            RETURNING id, name, logo
        `;

        if (!updatedRestaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı.' });
        }

        res.json({
            success: true,
            message: 'Logo başarıyla yüklendi.',
            data: {
                id: updatedRestaurant.id,
                name: updatedRestaurant.name,
                logo: updatedRestaurant.logo
            }
        });

    } catch (error) {
        console.error('Logo yükleme hatası:', error);
        res.status(500).json({ success: false, message: 'Logo yüklenirken sunucu hatası oluştu.' });
    }
};

// Restoran logosunu silme fonksiyonu
const deleteRestaurantLogo = async (req, res) => {
    const { restaurantId } = req.params;
    const { id: userId, role } = req.user;

    try {
        // Yetki kontrolü
        if (role !== 'admin' && parseInt(restaurantId) !== userId) {
            return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
        }

        

        // Mevcut logoyu bul
        const [restaurant] = await sql`SELECT logo FROM restaurants WHERE id = ${restaurantId}`;
        
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restoran bulunamadı.' });
        }

        // Database'den logoyu kaldır
        await sql`
            UPDATE restaurants 
            SET 
                logo = NULL
            WHERE id = ${restaurantId}
        `;

        // Dosyayı fiziksel olarak sil (isteğe bağlı)
        if (restaurant.logo) {
            const fs = require('fs');
            const path = require('path');
            const logoPath = path.join(__dirname, '../../', restaurant.logo);
            
            fs.unlink(logoPath, (err) => {

            });
        }

        res.json({
            success: true,
            message: 'Logo başarıyla silindi.'
        });

    } catch (error) {
        console.error('Logo silme hatası:', error);
        res.status(500).json({ success: false, message: 'Logo silinirken sunucu hatası oluştu.' });
    }
};

module.exports = {
    getAllRestaurants,
    getRestaurant,
    loginRestaurant,
    getRestaurantNeighborhoods,
    addDeliveryArea,
    updateDeliveryArea,
    deleteDeliveryArea,
    toggleDeliveryAvailability,
    addRestaurant,
    updateRestaurant,
    deleteRestaurant,
    updateRestaurantLocation,
    authenticateRestaurant,
    getRestaurantProfile,
    updateRestaurantProfile,
    changeRestaurantPassword,
    uploadRestaurantLogo,
    deleteRestaurantLogo
}; 