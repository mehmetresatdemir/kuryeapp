const SessionService = require('./sessionService');

class SessionCleanupService {
  constructor() {
    this.cleanupInterval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ Session cleanup servisi zaten çalışıyor');
      return;
    }

    console.log('🧹 Session cleanup servisi başlatılıyor...');
    this.isRunning = true;

    // Her 6 saatte bir cleanup çalıştır (daha az agresif)
    this.cleanupInterval = setInterval(async () => {
      try {
        await SessionService.cleanupExpiredSessions();
      } catch (error) {
        console.error('Session cleanup hatası:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 saat

    // İlk cleanup'ı hemen çalıştır
    this.cleanup();
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Session cleanup servisi durduruldu');
  }

  async cleanup() {
    try {
      await SessionService.cleanupExpiredSessions();
    } catch (error) {
      console.error('Session cleanup hatası:', error);
    }
  }
}

// Singleton instance
const sessionCleanupService = new SessionCleanupService();

module.exports = sessionCleanupService; 