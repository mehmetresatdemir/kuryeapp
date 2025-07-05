const jwt = require('jsonwebtoken');
const { verifyToken } = require('../config/auth');

const protect = (req, res, next) => {
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

            // Attach user to the request
            req.user = decoded; // Contains { id, name, role, aud, iss, etc. }
            
            return next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, message: 'Token süresi dolmuş, lütfen tekrar giriş yapın.' });
            } else if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ success: false, message: 'Geçersiz token.' });
            } else {
                return res.status(401).json({ success: false, message: 'Yetkisiz erişim, token geçersiz.' });
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