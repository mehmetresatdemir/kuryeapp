const { sql } = require('../config/db-config');

async function addIsActiveColumnToPushTokens() {
	try {
		console.log('🔧 Adding is_active column to push_tokens (if missing)...');

		// Add column if it doesn't exist
		await sql`
			ALTER TABLE push_tokens 
			ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
		`;

		// Ensure existing rows have a non-null value
		await sql`
			UPDATE push_tokens 
			SET is_active = true 
			WHERE is_active IS NULL
		`;

		// Create partial index for active tokens (if not exists)
		await sql`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE c.relkind = 'i'
					AND c.relname = 'idx_push_tokens_active'
				) THEN
					CREATE INDEX idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
				END IF;
			END $$;
		`;

		console.log('✅ is_active column ready on push_tokens');
		process.exit(0);
	} catch (error) {
		console.error('❌ Migration failed (add_is_active_to_push_tokens):', error);
		process.exit(1);
	}
}

if (require.main === module) {
	addIsActiveColumnToPushTokens();
}

module.exports = { addIsActiveColumnToPushTokens };


