import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// Global auth flow guards to prevent duplicated alerts/navigation on concurrent 401s
let GLOBAL_LOGOUT_IN_PROGRESS = false;
let GLOBAL_LOGOUT_ALERT_SHOWN = false;

const performForcedLogoutOnce = async (message?: string) => {
  if (GLOBAL_LOGOUT_IN_PROGRESS) {
    return;
  }
  GLOBAL_LOGOUT_IN_PROGRESS = true;

  try {
    await AsyncStorage.multiRemove([
      'userData',
      'userToken',
      'pushToken',
      'pushTokenUserId',
      'pushTokenUserType',
      'expoPushToken'
    ]);
    console.log('✅ AsyncStorage temizlendi (forced logout)');
  } catch (e) {
    console.warn('AsyncStorage temizleme hatası:', (e as any)?.message || e);
  }

  // Kullanıcı etkileşimi olmadan direkt giriş ekranına yönlendir + 3 sn'lik banner mesajını sakla
  const alertMessage = message || 'Güvenliğiniz için oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.';
  try { await AsyncStorage.setItem('logoutMessage', alertMessage); } catch {}
  if (!GLOBAL_LOGOUT_ALERT_SHOWN) {
    GLOBAL_LOGOUT_ALERT_SHOWN = true;
  }
  try { router.replace('/(auth)/sign-in'); } catch {}
};

export const resetAuthGuards = () => {
  GLOBAL_LOGOUT_IN_PROGRESS = false;
  GLOBAL_LOGOUT_ALERT_SHOWN = false;
};

// Get environment variables - USE LOCAL BACKEND
const sanitizeHost = (value?: string): string => {
  if (!value) return '';
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, '') // leading/trailing quotes
    .replace(/^https?:\/\//, '')   // strip protocol
    .replace(/\/+$|^\/+/, '');     // strip leading/trailing slashes
};

// Prefer EXPO_PUBLIC_* env vars; fall back to app.json extra if not present (works in dev and in production builds)
const getExtra = (key: string): string | undefined => {
  try {
    const value = (Constants as any)?.expoConfig?.extra?.[key];
    return value === undefined || value === null ? undefined : String(value);
  } catch {
    return undefined;
  }
};

const getEnvOrExtra = (envKey: string, extraKey: string): string | undefined => {
  const envVal = (process.env as any)?.[envKey];
  if (envVal !== undefined && envVal !== null && String(envVal).length > 0) return String(envVal);
  return getExtra(extraKey);
};

const ENV_API_HOST = sanitizeHost(getEnvOrExtra('EXPO_PUBLIC_API_HOST', 'API_HOST'));
const ENV_API_PORT = getEnvOrExtra('EXPO_PUBLIC_API_PORT', 'API_PORT') || '4000';
const ENV_REMOTE_API_HOST = sanitizeHost(getEnvOrExtra('EXPO_PUBLIC_REMOTE_API_HOST', 'REMOTE_API_HOST')) || 'kuryex.enucuzal.com';
const ENV_USE_REMOTE = ['true', '1', 'yes', 'y'].includes(String(getEnvOrExtra('EXPO_PUBLIC_USE_REMOTE', 'USE_REMOTE')).toLowerCase());

const isAndroid = Platform.OS === 'android';
const defaultLocalHost = isAndroid ? '10.0.2.2' : 'localhost';

// Resolve localhost for Android emulator automatically, prefer env if provided
const API_HOST = (ENV_API_HOST && ENV_API_HOST.trim().length > 0
  ? ENV_API_HOST
  : defaultLocalHost);
const API_PORT = ENV_API_PORT; // Backend port
// Use environment variable or fallback to domain for production
const REMOTE_API_HOST = ENV_REMOTE_API_HOST; // Already sanitized domain
const USE_REMOTE = ENV_USE_REMOTE; // Use local backend unless explicitly set

