import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Get environment variables - FORCE LOCAL IP FOR MOBILE TESTING
const API_HOST = '192.168.1.105'; // Forced IP for mobile testing
const API_PORT = '3000';
const REMOTE_API_HOST = Constants.expoConfig?.extra?.REMOTE_API_HOST || process.env.EXPO_PUBLIC_REMOTE_API_HOST || 'admin.enucuzal.com';
const USE_REMOTE = false; // Force local for testing

// API Configuration
export const API_CONFIG = {
  // Development URLs
  LOCALHOST: `http://${API_HOST}:${API_PORT}`,
  REMOTE_URL: `https://${REMOTE_API_HOST}`, // HTTPS kullan - Railway otomatik yönlendiriyor
  
  // Auto-detect environment and use appropriate URL
  get BASE_URL() {
    // Always use remote server when USE_REMOTE is true
    if (USE_REMOTE) {
      console.log('🌐 Using remote server for API');
      return this.REMOTE_URL;
    }
    
    // For development, use local IP for mobile compatibility
    if (__DEV__) {
      console.log('📱 Using local server for API');
      return this.LOCALHOST;
    }
    
    // Production fallback - use remote URL
    return this.REMOTE_URL;
  },
  
  // Socket.io URL (same as BASE_URL)
  get SOCKET_URL() {
    return this.BASE_URL;
  }
};

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: "/api/login",
  FORGOT_PASSWORD: "/api/forgot-password",
  RESET_PASSWORD: "/api/reset-password",
  
  // Users
  GET_USER: (id: string | number) => `/api/user/${id}`,
  CREATE_USER: "/api/user",
  GET_ALL_USERS: "/api/users",
  
  // Orders
  GET_ORDERS_BY_STATUS: "/api/orders/status",
  GET_ORDERS_BY_FIRM: (firmId: string | number) => `/api/orders/restaurant/${firmId}`,
  ADD_ORDER: "/api/orders",
  UPDATE_ORDER: (orderId: string | number) => `/api/orders/update/${orderId}`,
  DELETE_ORDER: (orderId: string | number) => `/api/orders/${orderId}`,
  GET_ACTIVE_ORDERS: (courierId: string | number) => `/api/orders/courier/${courierId}/active`,
  GET_ORDERS_WITH_PREFERENCES: (courierId: string | number) => `/api/orders/courier/${courierId}/with-preferences`,
  ACCEPT_ORDERS: "/api/orders/accept",
  DELIVER_ORDER: "/api/orders/deliver",
  CANCEL_ORDER: "/api/orders/cancel",
  APPROVE_ORDER: "/api/orders/approve",
  GET_PENDING_APPROVAL_ORDERS_COURIER: (courierId: string | number) => `/api/orders/courier/${courierId}/pending-approval`,
  GET_PENDING_APPROVAL_ORDERS_RESTAURANT: (restaurantId: string | number) => `/api/orders/restaurant/${restaurantId}/pending-approval`,
  
  // Earnings
  MONTHLY_EARNINGS_COURIER: (courierId: string | number, dateParam?: string) => 
    `/api/earnings/monthly/${courierId}${dateParam || ''}`,
  DELIVERED_ORDERS_COURIER: (courierId: string | number, dateParam?: string) => 
    `/api/earnings/delivered/${courierId}${dateParam || ''}`,
  MONTHLY_EARNINGS_FIRM: (firmId: string | number, dateParam?: string) => 
    `/api/earnings/firmmonthly/${firmId}${dateParam || ''}`,
  DELIVERED_ORDERS_FIRM: (firmId: string | number, dateParam?: string) => 
    `/api/earnings/firmdelivered/${firmId}${dateParam || ''}`,
  
  // Restaurants
  GET_ALL_RESTAURANTS: "/api/restaurants",
  GET_RESTAURANT: (restaurantId: string | number) => `/api/restaurants/${restaurantId}`,
  GET_RESTAURANT_DELIVERY_AREAS: () => `/api/restaurants/neighborhoods`,
  GET_RESTAURANT_PROFILE: (restaurantId: string | number) => `/api/restaurants/${restaurantId}/profile`,
  UPDATE_RESTAURANT_PROFILE: (restaurantId: string | number) => `/api/restaurants/${restaurantId}/profile`,
  CHANGE_RESTAURANT_PASSWORD: (restaurantId: string | number) => `/api/restaurants/${restaurantId}/change-password`,
  UPLOAD_RESTAURANT_LOGO: (restaurantId: string | number) => `/api/restaurants/${restaurantId}/logo`,
  DELETE_RESTAURANT_LOGO: (restaurantId: string | number) => `/api/restaurants/${restaurantId}/logo`,
  
  // Couriers
  GET_ALL_COURIERS: "/api/couriers",
  GET_COURIER: (courierId: string | number) => `/api/couriers/${courierId}`,
  UPDATE_COURIER_PROFILE: (courierId: string | number) => `/api/couriers/${courierId}/profile`,
  
  // Courier Activity Tracking
  START_ACTIVITY_SESSION: (courierId: string | number) => `/api/couriers/${courierId}/activity/start`,
  END_ACTIVITY_SESSION: (courierId: string | number) => `/api/couriers/${courierId}/activity/end`,
  GET_COURIER_ACTIVITY_REPORT: (courierId: string | number) => `/api/couriers/${courierId}/activity-report`,
  GET_ALL_COURIERS_ACTIVITY_SUMMARY: "/api/couriers/activity/summary",
  
  // New Settlement System (Yeni Hesaplaşma Sistemi)
  COURIER_COLLECTIONS: (courierId: string | number, params?: string) => 
    `/api/courier/${courierId}/collections${params || ''}`,
  COURIER_RESTAURANT_BALANCES: (courierId: string | number) =>
    `/api/courier/${courierId}/restaurant-balances`,
  RESTAURANT_COURIER_BALANCES: (restaurantId: string | number) => 
    `/api/restaurant/${restaurantId}/courier-balances`,
  RESTAURANT_PAY_COURIER: '/api/restaurant/pay-courier',
  
  // Admin Settlement Management
  ADMIN_COURIER_FEE_SETTINGS: '/api/admin/courier-fee-settings',
  ADMIN_PAY_COURIER: '/api/admin/pay-courier',
  ADMIN_COURIER_COLLECTIONS_SUMMARY: '/api/admin/courier-collections-summary',
  

  
  // File Upload
  UPLOAD_IMAGE: "/api/uploadImage",
  
  // Admin Settings
  ADMIN_GENERAL_SETTINGS: "/api/admin/settings/general",
  ADMIN_TIME_STATUS: "/api/admin/time-status",
  
  // Preferences
  GET_COURIER_PREFERENCES: (courierId: string | number) => `/api/preferences/courier/${courierId}`,
  UPDATE_COURIER_PREFERENCES: (courierId: string | number) => `/api/preferences/courier/${courierId}`,
  GET_RESTAURANT_PREFERENCES: (restaurantId: string | number) => `/api/preferences/restaurant/${restaurantId}`,
  UPDATE_RESTAURANT_PREFERENCES: (restaurantId: string | number) => `/api/preferences/restaurant/${restaurantId}`,
  
  // Notification Sounds
  GET_ACTIVE_NOTIFICATION_SOUND: "/api/admin/notification-sounds/active",
};

// Helper function to get full URL
export const getFullUrl = (endpoint: string) => {
  const baseUrl = API_CONFIG.BASE_URL;
  return `${baseUrl}${endpoint}`;
};

// New authenticated fetch wrapper
export const authedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = await AsyncStorage.getItem('userToken');

  if (!token) {
    console.warn('🔴 Authentication token not found. User might be logged out.');
    return Promise.reject(new Error('Authentication token not found.'));
  }

  const headers: HeadersInit = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  // Add Content-Type if there's a body and it's not FormData
  if (options.body && !(options.body instanceof FormData)) {
    if (!(headers as any)['Content-Type']) {
      (headers as any)['Content-Type'] = 'application/json';
    }
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(url, finalOptions);
  
  // Eğer 401 hatası alırsa, token'ı temizle ve logout işlemi başlat
  if (response.status === 401) {
    console.log('🔴 Token geçersiz (401), AsyncStorage temizleniyor...');
    await AsyncStorage.multiRemove(['userData', 'userId', 'userToken']);
    
    // Bu error'u yakalayan component'ler logout işlemi yapabilir
    const error = new Error('Token expired or invalid');
    (error as any).isTokenExpired = true;
    (error as any).shouldLogout = true;
    throw error;
  }

  return response;
};