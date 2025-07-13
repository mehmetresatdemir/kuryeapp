const { sql } = require('../config/db-config');
const jwt = require('jsonwebtoken');

class SessionService {
  /**
   * Kullanıcının aktif tüm sessionlarını getirir
   */
  static async getActiveSessions(userId, userRole) {
    try {
      const sessions = await sql`
        SELECT * FROM active_sessions 
        WHERE user_id = ${userId} AND user_role = ${userRole} AND is_active = TRUE
        ORDER BY created_at DESC
      `;
      return sessions;
    } catch (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }
  }

  /**
   * Yeni session oluşturur ve eski sessionları invalidate eder
   */
  static async createSession(userId, userRole, sessionToken, deviceInfo = null, ipAddress = null, socketId = null) {
    try {
      // Önce eski aktif sessionları invalidate et
      await this.invalidateUserSessions(userId, userRole);
      
      // Token'dan expiration time'ı al
      const decoded = jwt.decode(sessionToken);
      const expiresAt = new Date(decoded.exp * 1000);
      
      // Yeni session oluştur
      const [newSession] = await sql`
        INSERT INTO active_sessions (
          user_id, user_role, session_token, device_info, ip_address, socket_id, expires_at
        ) VALUES (
          ${userId}, ${userRole}, ${sessionToken}, ${deviceInfo}, ${ipAddress}, ${socketId}, ${expiresAt}
        )
        RETURNING *
      `;
      
      console.log(`✅ Yeni session oluşturuldu - User: ${userId}, Role: ${userRole}`);
      return newSession;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Kullanıcının tüm aktif sessionlarını invalidate eder
   */
  static async invalidateUserSessions(userId, userRole, excludeToken = null) {
    try {
      let query;
      if (excludeToken) {
        query = sql`
          UPDATE active_sessions 
          SET is_active = FALSE, last_activity = NOW() 
          WHERE user_id = ${userId} AND user_role = ${userRole} AND session_token != ${excludeToken} AND is_active = TRUE
          RETURNING *
        `;
      } else {
        query = sql`
          UPDATE active_sessions 
          SET is_active = FALSE, last_activity = NOW() 
          WHERE user_id = ${userId} AND user_role = ${userRole} AND is_active = TRUE
          RETURNING *
        `;
      }
      
      const invalidatedSessions = await query;
      
      if (invalidatedSessions.length > 0) {
        console.log(`🔄 ${invalidatedSessions.length} session invalidate edildi - User: ${userId}, Role: ${userRole}`);
      }
      
      return invalidatedSessions;
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
      throw error;
    }
  }

  /**
   * Belirli bir session token'ını invalidate eder
   */
  static async invalidateSession(sessionToken) {
    try {
      const [session] = await sql`
        UPDATE active_sessions 
        SET is_active = FALSE, last_activity = NOW() 
        WHERE session_token = ${sessionToken} AND is_active = TRUE
        RETURNING *
      `;
      
      if (session) {
        console.log(`🔄 Session invalidate edildi - Token: ${sessionToken.substring(0, 10)}...`);
      }
      
      return session;
    } catch (error) {
      console.error('Error invalidating session:', error);
      throw error;
    }
  }

  /**
   * Session token'ını doğrular
   */
  static async validateSession(sessionToken) {
    try {
      const [session] = await sql`
        SELECT * FROM active_sessions 
        WHERE session_token = ${sessionToken} AND is_active = TRUE AND expires_at > NOW()
      `;
      
      if (session) {
        // Last activity'yi güncelle
        await sql`
          UPDATE active_sessions 
          SET last_activity = NOW() 
          WHERE id = ${session.id}
        `;
      }
      
      return session;
    } catch (error) {
      console.error('Error validating session:', error);
      throw error;
    }
  }

  /**
   * Socket ID'sini session'a ekler
   */
  static async updateSocketId(sessionToken, socketId) {
    try {
      const [session] = await sql`
        UPDATE active_sessions 
        SET socket_id = ${socketId}, last_activity = NOW() 
        WHERE session_token = ${sessionToken} AND is_active = TRUE
        RETURNING *
      `;
      
      return session;
    } catch (error) {
      console.error('Error updating socket ID:', error);
      throw error;
    }
  }

  /**
   * Expire olmuş sessionları temizler
   */
  static async cleanupExpiredSessions() {
    try {
      const expiredSessions = await sql`
        DELETE FROM active_sessions 
        WHERE expires_at < NOW() OR is_active = FALSE
        RETURNING *
      `;
      
      if (expiredSessions.length > 0) {
        console.log(`🧹 ${expiredSessions.length} expire olmuş session temizlendi`);
      }
      
      return expiredSessions;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      throw error;
    }
  }

  /**
   * Kullanıcının diğer aktif sessionlarını getirir (mevcut session hariç)
   */
  static async getOtherActiveSessions(userId, userRole, currentToken) {
    try {
      const sessions = await sql`
        SELECT * FROM active_sessions 
        WHERE user_id = ${userId} AND user_role = ${userRole} AND session_token != ${currentToken} AND is_active = TRUE
        ORDER BY created_at DESC
      `;
      return sessions;
    } catch (error) {
      console.error('Error getting other active sessions:', error);
      throw error;
    }
  }
}

module.exports = SessionService; 