const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Uploads klasörünü oluştur eğer yoksa
const uploadsDir = path.join(__dirname, '../../uploads/orders');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Unique filename: timestamp + original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, 'order-' + uniqueSuffix + extension);
    }
});

// File filter - sadece resim dosyalarını kabul et (HEIC/HEIF desteği dahil)
const fileFilter = (req, file, cb) => {
    try {
        const mime = (file.mimetype || '').toLowerCase();
        const isImage = mime.startsWith('image/');
        const allowedExtra = ['image/heic', 'image/heif', 'image/heif-sequence', 'image/heic-sequence'];
        if (isImage || allowedExtra.includes(mime)) {
            return cb(null, true);
        }
        return cb(new Error('Sadece resim dosyaları kabul edilir! (JPEG, PNG, WebP, GIF, HEIC/HEIF)'), false);
    } catch (e) {
        return cb(new Error('Dosya türü doğrulanamadı'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        // Mobil fotoğraflar için 10MB
        fileSize: 10 * 1024 * 1024
    }
});

module.exports = upload; 