const { sql } = require('../config/db-config');
const jwt = require('jsonwebtoken');

// Ensure active_sessions table exists (self-healing in case migration not applied)
async function ensureActiveSessionsTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS active_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_role TEXT NOT NULL,
        session_token TEXT NOT NULL,
        device_info TEXT,
        ip_address TEXT,
        socket_id TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        last_activity TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;
  } catch (error) {
    // If creation fails (permissions etc.), let caller handle downstream errors
  }
}

class SessionService {
  /**
   * Kullanıcının aktif tüm sessionlarını getirir
   */
  static async getActiveSessions(userId, userRole) {
    try {
      await ensureActiveSessionsTable();
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
      await ensureActiveSessionsTable();
      // NOT: invalidateUserSessions çağırılmayacak çünkü unifiedLogin'de zaten çağırılıyor
      // Bu double invalidation race condition'a neden oluyordu
      
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
        RETURNING 
          id, user_id, user_role, session_token, device_info, ip_address, socket_id, is_active,
          created_at::text as created_at,
          
          expires_at::text as expires_at,
          last_activity::text as last_activity
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
      await ensureActiveSessionsTable();
      let query;
      if (excludeToken) {
        query = sql`
          UPDATE active_sessions 
          SET is_active = FALSE, last_activity = ${new Date()} 
          WHERE user_id = ${userId} AND user_role = ${userRole} AND session_token != ${excludeToken} AND is_active = TRUE
          RETURNING 
            id, user_id, user_role, session_token, device_info, ip_address, socket_id, is_active,
            created_at::text as created_at,
            
            expires_at::text as expires_at,
            last_activity::text as last_activity
        `;
      } else {
        query = sql`
          UPDATE active_sessions 
          SET is_active = FALSE, last_activity = ${new Date()} 
          WHERE user_id = ${userId} AND user_role = ${userRole} AND is_active = TRUE
          RETURNING 
            id, user_id, user_role, session_token, device_info, ip_address, socket_id, is_active,
            created_at::text as created_at,
            
            expires_at::text as expires_at,
            last_activity::text as last_activity
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
      await ensureActiveSessionsTable();
      const [session] = await sql`
        UPDATE active_sessions 
        SET is_active = FALSE, last_activity = ${new Date()} 
        WHERE session_token = ${sessionToken} AND is_active = TRUE
        RETURNING 
          id, user_id, user_role, session_token, device_info, ip_address, socket_id, is_active,
          created_at::text as created_at,
          
          expires_at::text as expires_at,
          last_activity::text as last_activity
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
   * Session token'ını doğrular ve süresini uzatır
   */
  static async validateSession(sessionToken) {
    try {
      await ensureActiveSessionsTable();
      const [session] = await sql`
        SELECT * FROM active_sessions 
        WHERE session_token = ${sessionToken} AND is_active = TRUE AND expires_at > ${new Date()}
      `;
      
      if (session) {
        // JWT token'dan yeni expiration time'ı hesapla (30 gün daha)
        const decoded = jwt.decode(sessionToken);
        const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 gün
        
        // Last activity'yi güncelle ve session süresini uzat
        await sql`
          UPDATE active_sessions 
          SET last_activity = ${new Date()}, expires_at = ${newExpiresAt}
          WHERE id = ${session.id}
        `;
        
        console.log(`🔄 Session süresi uzatıldı - User: ${session.user_id}, Yeni süre: ${newExpiresAt.toISOString()}`);
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
      await ensureActiveSessionsTable();
      const [session] = await sql`
        UPDATE active_sessions 
        SET socket_id = ${socketId}, last_activity = ${new Date()} 
        WHERE session_token = ${sessionToken} AND is_active = TRUE
        RETURNING 
          id, user_id, user_role, session_token, device_info, ip_address, socket_id, is_active,
          created_at::text as created_at,
          
          expires_at::text as expires_at,
          last_activity::text as last_activity
      `;
      
      return session;
    } catch (error) {
      console.error('Error updating socket ID:', error);
      throw error;
    }
  }

  /**
   * Expire olmuş sessionları temizler (daha yumuşak yaklaşım)
   */
  static async cleanupExpiredSessions() {
    try {
      await ensureActiveSessionsTable();
      // Sadece gerçekten expire olmuş session'ları temizle (7 gün önce expire olmuş)
      const gracePeriod = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 gün önce
      const expiredSessions = await sql`
        DELETE FROM active_sessions 
        WHERE expires_at < ${gracePeriod} AND is_active = FALSE
        RETURNING 
          id, user_id, user_role, session_token, device_info, ip_address, socket_id, is_active,
          created_at::text as created_at,
          
          expires_at::text as expires_at,
          last_activity::text as last_activity
      `;
      
      if (expiredSessions.length > 0) {
        console.log(`🧹 ${expiredSessions.length} gerçekten expire olmuş session temizlendi (7 gün grace period)`);
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
      await ensureActiveSessionsTable();
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