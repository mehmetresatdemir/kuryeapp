const { executeQuery } = require('../config/db-config');
const { sql } = require('../config/db-config');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { generateToken } = require('../config/auth');
const { sendPasswordResetEmail } = require('../utils/emailUtils');
const crypto = require('crypto');
const SessionService = require('../services/sessionService');

// This is a unified login handler with bcrypt support and session management
const unifiedLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email/Telefon ve şifre gerekli.' });
        }

        // Get device info and IP address
        const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
        const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown IP';

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

            // Verify password with plain text comparison
            if (restaurant.password === password) {
                const user = {
                    id: restaurant.id,
                    name: restaurant.restaurant_name,
                    email: restaurant.email,
                    phone: restaurant.phone,
                    role: 'restaurant'
                };

                const token = generateToken(user, 'restaurant');

                // Session management - önce eski sessionları invalidate et
                const invalidatedSessions = await SessionService.invalidateUserSessions(user.id, 'restaurant');
                
                // Yeni session oluştur
                await SessionService.createSession(user.id, 'restaurant', token, deviceInfo, ipAddress);

                // Socket.io ile diğer oturumlara logout sinyali gönder
                if (invalidatedSessions.length > 0) {
                    const io = req.app.get('io');
                    if (io) {
                        invalidatedSessions.forEach(session => {
                            if (session.socket_id) {
                                io.to(session.socket_id).emit('forceLogout', {
                                    reason: 'CONCURRENT_SESSION',
                                    message: 'Hesabınıza başka bir cihazdan giriş yapıldı. Güvenlik nedeniyle çıkış yapılıyor.'
                                });
                            }
                        });
                        
                        // Genel restaurant odasına da bildir
                        io.to(`restaurant_${user.id}`).emit('forceLogout', {
                            reason: 'CONCURRENT_SESSION',
                            message: 'Hesabınıza başka bir cihazdan giriş yapıldı. Güvenlik nedeniyle çıkış yapılıyor.'
                        });
                    }
                }

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
                SELECT id, name as courier_name, email, phone, password FROM couriers 
                WHERE phone = ${email} OR phone = ${email.replace(/\s/g, '')}
            `;
        } else {
            couriers = await sql`
                SELECT id, name as courier_name, email, phone, password FROM couriers 
                WHERE email = ${email}
            `;
        }

        if (couriers.length > 0) {
            const courier = couriers[0];

            // Verify password with plain text comparison
            if (courier.password === password) {
                const user = {
                    id: courier.id,
                    name: courier.courier_name,
                    email: courier.email,
                    phone: courier.phone,
                    role: 'courier'
                };

                const token = generateToken(user, 'courier');

                // Session management - önce eski sessionları invalidate et
                const invalidatedSessions = await SessionService.invalidateUserSessions(user.id, 'courier');
                
                // Yeni session oluştur
                await SessionService.createSession(user.id, 'courier', token, deviceInfo, ipAddress);

                // Socket.io ile diğer oturumlara logout sinyali gönder
                if (invalidatedSessions.length > 0) {
                    const io = req.app.get('io');
                    if (io) {
                        invalidatedSessions.forEach(session => {
                            if (session.socket_id) {
                                io.to(session.socket_id).emit('forceLogout', {
                                    reason: 'CONCURRENT_SESSION',
                                    message: 'Hesabınıza başka bir cihazdan giriş yapıldı. Güvenlik nedeniyle çıkış yapılıyor.'
                                });
                            }
                        });
                        
                        // Genel courier odasına da bildir
                        io.to(`courier_${user.id}`).emit('forceLogout', {
                            reason: 'CONCURRENT_SESSION',
                            message: 'Hesabınıza başka bir cihazdan giriş yapıldı. Güvenlik nedeniyle çıkış yapılıyor.'
                        });
                    }
                }

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
      
      // Verify password with plain text comparison
      if (restaurant.password === password) {
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
      // Search by phone number
      courierRecords = await sql`
        SELECT 
          id, 
          name, 
          email, 
          phone,
          password,
          'courier' as role 
        FROM couriers 
        WHERE phone = ${email} OR phone = ${email.replace(/\s/g, '')}
      `;
    } else {
      // Search by email
      courierRecords = await sql`
        SELECT 
          id, 
          name, 
          email, 
          phone,
          password,
          'courier' as role 
        FROM couriers 
        WHERE email = ${email}
      `;
    }
    
    if (courierRecords.length > 0) {
      const courier = courierRecords[0];
      
      // Verify password with plain text comparison
      if (courier.password === password) {
        // Generate JWT token
        const user = {
          id: courier.id,
          email: courier.email,
          name: courier.name,
          phone: courier.phone,
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

// Şifre sıfırlama talebi
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'E-posta adresi gerekli' 
            });
        }

        // E-posta formatını kontrol et
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Geçerli bir e-posta adresi girin' 
            });
        }

        // Önce kurye tablosunda ara
        const courier = await sql`
            SELECT id, name, email FROM couriers WHERE email = ${email}
        `;

        // Sonra restoran tablosunda ara
        const restaurant = await sql`
            SELECT id, name, email FROM restaurants WHERE email = ${email}
        `;

        if (courier.length === 0 && restaurant.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı' 
            });
        }

        // Rastgele token oluştur
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 saat sonra
        
        let userType = '';
        let userName = '';

        if (courier.length > 0) {
            userType = 'courier';
            userName = courier[0].name;
        } else {
            userType = 'restaurant';
            userName = restaurant[0].name;
        }

        // Eski token'ları temizle
        await sql`
            DELETE FROM password_reset_tokens 
            WHERE email = ${email} AND expires_at < NOW()
        `;

        // Yeni token'ı kaydet
        await sql`
            INSERT INTO password_reset_tokens (email, token, user_type, expires_at)
            VALUES (${email}, ${resetToken}, ${userType}, ${expiresAt})
        `;

        // E-posta gönder
        const emailResult = await sendPasswordResetEmail(email, resetToken, userType);

        if (emailResult.success) {
            return res.status(200).json({
                success: true,
                message: 'Şifre sıfırlama e-postası gönderildi. Lütfen e-posta kutunuzu kontrol edin.'
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.'
            });
        }

    } catch (error) {
        console.error('Şifre sıfırlama talebi hatası:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası oluştu' 
        });
    }
};

// Şifre sıfırlama
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token ve yeni şifre gerekli' 
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Şifre en az 6 karakter olmalıdır' 
            });
        }

        // Token'ı kontrol et
        const resetTokenRecord = await sql`
            SELECT * FROM password_reset_tokens 
            WHERE token = ${token} AND expires_at > NOW() AND used = false
        `;

        if (resetTokenRecord.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Geçersiz veya süresi dolmuş token' 
            });
        }

        const tokenData = resetTokenRecord[0];

        // Şifreyi güncelle
        if (tokenData.user_type === 'courier') {
            await sql`
                UPDATE couriers 
                SET password = ${newPassword}, updated_at = NOW() 
                WHERE email = ${tokenData.email}
            `;
        } else if (tokenData.user_type === 'restaurant') {
            await sql`
                UPDATE restaurants 
                SET password = ${newPassword}, updated_at = NOW() 
                WHERE email = ${tokenData.email}
            `;
        }

        // Token'ı kullanıldı olarak işaretle
        await sql`
            UPDATE password_reset_tokens 
            SET used = true 
            WHERE token = ${token}
        `;

        return res.status(200).json({
            success: true,
            message: 'Şifre başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.'
        });

    } catch (error) {
        console.error('Şifre sıfırlama hatası:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Sunucu hatası oluştu' 
    });
  }
};

// Logout function with session management
const logout = async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token gerekli' 
            });
        }

        // Session'ı invalidate et
        const invalidatedSession = await SessionService.invalidateSession(token);
        
        if (invalidatedSession) {
            console.log(`🔐 Kullanıcı çıkış yaptı - User: ${invalidatedSession.user_id}, Role: ${invalidatedSession.user_role}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Çıkış başarılı'
        });

    } catch (error) {
        console.error('Çıkış sırasında hata:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Çıkış sırasında sunucu hatası oluştu' 
        });
    }
};

module.exports = {
    unifiedLogin,
    loginUser,
    requestPasswordReset,
    resetPassword,
    logout
}; 