const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Backend root directory'yi belirle
const BACKEND_ROOT = path.resolve(__dirname, '../..');

// Upload klasörünü oluştur
const uploadDir = path.join(BACKEND_ROOT, 'uploads', 'orders');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Benzersiz dosya adı oluştur
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Dosya filtreleme - sadece resim dosyaları (iOS HEIC/HEIF desteği dahil)
const fileFilter = (req, file, cb) => {
  try {
    const mime = (file.mimetype || '').toLowerCase();
    // Genel image/* kabul et (sunucu tarafında boyut ve rota kontrolü mevcut)
    const isImage = mime.startsWith('image/');
    // Özellikle iOS HEIC/HEIF formatlarını destekle
    const allowedExtra = ['image/heic', 'image/heif', 'image/heif-sequence', 'image/heic-sequence'];
    if (isImage || allowedExtra.includes(mime)) {
      return cb(null, true);
    }
    return cb(new Error('Sadece resim dosyaları yüklenebilir! (JPEG, PNG, WebP, GIF, HEIC/HEIF)'), false);
  } catch (e) {
    return cb(new Error('Dosya türü doğrulanamadı'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    // Mobil fotoğraflar için limiti artır (10MB)
    fileSize: 10 * 1024 * 1024
  }
});

// Test endpoint to debug incoming requests
router.post('/test-upload', (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint reached',
    headers: req.headers,
    body: req.body,
    hasFiles: !!req.files,
    contentType: req.get('content-type')
  });
});

// Upload endpoint'i - API constants ile uyumlu
router.post('/uploadImage', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resim dosyası gerekli'
      });
    }

    const filename = req.file.filename;
    // Use appropriate server URL based on environment
    const currentHost = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const baseUrl = currentHost.includes('localhost') 
      ? `http://${currentHost}`
      : `${protocol}://${currentHost}`;
    
    const imageUrl = `${baseUrl}/uploads/orders/${filename}`;

    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('📷 Resim yüklendi:', imageUrl);
    }

    res.status(200).json({
      success: true,
      message: 'Resim başarıyla yüklendi',
      imageUrl: imageUrl,
      filename: filename
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Resim yükleme hatası'
    });
  }
});

// Upload endpoint'i - eski sistem ile uyumluluk için
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resim dosyası gerekli'
      });
    }

    const filename = req.file.filename;
    // Use appropriate server URL based on environment
    const currentHost = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const baseUrl = currentHost.includes('localhost') 
      ? `http://${currentHost}`
      : `${protocol}://${currentHost}`;
    
    const imageUrl = `${baseUrl}/uploads/orders/${filename}`;

    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('📷 Resim yüklendi:', imageUrl);
    }

    res.status(200).json({
      success: true,
      message: 'Resim başarıyla yüklendi',
      imageUrl: imageUrl,
      filename: filename
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Resim yükleme hatası'
    });
  }
});

// Çoklu resim upload endpoint'i
router.post('/upload-multiple', upload.array('images', 10), (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Resim dosyası bulunamadı!'
      });
    }

    // Use appropriate server URL based on environment
    const currentHost = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const baseUrl = currentHost.includes('localhost') 
      ? `http://${currentHost}`
      : `${protocol}://${currentHost}`;

    const uploadedImages = files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      url: `${baseUrl}/uploads/orders/${file.filename}`,
      uploadDate: new Date().toLocaleString('tr-TR')
    }));

    res.json({
      success: true,
      message: `${files.length} resim başarıyla yüklendi!`,
      data: uploadedImages
    });

  } catch (error) {
    console.error('Multiple upload hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Resimler yüklenirken hata oluştu!'
    });
  }
});

// Resim silme endpoint'i
router.delete('/delete/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Dosya adı gerekli'
      });
    }

    const filePath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      
      if (process.env.NODE_ENV !== 'production') {
        // Image deleted successfully
      }
      
      res.status(200).json({
        success: true,
        message: 'Resim başarıyla silindi'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Dosya bulunamadı'
      });
    }

  } catch (error) {
    console.error('Image delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Resim silme hatası'
    });
  }
});

// Hata yakalama middleware'i
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Dosya boyutu çok büyük! Maksimum 5MB olmalı.'
      });
    }
  }
  
  res.status(400).json({
    success: false,
    message: error.message || 'Bilinmeyen hata oluştu!'
  });
});

module.exports = router; 