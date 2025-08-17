-- Content Pages tablosu oluştur
CREATE TABLE IF NOT EXISTS content_pages (
    id SERIAL PRIMARY KEY,
    page_type VARCHAR(50) UNIQUE NOT NULL, -- 'privacy', 'terms', 'support', 'about', 'contact', 'faq'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index'ler ekle
CREATE INDEX IF NOT EXISTS idx_content_pages_page_type ON content_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_content_pages_is_active ON content_pages(is_active);

-- Varsayılan içerikleri ekle
INSERT INTO content_pages (page_type, title, content) VALUES 
('privacy', 'Gizlilik Politikası', 'Kişisel verilerinizin güvenliği bizim için çok önemlidir. Bu gizlilik politikası, KuryeX uygulamasını kullanırken kişisel bilgilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar.

📱 Toplanan Bilgiler:
• Ad, soyad ve iletişim bilgileri
• Konum bilgileri (teslimat için)
• Uygulama kullanım verileri
• Cihaz bilgileri

🔒 Bilgi Güvenliği:
• Tüm veriler şifrelenerek saklanır
• SSL/TLS protokolleri kullanılır
• Düzenli güvenlik güncellemeleri yapılır

📞 İletişim:
Gizlilik ile ilgili sorularınız için: cresat26@gmail.com'),

('terms', 'Kullanım Koşulları', 'KuryeX uygulamasını kullanarak aşağıdaki koşulları kabul etmiş olursunuz:

⚖️ Kullanım Kuralları:
• Uygulamayı yalnızca yasal amaçlarla kullanınız
• Hesap bilgilerinizi güncel tutunuz
• Şifrenizi kimseyle paylaşmayınız

🚴 Kurye Sorumlulukları:
• Siparişleri zamanında teslim etmek
• Müşterilerle saygılı iletişim kurmak
• Trafik kurallarına uymak

🏪 Restoran Sorumlulukları:
• Sipariş bilgilerini doğru girmek
• Kaliteli hizmet sunmak
• Yasal gerekliliklere uymak

📋 Hesap Askıya Alma:
Kuralları ihlal eden hesaplar askıya alınabilir veya silinebilir.'),

('support', 'Destek', 'KuryeX destek ekibi size yardımcı olmak için burada!

📞 İletişim Bilgileri:
• E-posta: cresat26@gmail.com
• Telefon: 0531 881 39 05
• Çalışma Saatleri: 7/24

🆘 Acil Durumlar:
• Sipariş kaybolması
• Teknik sorunlar
• Hesap güvenliği

📋 Destek Konuları:
• Hesap yönetimi
• Sipariş takibi
• Teknik sorunlar
• Ödeme sorunları

⏰ Yanıt Süreleri:
• E-posta: 24 saat içinde
• Telefon: Anında
• Acil durumlar: 1 saat içinde'),

('about', 'Hakkında', 'KuryeX - Modern Teslimat Çözümü

🚀 Misyonumuz:
Restoranlar ve kuryeler arasında güvenli, hızlı ve verimli bir köprü oluşturmak.

🎯 Vizyonumuz:
Türkiye''nin en güvenilir teslimat platformu olmak.

✨ Özelliklerimiz:
• Gerçek zamanlı sipariş takibi
• Güvenli ödeme sistemi
• 7/24 müşteri desteği
• Kolay kullanım

👥 Ekibimiz:
Deneyimli yazılım geliştiricileri ve alan uzmanlarından oluşan ekibimiz, sürekli olarak uygulamayı geliştirmektedir.

📍 Merkez:
Gaziantep, Türkiye

🔄 Versiyon: 1.0.0'),

('contact', 'İletişim', 'Bizimle İletişime Geçin

📧 E-posta:
cresat26@gmail.com

📱 Telefon:
0531 881 39 05

📍 Adres:
Gaziantep, Türkiye

🕐 Çalışma Saatleri:
• Hafta içi: 24/7
• Hafta sonu: 24/7
• Resmi tatiller: 24/7

💬 Sosyal Medya:
• Instagram: @kuryex_app
• Twitter: @kuryex_official
• Facebook: KuryeX

📮 Posta Adresi:
KuryeX Teknoloji
Gaziantep/Türkiye

🗨️ Geri Bildirim:
Önerilerinizi ve şikayetlerinizi bekliyoruz!'),

('faq', 'Sık Sorulan Sorular', '❓ Sık Sorulan Sorular

🔐 Hesap Yönetimi

S: Hesabımı nasıl güncellerim?
C: Profil sekmesinden bilgilerinizi düzenleyebilirsiniz.

S: Şifremi nasıl değiştiririm?
C: Profil > Şifre Değiştir seçeneğini kullanın.

S: Hesabımı nasıl silerim?
C: Profil > Hesabımı Sil seçeneğinden kalıcı olarak silebilirsiniz.

🚴 Kurye İşlemleri

S: Hangi siparişleri alabilirim?
C: Konum ayarlarınıza göre belirlediğiniz mesafedeki siparişleri alabilirsiniz.

S: Bildirim ayarlarımı nasıl değiştiririm?
C: Profil > Bildirim Tercihleri''nden düzenleyebilirsiniz.

S: Kazancımı nasıl takip ederim?
C: Kazanç sekmesinden detaylı raporlara ulaşabilirsiniz.

🏪 Restoran İşlemleri

S: Sipariş nasıl oluştururum?
C: Ana sayfa > Yeni Sipariş butonunu kullanın.

S: Kurye nasıl bulabilirim?
C: Sistem otomatik olarak uygun kuryeyi bulur ve bildirim gönderir.

📱 Teknik Sorunlar

S: Uygulama açılmıyor ne yapmalıyım?
C: Uygulamayı kapatıp tekrar açmayı deneyin. Sorun devam ederse destek ile iletişime geçin.

S: Bildirimler gelmiyor?
C: Cihaz ayarlarından bildirim izinlerini kontrol edin.')

ON CONFLICT (page_type) DO NOTHING;
