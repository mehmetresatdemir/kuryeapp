// Dynamic Expo config to ensure google-services.json is available during EAS builds
// and to allow environment-based overrides without committing secrets.

const fs = require('fs');
const path = require('path');

module.exports = () => {
  // Load base config from app.json
  // Note: "app.json" contains an object with the `expo` key at top-level
  const rawConfig = require('./app.json');
  const expoConfig = rawConfig.expo || rawConfig;

  // Ensure android config exists
  expoConfig.android = expoConfig.android || {};

  // Always point to the local google-services.json (will be created below if needed)
  const googleServicesPath = path.resolve(__dirname, 'google-services.json');
  expoConfig.android.googleServicesFile = './google-services.json';

  // If GOOGLE_SERVICES_JSON is provided as a secret or env var, materialize it
  // Accepted formats:
  // - Raw JSON (starts with '{')
  // - Base64 encoded JSON
  // - Absolute/relative file path to an existing google-services.json
  const envValue = process.env.GOOGLE_SERVICES_JSON;
  if (envValue) {
    try {
      const trimmed = envValue.trim();

      // If it's raw JSON
      if (trimmed.startsWith('{')) {
        fs.writeFileSync(googleServicesPath, trimmed, 'utf8');
      } else if (fs.existsSync(trimmed)) {
        // It's a file path
        fs.copyFileSync(trimmed, googleServicesPath);
      } else {
        // Try base64 decode -> JSON
        try {
          const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
          JSON.parse(decoded); // validate
          fs.writeFileSync(googleServicesPath, decoded, 'utf8');
        } catch (e) {
          // Silent fail; will rely on existing google-services.json if present
        }
      }
    } catch (_) {
      // Ignore write errors; fallback to existing file if available
    }
  }

  // Optional: allow overriding API hosts via env without editing app.json
  expoConfig.extra = expoConfig.extra || {};
  const extra = expoConfig.extra;
  extra.API_HOST = process.env.API_HOST || extra.API_HOST || 'kuryex1.enucuzal.com';
  extra.API_PORT = process.env.API_PORT || extra.API_PORT || '80';
  extra.REMOTE_API_HOST = process.env.REMOTE_API_HOST || extra.REMOTE_API_HOST || 'https://kuryex1.enucuzal.com';
  extra.USE_REMOTE = typeof process.env.USE_REMOTE !== 'undefined' ? process.env.USE_REMOTE === 'true' : (extra.USE_REMOTE ?? true);

  return expoConfig;
};


