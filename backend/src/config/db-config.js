require("dotenv").config();
const { Pool } = require("pg");

// DNS önbellek sıfırlama için
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Add timezone parameter to connection string if not present
let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('timezone=')) {
  const separator = connectionString.includes('?') ? '&' : '?';
  connectionString = `${connectionString}${separator}timezone=Europe/Istanbul`;
}

// PostgreSQL connection pool yapılandırması
const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000, // 30 saniye timeout
  idleTimeoutMillis: 30000,
  max: 20, // Maximum pool size
  min: 2,  // Minimum pool size
  acquireTimeoutMillis: 60000,
});

// Set timezone to Turkey (UTC+3) on every connection
pool.on('connect', async (client) => {
  try {
    await client.query("SET timezone = 'Europe/Istanbul'");
    await client.query("SET TIME ZONE 'Europe/Istanbul'");
    console.log('✅ Database timezone set to Europe/Istanbul');
  } catch (err) {
    console.log('⚠️ Timezone setting error:', err.message);
  }
});

// SQL template function to mimic Neon's API
function sql(strings, ...values) {
  return pool.query(strings.join('?').replace(/\?/g, (match, index) => `$${index + 1}`), values).then(result => result.rows);
}

// For template literal usage
sql.templateLiteral = function(strings, ...values) {
  const query = strings.reduce((acc, str, i) => acc + str + (values[i] ? `$${i + 1}` : ''), '');
  return pool.query(query, values).then(result => result.rows);
};

// Override the function call to handle template literals
const originalSql = sql;
sql = function(strings, ...values) {
  if (Array.isArray(strings)) {
    let query = '';
    let paramCount = 0;
    const params = [];
    
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      
      if (i < values.length) {
        const value = values[i];
        
        // Handle unsafe raw SQL strings
        if (value && typeof value === 'object' && value.__unsafe) {
          query += value.__unsafe;
        } else {
          paramCount++;
          query += `$${paramCount}`;
          params.push(value);
        }
      }
    }
    
    return pool.query(query, params).then(result => result.rows);
  }
  return originalSql.apply(this, arguments);
};

// Add sql.unsafe function for raw SQL strings
sql.unsafe = function(rawString) {
  return { __unsafe: rawString };
};

// Bağlantı testi fonksiyonu
async function testConnection(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
      console.log("✅ Database connection successful");
      return true;
    } catch (error) {
      if (i === retries - 1) {
        throw new Error(`Database connection failed after ${retries} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Güvenli sorgu çalıştırma fonksiyonu
async function safeQuery(queryFunction, operation = "veritabanı işlemi", retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await queryFunction();
    } catch (error) {
      // Only log critical errors on final retry
      if (i === retries - 1) {
        console.error(`❌ ${operation} hatası (son deneme):`, error.message);
      }
      
      const retryableErrors = [
        'fetch failed',
        'ENOTFOUND', 
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'socket hang up',
        'network timeout',
        'UND_ERR_CONNECT_TIMEOUT',
        'connect timeout',
        'timeout'
      ];
      
      const shouldRetry = retryableErrors.some(errType => 
        error.message.toLowerCase().includes(errType.toLowerCase())
      );
      
      if (shouldRetry && i < retries - 1) {
        const delay = 1000 * (i + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// Veritabanı durumu kontrol fonksiyonu
async function healthCheck() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_connections,
        current_database() as database_name,
        current_user as user_name,
        inet_server_addr() as server_ip
    `);
    
    return {
      healthy: true,
      info: result.rows[0],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  sql,
  pool,
  testConnection,
  safeQuery,
  healthCheck
}; 