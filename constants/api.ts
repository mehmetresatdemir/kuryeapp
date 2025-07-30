import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// Get environment variables - FORCE LOCAL IP FOR MOBILE TESTING
const API_HOST = '192.168.1.106'; // Forced IP for mobile testing
const API_PORT = '3000';
const REMOTE_API_HOST = Constants.expoConfig?.extra?.REMOTE_API_HOST || process.env.EXPO_PUBLIC_REMOTE_API_HOST || 'kurye-backend-production.up.railway.app';
const USE_REMOTE = true; // Force local for testing

// API Configuration
export const API_CONFIG = {
  // Development URLs
  LOCALHOST: `http://${API_HOST}:${API_PORT}`,
  REMOTE_URL: `https://${REMOTE_API_HOST}`, // HTTPS kullan - Railway otomatik yönlendiriyor
  
  // Expo Push Notification Project ID
  EXPO_PROJECT_ID: '2b9b6713-2a3b-4fc7-af89-b8b17f3a7e91',
  
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
  
  // Notification Sounds (Kaldırıldı - Artık sadece local assets kullanılıyor)
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
  
  // 401 hatası durumunda otomatik logout ve anasayfaya yönlendirme
  if (response.status === 401) {
    console.warn('⚠️ Session expire - otomatik logout yapılıyor');
    
    try {
      // Response body'yi kontrol et
      const responseData = await response.clone().json();
      
      // Eğer shouldLogout flag'i varsa veya session expire mesajı varsa logout yap
      if (responseData.shouldLogout || responseData.message?.includes('session') || responseData.message?.includes('expire')) {
        console.log('🔄 Session expire tespit edildi, logout işlemi başlatılıyor...');
        
        // AsyncStorage'ı temizle
        await AsyncStorage.multiRemove([
          'userData', 
          'userToken', 
          'pushToken', 
          'pushTokenUserId', 
          'pushTokenUserType',
          'expoPushToken'
        ]);
        
        console.log('✅ AsyncStorage temizlendi');
        
        // Anasayfaya yönlendir ve uyarı göster
        setTimeout(() => {
          Alert.alert(
            '🔐 Oturum Süresi Doldu',
            'Güvenliğiniz için oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.',
            [
              {
                text: 'Giriş Yap',
                onPress: () => {
                  router.replace('/(auth)/sign-in');
                }
              }
            ],
            { cancelable: false }
          );
        }, 100);
        
        // Hemen sign-in sayfasına yönlendir
        router.replace('/(auth)/sign-in');
      }
    } catch (error) {
      console.error('❌ Session expire handling error:', error);
      // Hata olsa bile logout yap
      router.replace('/(auth)/sign-in');
    }
  }

  return response;
};