// APK debug logging
console.log('📱 API Config Loading...');
console.log('🔍 __DEV__:', typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined');
console.log('🌐 USE_REMOTE:', USE_REMOTE);
console.log('🎯 REMOTE_API_HOST:', REMOTE_API_HOST);

// Debug için console log ekle
console.log('🔧 API Config Debug:');
console.log('📍 REMOTE_API_HOST:', REMOTE_API_HOST);
console.log('🌐 USE_REMOTE:', USE_REMOTE);
console.log('🏗️ __DEV__:', __DEV__);

// API Configuration
export const API_CONFIG = {
  // Development URLs
  LOCALHOST: `http://${API_HOST}:${API_PORT}`,
  REMOTE_URL: `https://${REMOTE_API_HOST}`, // Use new domain for all platforms with SSL
  
  // Expo Push Notification Project ID
  EXPO_PROJECT_ID: '2b9b6713-2a3b-4fc7-af89-b8b17f3a7e91',
  
  // Auto-detect environment and use appropriate URL
  get BASE_URL() {
    console.log('🔍 BASE_URL getter called');
    console.log('📍 USE_REMOTE:', USE_REMOTE);
    console.log('🏗️ __DEV__:', typeof __DEV__ !== 'undefined' ? __DEV__ : 'UNDEFINED');
    console.log('🎯 LOCALHOST:', this.LOCALHOST);
    
    // Use local backend for development
    const url = USE_REMOTE ? this.REMOTE_URL : this.LOCALHOST;
    console.log('🌐 Using backend URL:', url);
    console.log('📱 Platform:', Platform.OS);
    
    // Log the selected backend
    if (USE_REMOTE) {
      console.log('🌍 Remote backend selected:', url);
    } else {
      console.log('🏠 Local backend selected:', url);
    }
    
    return url;
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
  REFRESH_TOKEN: "/api/refresh-token",
  FORGOT_PASSWORD: "/api/forgot-password",
  RESET_PASSWORD: "/api/reset-password",
  // Account
  DELETE_ACCOUNT: "/api/account",
  
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
    `/api/earnings/courier/${courierId}${dateParam || ''}`,
  DELIVERED_ORDERS_COURIER: (courierId: string | number, dateParam?: string) => 
    `/api/earnings/courier/${courierId}/details${dateParam || ''}`,
  MONTHLY_EARNINGS_FIRM: (firmId: string | number, dateParam?: string) => 
    `/api/earnings/restaurant/${firmId}${dateParam || ''}`,
  DELIVERED_ORDERS_FIRM: (firmId: string | number, dateParam?: string) => 
    `/api/earnings/restaurant/${firmId}/details${dateParam || ''}`,
  
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
  
  // Content Management
  GET_CONTENT_PAGES: "/api/content/active",
  GET_CONTENT_PAGE: (pageType: string) => `/api/content/page/${pageType}`,
  
  // Notification Sounds (Kaldırıldı - Artık sadece local assets kullanılıyor)
};

// Helper function to get full URL
export const getFullUrl = (endpoint: string) => {
  const baseUrl = API_CONFIG.BASE_URL;
  console.log('🔗 getFullUrl called:');
  console.log('📍 Base URL:', baseUrl);
  console.log('🎯 Endpoint:', endpoint);
  console.log('🌐 Full URL:', `${baseUrl}${endpoint}`);
  return `${baseUrl}${endpoint}`;
};

// Token refresh function
export const refreshUserToken = async (): Promise<string | null> => {
  try {
    console.log('🔄 Token refresh işlemi başlatılıyor...');
    const token = await AsyncStorage.getItem('userToken');
    
    if (!token) {
      console.warn('❌ Refresh için token bulunamadı');
      return null;
    }

    const response = await fetch(getFullUrl(API_ENDPOINTS.REFRESH_TOKEN), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.token) {
        // Yeni token'ı kaydet
        await AsyncStorage.setItem('userToken', data.token);
        console.log('✅ Token başarıyla yenilendi');
        return data.token;
      }
    }
    
    console.warn('❌ Token refresh başarısız');
    return null;
  } catch (error) {
    console.error('❌ Token refresh hatası:', error);
    return null;
  }
};

// New authenticated fetch wrapper
export const authedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  console.log('🚀 API Request:', url);
  console.log('📋 Request options:', JSON.stringify(options, null, 2));
  
  if (GLOBAL_LOGOUT_IN_PROGRESS) {
    console.warn('⏳ Logout süreci devam ediyor, istek iptal edildi:', url);
    return Promise.reject(new Error('FORCED_LOGOUT_IN_PROGRESS'));
  }

  const token = await AsyncStorage.getItem('userToken');

  if (!token) {
    console.warn('🔴 Authentication token not found. User might be logged out.');
    await performForcedLogoutOnce('Oturum bilginiz bulunamadı, lütfen tekrar giriş yapın.');
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

  try {
    console.log('📤 Making fetch request to:', url);
    const response = await fetch(url, finalOptions);
    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    
    // 401 hatası durumunda dikkatli logout handling
    if (response.status === 401) {
      console.warn('⚠️ 401 hatası alındı - kontrol ediliyor...');
      try {
        const responseData = await response.clone().json();
        const shouldForceLogout = responseData.shouldLogout || 
                                  responseData.message?.includes('session') || 
                                  responseData.message?.includes('expire') ||
                                  responseData.message?.includes('geçersiz') ||
                                  responseData.message?.includes('invalid');
        if (shouldForceLogout) {
          console.log('🔄 Kesin logout gerekiyor, tekilleştirilmiş akış başlatılıyor...');
          await performForcedLogoutOnce(responseData.message);
        } else {
          console.log('🔄 Token refresh deneniyor...');
          const newToken = await refreshUserToken();
          if (newToken) {
            console.log('✅ Token yenilendi, request tekrarlanıyor...');
            const retryHeaders = {
              ...finalOptions.headers,
              'Authorization': `Bearer ${newToken}`
            };
            try {
              const retryResponse = await fetch(url, {
                ...finalOptions,
                headers: retryHeaders
              });
              return retryResponse;
            } catch (retryError) {
              console.error('❌ Retry request failed:', retryError);
            }
          } else {
            console.log('❌ Token refresh başarısız, logout gerekebilir');
          }
        }
      } catch (error) {
        console.error('❌ 401 response parsing error:', error);
        console.log('🔄 Response parse edilemedi, network hatası olabilir');
      }
    }

    return response;
  } catch (error) {
    console.error('❌ Network error in authedFetch:', error);
    throw error;
  }
};