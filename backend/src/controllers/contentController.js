const { pool } = require('../config/db-config');

// Content pages'leri getir
const getContentPages = async (req, res) => {
  try {
    const query = `
      SELECT id, page_type, title, content, is_active, created_at, updated_at
      FROM content_pages 
      ORDER BY page_type ASC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get content pages error:', error);
    res.status(500).json({
      success: false,
      message: 'İçerik sayfaları getirilemedi'
    });
  }
};

// Belirli bir content page getir
const getContentPage = async (req, res) => {
  try {
    const { pageType } = req.params;
    
    const query = `
      SELECT id, page_type, title, content, is_active, created_at, updated_at
      FROM content_pages 
      WHERE page_type = $1
    `;
    
    const result = await pool.query(query, [pageType]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'İçerik sayfası bulunamadı'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get content page error:', error);
    res.status(500).json({
      success: false,
      message: 'İçerik sayfası getirilemedi'
    });
  }
};

// Yeni content page oluştur
const createContentPage = async (req, res) => {
  try {
    const { page_type, title, content, is_active = true } = req.body;
    
    // Validation
    if (!page_type || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Sayfa tipi, başlık ve içerik gereklidir'
      });
    }
    
    // Check if page_type already exists
    const existingCheck = await pool.query(
      'SELECT id FROM content_pages WHERE page_type = $1',
      [page_type]
    );
    
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu sayfa tipi zaten mevcut'
      });
    }
    
    const query = `
      INSERT INTO content_pages (page_type, title, content, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, page_type, title, content, is_active, created_at, updated_at
    `;
    
    const result = await pool.query(query, [page_type, title, content, is_active]);
    
    res.status(201).json({
      success: true,
      message: 'İçerik sayfası başarıyla oluşturuldu',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create content page error:', error);
    res.status(500).json({
      success: false,
      message: 'İçerik sayfası oluşturulamadı'
    });
  }
};

// Content page güncelle
const updateContentPage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_active } = req.body;
    
    // Validation
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Başlık ve içerik gereklidir'
      });
    }
    
    const query = `
      UPDATE content_pages 
      SET title = $1, content = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, page_type, title, content, is_active, created_at, updated_at
    `;
    
    const result = await pool.query(query, [title, content, is_active, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'İçerik sayfası bulunamadı'
      });
    }
    
    res.json({
      success: true,
      message: 'İçerik sayfası başarıyla güncellendi',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update content page error:', error);
    res.status(500).json({
      success: false,
      message: 'İçerik sayfası güncellenemedi'
    });
  }
};

// Content page sil
const deleteContentPage = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = 'DELETE FROM content_pages WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'İçerik sayfası bulunamadı'
      });
    }
    
    res.json({
      success: true,
      message: 'İçerik sayfası başarıyla silindi'
    });
  } catch (error) {
    console.error('Delete content page error:', error);
    res.status(500).json({
      success: false,
      message: 'İçerik sayfası silinemedi'
    });
  }
};

// Aktif content page'leri getir (mobil uygulama için)
const getActiveContentPages = async (req, res) => {
  try {
    const query = `
      SELECT page_type, title, content
      FROM content_pages 
      WHERE is_active = true
      ORDER BY page_type ASC
    `;
    
    const result = await pool.query(query);
    
    // Convert to object for easier access
    const contentPages = {};
    result.rows.forEach(page => {
      contentPages[page.page_type] = {
        title: page.title,
        content: page.content
      };
    });
    
    res.json({
      success: true,
      data: contentPages
    });
  } catch (error) {
    console.error('Get active content pages error:', error);
    res.status(500).json({
      success: false,
      message: 'Aktif içerik sayfaları getirilemedi'
    });
  }
};

module.exports = {
  getContentPages,
  getContentPage,
  createContentPage,
  updateContentPage,
  deleteContentPage,
  getActiveContentPages
};
