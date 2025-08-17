const { sql } = require('../config/db-config');

async function createAdminNotificationsTable() {
	try {
		console.log('🔧 Creating/Updating admin_notifications table...');

		// Create table if not exists
		await sql`
			CREATE TABLE IF NOT EXISTS admin_notifications (
				id SERIAL PRIMARY KEY,
				title TEXT NOT NULL,
				message TEXT NOT NULL,
				target_type VARCHAR(20) NOT NULL, -- couriers | restaurants | all | selected
				target_scope VARCHAR(50) NOT NULL, -- all | selected | restaurant:<id> | courier:<id>
				priority VARCHAR(10) DEFAULT 'medium', -- low | medium | high
				with_sound BOOLEAN DEFAULT false,
				sent_count INTEGER DEFAULT 0,
				created_at TIMESTAMP DEFAULT NOW()
			)
		`;

		// Ensure columns exist (idempotent safety)
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL`;
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS message TEXT NOT NULL`;
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL`;
		// target_scope: önce nullable ekle, doldur, sonra NOT NULL yap
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS target_scope VARCHAR(50)`;
		await sql`UPDATE admin_notifications SET target_scope = 'all' WHERE target_scope IS NULL`;
		await sql`ALTER TABLE admin_notifications ALTER COLUMN target_scope SET NOT NULL`;
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium'`;
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS with_sound BOOLEAN DEFAULT false`;
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0`;
		await sql`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;

		// Helpful index
		await sql`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE c.relkind = 'i' AND c.relname = 'idx_admin_notifications_created_at'
				) THEN
					CREATE INDEX idx_admin_notifications_created_at ON admin_notifications(created_at DESC);
				END IF;
			END $$;
		`;

		console.log('✅ admin_notifications table ready');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error creating/updating admin_notifications table:', error);
		process.exit(1);
	}
}

if (require.main === module) {
	createAdminNotificationsTable();
}

module.exports = { createAdminNotificationsTable };


