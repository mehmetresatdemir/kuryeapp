const { sql } = require('../config/db-config');

/**
 * Dual role kullanıcıları engellemek için database constraint'leri ekler
 * Aynı ID'nin hem restaurants hem couriers tablosunda olmasını engeller
 */
async function preventDualRoleUsers() {
    try {
        console.log('🚫 Dual role kullanıcıları engellemek için constraint\'ler ekleniyor...');

        // 1. Restaurants tablosuna trigger ekle - courier olarak kayıtlı ID'nin restaurant olmasını engelle
        await sql`
            CREATE OR REPLACE FUNCTION prevent_restaurant_if_courier()
            RETURNS TRIGGER AS $$
            BEGIN
                IF EXISTS (SELECT 1 FROM couriers WHERE id = NEW.id) THEN
                    RAISE EXCEPTION 'Kullanıcı ID % zaten kurye olarak kayıtlı. Aynı kullanıcı hem restoran hem kurye olamaz.', NEW.id;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `;

        await sql`
            DROP TRIGGER IF EXISTS trigger_prevent_restaurant_if_courier ON restaurants;
            CREATE TRIGGER trigger_prevent_restaurant_if_courier
                BEFORE INSERT OR UPDATE ON restaurants
                FOR EACH ROW
                EXECUTE FUNCTION prevent_restaurant_if_courier();
        `;

        // 2. Couriers tablosuna trigger ekle - restaurant olarak kayıtlı ID'nin courier olmasını engelle
        await sql`
            CREATE OR REPLACE FUNCTION prevent_courier_if_restaurant()
            RETURNS TRIGGER AS $$
            BEGIN
                IF EXISTS (SELECT 1 FROM restaurants WHERE id = NEW.id) THEN
                    RAISE EXCEPTION 'Kullanıcı ID % zaten restoran olarak kayıtlı. Aynı kullanıcı hem kurye hem restoran olamaz.', NEW.id;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `;

        await sql`
            DROP TRIGGER IF EXISTS trigger_prevent_courier_if_restaurant ON couriers;
            CREATE TRIGGER trigger_prevent_courier_if_restaurant
                BEFORE INSERT OR UPDATE ON couriers
                FOR EACH ROW
                EXECUTE FUNCTION prevent_courier_if_restaurant();
        `;

        console.log('✅ Database trigger\'lar başarıyla eklendi!');
        console.log('✅ Artık aynı ID hem restoran hem kurye olamaz');

        return true;
    } catch (error) {
        console.error('❌ Dual role engellemesi sırasında hata:', error);
        throw error;
    }
}

module.exports = {
    preventDualRoleUsers
}; 