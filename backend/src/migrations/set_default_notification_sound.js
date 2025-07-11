const { sql } = require('../config/db-config');
const fs = require('fs');
const path = require('path');

const setDefaultNotificationSound = async () => {
    try {
        console.log('🔊 Varsayılan bildirim sesi ayarlanıyor...');
        
        // Önce mevcut default ses varsa pasif yap
        await sql`
            UPDATE notification_sounds 
            SET is_default = false, is_active = false 
            WHERE is_default = true
        `;
        
        // WAV dosyasının var olup olmadığını kontrol et
        const soundPath = '/sounds/default-notification.wav';
        const fullPath = path.join(__dirname, '../../public', soundPath);
        
        // Eğer frontend'teki wav dosyası varsa kopyala
        const frontendSoundPath = path.join(__dirname, '../../../assets/sounds/default-notification.wav');
        const backendSoundsDir = path.join(__dirname, '../../public/sounds');
        
        // Backend sounds dizinini oluştur
        if (!fs.existsSync(backendSoundsDir)) {
            fs.mkdirSync(backendSoundsDir, { recursive: true });
        }
        
        // Frontend'ten backend'e kopyala
        if (fs.existsSync(frontendSoundPath)) {
            try {
                fs.copyFileSync(frontendSoundPath, fullPath);
                console.log('✅ WAV dosyası backend/public/sounds/ klasörüne kopyalandı');
            } catch (copyError) {
                console.log('⚠️ Dosya kopyalama hatası:', copyError.message);
            }
        }
        
        // Veritabanında varsayılan ses kaydı oluştur veya güncelle
        const [existingSound] = await sql`
            SELECT id FROM notification_sounds 
            WHERE file_path = ${soundPath}
            LIMIT 1
        `;
        
        if (existingSound) {
            // Mevcut kayıt varsa güncelle
            await sql`
                UPDATE notification_sounds 
                SET is_default = true, is_active = true, name = 'Varsayılan Bildirim Sesi'
                WHERE id = ${existingSound.id}
            `;
            console.log('✅ Mevcut ses kaydı varsayılan olarak güncellendi');
        } else {
            // Yeni kayıt oluştur
            await sql`
                INSERT INTO notification_sounds (name, file_path, file_size, file_type, is_active, is_default)
                VALUES (
                    'Varsayılan Bildirim Sesi', 
                    ${soundPath}, 
                    ${fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0}, 
                    'audio/wav', 
                    true, 
                    true
                )
            `;
            console.log('✅ Yeni varsayılan ses kaydı oluşturuldu');
        }
        
        console.log('🎵 Varsayılan bildirim sesi başarıyla ayarlandı: default-notification.wav');
        
        return true;
    } catch (error) {
        console.error('❌ Varsayılan bildirim sesi ayarlanırken hata:', error);
        throw error;
    }
};

module.exports = setDefaultNotificationSound; 