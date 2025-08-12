const jwt = require('jsonwebtoken');
const { verifyToken } = require('../config/auth');
const SessionService = require('../services/sessionService');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({ success: false, message: 'Yetkisiz erişim, token bulunamadı.' });
            }

            // Verify token using centralized auth config
            const decoded = verifyToken(token);

            // Session validation - check if session is still active
            const session = await SessionService.validateSession(token);
            
            if (!session) {
                console.warn(`⚠️ Session bulunamadı veya expire olmuş - Token: ${token.substring(0, 10)}...`);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın.',
                    shouldLogout: true,
                    code: 'SESSION_EXPIRED'
                });
            }

            // Attach user to the request
            req.user = decoded; // Contains { id, name, role, aud, iss, etc. }
            req.session = session; // Session bilgilerini de ekle
            
            return next();
        } catch (error) {
            console.warn(`⚠️ Token doğrulama hatası:`, error.message);
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Token süresi dolmuş, lütfen tekrar giriş yapın.',
                    shouldLogout: true,
                    code: 'TOKEN_EXPIRED'
                });
            } else if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Geçersiz token.',
                    shouldLogout: true,
                    code: 'INVALID_TOKEN'
                });
            } else {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Yetkisiz erişim, token geçersiz.',
                    shouldLogout: true,
                    code: 'AUTH_ERROR'
                });
            }
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim, token bulunamadı.' });
    }
};

// Role-based authorization middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Yetkilendirme için önce giriş yapın.' });
        }

        const userRole = req.user.role || req.user.aud;
        
        if (!roles.includes(userRole)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Bu işlem için yetkiniz yok.',
                requiredRoles: roles,
                userRole: userRole
            });
        }

        next();
    };
};

module.exports = { protect, authorize }; 