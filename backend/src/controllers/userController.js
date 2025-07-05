const { executeQuery } = require('../config/db-config');
const { sql } = require('../config/db-config');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { generateToken } = require('../config/auth');

// This is a unified login handler with bcrypt support
const unifiedLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email/Telefon ve şifre gerekli.' });
        }

        // Check if input is phone number or email
        const isPhoneNumber = /^[\d\s\-\+\(\)]+$/.test(email.replace(/\s/g, ''));
        
        // Check restaurants first
        let restaurants = [];
        if (isPhoneNumber) {
            restaurants = await sql`
                SELECT id, name as restaurant_name, email, phone, password FROM restaurants 
                WHERE phone = ${email} OR phone = ${email.replace(/\s/g, '')}
            `;
        } else {
            restaurants = await sql`
                SELECT id, name as restaurant_name, email, phone, password FROM restaurants 
                WHERE email = ${email}
            `;
        }

        if (restaurants.length > 0) {
            const restaurant = restaurants[0];

            // Verify password with bcrypt
            const isPasswordCorrect = await bcrypt.compare(password, restaurant.password);
            if (isPasswordCorrect) {
                const user = {
                    id: restaurant.id,
                    name: restaurant.restaurant_name,
                    email: restaurant.email,
                    phone: restaurant.phone,
                    role: 'restaurant'
                };

                const token = generateToken(user, 'restaurant');

                return res.status(200).json({
                    success: true,
                    message: 'Restoran girişi başarılı',
                    token,
                    user
                });
            }
        }

        // Check couriers
        let couriers = [];
        if (isPhoneNumber) {
            couriers = await sql`
                SELECT id, name as courier_name, email, phone, phone_number, password FROM couriers 
                WHERE phone = ${email} OR phone_number = ${email} OR phone = ${email.replace(/\s/g, '')} OR phone_number = ${email.replace(/\s/g, '')}
            `;
        } else {
            couriers = await sql`
                SELECT id, name as courier_name, email, phone, phone_number, password FROM couriers 
                WHERE email = ${email}
            `;
        }

        if (couriers.length > 0) {
            const courier = couriers[0];

            // Verify password with bcrypt
            const isPasswordCorrect = await bcrypt.compare(password, courier.password);
            if (isPasswordCorrect) {
                const user = {
                    id: courier.id,
                    name: courier.courier_name,
                    email: courier.email,
                    phone: courier.phone || courier.phone_number,
                    role: 'courier'
                };

                const token = generateToken(user, 'courier');

                return res.status(200).json({
                    success: true,
                    message: 'Kurye girişi başarılı',
                    token,
                    user
                });
            }
        }

        return res.status(401).json({
            success: false,
            message: 'Geçersiz email/telefon veya şifre'
        });

    } catch (error) {
        console.error('Birleşik giriş sırasında hata:', error);
        return res.status(500).json({ success: false, message: 'Giriş sırasında sunucu hatası oluştu.' });
    }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Telefon ve şifre gerekli'
      });
    }

    // Check if input is phone number or email
    const isPhoneNumber = /^[\d\s\-\+\(\)]+$/.test(email.replace(/\s/g, ''));

    // Check restaurants first
    let restaurantRecords = [];
    if (isPhoneNumber) {
      // Search by phone number
      restaurantRecords = await sql`
        SELECT 
          id, 
          name, 
          email, 
          phone,
          password,
          'restaurant' as role 
        FROM restaurants 
        WHERE phone = ${email} OR phone = ${email.replace(/\s/g, '')}
      `;
    } else {
      // Search by email
      restaurantRecords = await sql`
        SELECT 
          id, 
          name, 
          email, 
          phone,
          password,
          'restaurant' as role 
        FROM restaurants 
        WHERE email = ${email}
      `;
    }
    
    if (restaurantRecords.length > 0) {
      const restaurant = restaurantRecords[0];
      
      // Verify password
      const isPasswordCorrect = await bcrypt.compare(password, restaurant.password);
      if (isPasswordCorrect) {
        // Generate JWT token
        const user = {
          id: restaurant.id,
          email: restaurant.email,
          name: restaurant.name,
          phone: restaurant.phone,
          role: 'restaurant'
        };
        
        const token = generateToken(user, 'restaurant');
        
        return res.status(200).json({
          success: true,
          message: 'Giriş başarılı',
          token,
          user
        });
      }
    }

    // Check couriers
    let courierRecords = [];
    if (isPhoneNumber) {
      // Search by phone number (check both phone and phone_number columns)
      courierRecords = await sql`
        SELECT 
          id, 
          name, 
          email, 
          phone,
          phone_number,
          password,
          'courier' as role 
        FROM couriers 
        WHERE phone = ${email} OR phone_number = ${email} OR phone = ${email.replace(/\s/g, '')} OR phone_number = ${email.replace(/\s/g, '')}
      `;
    } else {
      // Search by email
      courierRecords = await sql`
        SELECT 
          id, 
          name, 
          email, 
          phone,
          phone_number,
          password,
          'courier' as role 
        FROM couriers 
        WHERE email = ${email}
      `;
    }
    
    if (courierRecords.length > 0) {
      const courier = courierRecords[0];
      
      // Verify password
      const isPasswordCorrect = await bcrypt.compare(password, courier.password);
      if (isPasswordCorrect) {
        // Generate JWT token
        const user = {
          id: courier.id,
          email: courier.email,
          name: courier.name,
          phone: courier.phone || courier.phone_number,
          role: 'courier'
        };
        
        const token = generateToken(user, 'courier');
        
        return res.status(200).json({
          success: true,
          message: 'Giriş başarılı',
          token,
          user
        });
      }
    }

    return res.status(401).json({
      success: false,
      message: 'Geçersiz email/telefon veya şifre'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

module.exports = {
    unifiedLogin,
    loginUser
}; 