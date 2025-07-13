const { sql } = require('../config/db-config');

/**
 * Restaurant ve kurye telefon numaralarını benzersiz yapmak için migration
 * Aynı telefon numaralarını bulup benzersiz hale getirir
 */
async function fixDuplicatePhoneNumbers() {
    try {
        console.log('📱 Telefon numaralarının benzersizliği kontrol ediliyor...');

        // 1. Önce mevcut durumu kontrol et
        console.log('🔍 Mevcut telefon numaraları analiz ediliyor...');
        
        // Restaurant telefon numaralarını al
        const restaurantPhones = await sql`
            SELECT id, name, phone, email 
            FROM restaurants 
            WHERE phone IS NOT NULL AND phone != ''
            ORDER BY phone, id
        `;
        
        // Kurye telefon numaralarını al (hem phone hem phone_number alanları)
        const courierPhones = await sql`
            SELECT id, name, phone, phone_number, email 
            FROM couriers 
            WHERE (phone IS NOT NULL AND phone != '') OR (phone_number IS NOT NULL AND phone_number != '')
            ORDER BY COALESCE(phone, phone_number), id
        `;

        console.log(`📊 ${restaurantPhones.length} restoran telefon numarası bulundu`);
        console.log(`📊 ${courierPhones.length} kurye telefon numarası bulundu`);

        // 2. Çakışan telefon numaralarını bul
        const phoneMap = new Map();
        const conflicts = [];

        // Restoran telefon numaralarını map'e ekle
        restaurantPhones.forEach(restaurant => {
            if (restaurant.phone) {
                const cleanPhone = restaurant.phone.replace(/\s+/g, '').trim();
                if (!phoneMap.has(cleanPhone)) {
                    phoneMap.set(cleanPhone, []);
                }
                phoneMap.get(cleanPhone).push({
                    type: 'restaurant',
                    id: restaurant.id,
                    name: restaurant.name,
                    email: restaurant.email,
                    phone: restaurant.phone
                });
            }
        });

        // Kurye telefon numaralarını map'e ekle
        courierPhones.forEach(courier => {
            // phone alanını kontrol et
            if (courier.phone) {
                const cleanPhone = courier.phone.replace(/\s+/g, '').trim();
                if (!phoneMap.has(cleanPhone)) {
                    phoneMap.set(cleanPhone, []);
                }
                phoneMap.get(cleanPhone).push({
                    type: 'courier',
                    id: courier.id,
                    name: courier.name,
                    email: courier.email,
                    phone: courier.phone
                });
            }
            
            // phone_number alanını kontrol et
            if (courier.phone_number && courier.phone_number !== courier.phone) {
                const cleanPhone = courier.phone_number.replace(/\s+/g, '').trim();
                if (!phoneMap.has(cleanPhone)) {
                    phoneMap.set(cleanPhone, []);
                }
                phoneMap.get(cleanPhone).push({
                    type: 'courier',
                    id: courier.id,
                    name: courier.name,
                    email: courier.email,
                    phone: courier.phone_number
                });
            }
        });

        // 3. Çakışan numaraları tespit et
        phoneMap.forEach((users, phone) => {
            if (users.length > 1) {
                conflicts.push({
                    phone: phone,
                    users: users
                });
            }
        });

        if (conflicts.length === 0) {
            console.log('✅ Çakışan telefon numarası bulunamadı, tüm numaralar benzersiz!');
            return;
        }

        console.log(`⚠️  ${conflicts.length} çakışan telefon numarası bulundu:`);
        conflicts.forEach((conflict, index) => {
            console.log(`${index + 1}. Telefon: ${conflict.phone}`);
            conflict.users.forEach(user => {
                console.log(`   - ${user.type}: ${user.name} (ID: ${user.id}, Email: ${user.email})`);
            });
        });

        // 4. Çakışan numaraları düzelt
        console.log('🔧 Çakışan telefon numaraları düzeltiliyor...');
        
        let fixedCount = 0;
        
        for (const conflict of conflicts) {
            // İlk kullanıcı orijinal numarayı tutar, diğerleri düzeltilir
            const [firstUser, ...otherUsers] = conflict.users;
            
            console.log(`📱 ${conflict.phone} numarasını düzeltiliyor...`);
            console.log(`   ✅ ${firstUser.name} (${firstUser.type}) orijinal numarayı tutuyor`);
            
            for (let i = 0; i < otherUsers.length; i++) {
                const user = otherUsers[i];
                const basePhone = conflict.phone;
                
                // Benzersiz numara oluştur
                let newPhone = basePhone;
                let suffix = 1;
                
                // Yeni numara benzersiz olana kadar dene
                while (phoneMap.has(newPhone)) {
                    // Son 2 rakamı değiştir
                    const prefix = basePhone.slice(0, -2);
                    const lastTwoDigits = parseInt(basePhone.slice(-2));
                    const newLastTwo = String((lastTwoDigits + suffix) % 100).padStart(2, '0');
                    newPhone = prefix + newLastTwo;
                    suffix++;
                    
                    // Eğer 100 deneme sonrası bulunamazsa random suffix ekle
                    if (suffix > 100) {
                        const randomSuffix = Math.floor(Math.random() * 100);
                        newPhone = basePhone + randomSuffix;
                        break;
                    }
                }
                
                // Veritabanında güncelle
                if (user.type === 'restaurant') {
                    await sql`
                        UPDATE restaurants 
                        SET phone = ${newPhone}
                        WHERE id = ${user.id}
                    `;
                } else if (user.type === 'courier') {
                    // Kurye için hangi alanın güncellendiğini kontrol et
                    const [courierData] = await sql`
                        SELECT phone, phone_number FROM couriers WHERE id = ${user.id}
                    `;
                    
                    if (courierData.phone === user.phone) {
                        await sql`
                            UPDATE couriers 
                            SET phone = ${newPhone}
                            WHERE id = ${user.id}
                        `;
                    } else if (courierData.phone_number === user.phone) {
                        await sql`
                            UPDATE couriers 
                            SET phone_number = ${newPhone}
                            WHERE id = ${user.id}
                        `;
                    }
                }
                
                console.log(`   🔄 ${user.name} (${user.type}) numarası ${user.phone} -> ${newPhone}`);
                phoneMap.set(newPhone, [user]);
                fixedCount++;
            }
        }

        console.log(`✅ ${fixedCount} telefon numarası başarıyla düzeltildi`);

        // 5. Benzersizlik constraint'leri ekle (isteğe bağlı)
        console.log('🔒 Benzersizlik constraint\'leri kontrol ediliyor...');
        
        try {
            // Restaurant phone unique constraint
            await sql`
                ALTER TABLE restaurants 
                ADD CONSTRAINT unique_restaurant_phone 
                UNIQUE (phone)
            `;
            console.log('✅ Restoran telefon numarası benzersizlik constraint\'i eklendi');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️  Restoran telefon numarası benzersizlik constraint\'i zaten mevcut');
            } else {
                console.log('⚠️  Restoran telefon numarası constraint eklenirken hata:', error.message);
            }
        }

        try {
            // Courier phone unique constraint
            await sql`
                ALTER TABLE couriers 
                ADD CONSTRAINT unique_courier_phone 
                UNIQUE (phone)
            `;
            console.log('✅ Kurye telefon numarası benzersizlik constraint\'i eklendi');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('ℹ️  Kurye telefon numarası benzersizlik constraint\'i zaten mevcut');
            } else {
                console.log('⚠️  Kurye telefon numarası constraint eklenirken hata:', error.message);
            }
        }

        // 6. Final kontrol
        console.log('🔍 Final kontrol yapılıyor...');
        const finalCheck = await sql`
            SELECT 
                'restaurant' as type,
                phone,
                COUNT(*) as count
            FROM restaurants 
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone
            HAVING COUNT(*) > 1
            
            UNION ALL
            
            SELECT 
                'courier' as type,
                phone,
                COUNT(*) as count
            FROM couriers 
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone
            HAVING COUNT(*) > 1
        `;

        if (finalCheck.length === 0) {
            console.log('✅ Tüm telefon numaraları artık benzersiz!');
        } else {
            console.log('⚠️  Hala çakışan telefon numaraları var:', finalCheck);
        }

    } catch (error) {
        console.error('❌ Telefon numarası düzeltme hatası:', error);
        throw error;
    }
}

module.exports = { fixDuplicatePhoneNumbers };

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    fixDuplicatePhoneNumbers()
        .then(() => {
            console.log('✅ Migration tamamlandı');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration hatası:', error);
            process.exit(1);
        });
} 