// JWT Token Configuration
const JWT_CONFIG = {
  // Token expiration time - 30 days for better user experience
  EXPIRES_IN: '30d',
  
  // JWT issuer
  ISSUER: 'kurye-app',
  
  // Token options
  OPTIONS: {
    expiresIn: '30d',
    issuer: 'kurye-app',
    algorithm: 'HS256'
  },
  
  // Role-specific options
  getTokenOptions: (role) => ({
    expiresIn: '30d',
    issuer: 'kurye-app',
    audience: role,
    algorithm: 'HS256'
  })
};

// Helper function to generate JWT token
const generateToken = (payload, role) => {
  const jwt = require('jsonwebtoken');
  
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  return jwt.sign(payload, process.env.JWT_SECRET, JWT_CONFIG.getTokenOptions(role));
};

// Helper function to verify JWT token
const verifyToken = (token) => {
  const jwt = require('jsonwebtoken');
  
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
  JWT_CONFIG,
  generateToken,
  verifyToken
}; 