import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import * as Notifications from 'expo-notifications';
import io from "socket.io-client";
import { useFocusEffect, router } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from "@expo/vector-icons";
import { API_CONFIG } from "../../constants/api";

interface CourierLocation {
  courierId: string;
  orderId: string;
  latitude: number;
  longitude: number;
  firmaid?: string;
  phone?: string;
  courier_name?: string;
  courier_phone?: string;
  timestamp?: string;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

interface User {
  id: string;
  publicMetadata?: {
    firmId?: string;
  };
  [key: string]: any;
}

const mapStyle = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#ffffff" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#dadada" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#c9c9c9" }]
  }
];

// Timestamp formatting fonksiyonu
const formatTimestamp = (timestamp: string | undefined): string => {
  try {
    if (!timestamp) {
      return 'Şimdi';
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return 'Şimdi';
    }
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffSeconds < 60) {
      return 'Şimdi';
    } else if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `${minutes} dk önce`;
    } else {
      return date.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  } catch (error) {
    return 'Şimdi';
  }
};

const RestaurantLiveMap = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [expandedBubble, setExpandedBubble] = useState<string | null>(null);
  const [autoFitEnabled, setAutoFitEnabled] = useState<boolean>(true);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [connectionHealth, setConnectionHealth] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const socketRef = useRef<any>(null);
  const lastUpdateRef = useRef<number>(0);
  const dataRetentionRef = useRef<CourierLocation[]>([]);
  const lastDataReceived = useRef<number>(Date.now());
  
  // Notification deduplication - track recent notifications
  const recentNotifications = useRef(new Set());
  const NOTIFICATION_THROTTLE_MS = 3000; // 3 seconds

  // Function to check if notification is duplicate
  const isDuplicateNotification = (type: string, orderId: string) => {
    const notificationKey = `${type}_${orderId}`;
    if (recentNotifications.current.has(notificationKey)) {
      console.log(`🚫 Duplicate notification blocked: ${notificationKey}`);
      return true;
    }
    
    recentNotifications.current.add(notificationKey);
    setTimeout(() => {
      recentNotifications.current.delete(notificationKey);
    }, NOTIFICATION_THROTTLE_MS);
    
    return false;
  };

  // Ses çalma fonksiyonu
  const playNotificationSound = useCallback(async () => {
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Sipariş Kabul Edildi",
          body: "Siparişiniz kurye tarafından kabul edildi",
          sound: 'ring_bell2',
          data: { local: true, nonce: Date.now() },
          ...(Platform.OS === 'android' ? { channelId: 'ring_bell2' } : {})
        },
        trigger: null
      });
      console.log("🔔 RestaurantLiveMap: Local notification with sound played");
    } catch (error) {
      console.error("❌ RestaurantLiveMap: Error playing notification sound:", error);
    }
  }, []);
  const mapRef = useRef<MapView>(null);



  const centerOnUser = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [userLocation]);

  // Push token registration for restaurant
  const registerPushToken = useCallback(async (userData: any) => {
    if (!userData) return;
    
    try {
      const expoPushToken = await AsyncStorage.getItem('expoPushToken');
      if (!expoPushToken) {
        console.log('📵 No push token available for registration');
        return;
      }
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/push-notifications/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem('userToken')}`
        },
        body: JSON.stringify({
          userId: userData.id,
          userType: 'restaurant',
          expoPushToken: expoPushToken,
          platform: Platform.OS
        })
      });
      
      if (response.ok) {
        console.log(`📱 Push token registered for restaurant ${userData.id}`);
      } else {
        console.error('❌ Failed to register push token:', await response.text());
      }
    } catch (error) {
      console.error('❌ Error registering push token:', error);
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          
          // Register push token when user is loaded
          registerPushToken(parsedUser);
        }
        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading user data:', error);
        setIsLoaded(true);
      }
    };
    loadUser();
  }, [registerPushToken]);

  // Get the user's current location.
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Konum İzni", "Konum izni verilmedi. Harita varsayılan konumda gösterilecektir.");
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  // Sayfa odaklandığında veri saklamayı yönet
  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      const firmId = user.publicMetadata?.firmId || user.id;
      
      // SADECE yeni bağlantıda saklanan verileri geri yükle, eski olabileceği için server'dan doğrula
      const hasStoredData = dataRetentionRef.current.length > 0;
      if (hasStoredData) {
        console.log(`🔄 ${dataRetentionRef.current.length} saklanan veri var, server'dan doğrulanacak`);
        // Geçici olarak göster ama hemen server'dan fresh data çek
        setCourierLocations(dataRetentionRef.current);
      }
      
      // Socket zaten bağlıysa tekrar bağlanma
      if (socketRef.current && socketConnected) {
        console.log('🔄 Mevcut socket bağlantısı korunuyor');
        setIsLoading(false);
        return;
      }
      
      // Yeni socket bağlantısı kur
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      socketRef.current = io(API_CONFIG.SOCKET_URL, { transports: ["websocket"] });
      socketRef.current.on("connect", async () => {
        console.log(`🔌 Restoran socket bağlandı - FirmID: ${firmId}`);
        setSocketConnected(true);
        
        // Get user token for session management
        const token = await AsyncStorage.getItem('userToken');
        
        // Otomatik olarak aktif siparişleri iste (her zaman fresh data için)
        socketRef.current.emit("requestActiveOrders", { firmId });
        
        // Restoran odasına katıl
        socketRef.current.emit("joinRestaurantRoom", { restaurantId: firmId, token });
        
        // Eğer saklanan veri varsa, 2 saniye sonra server'dan gelen ile karşılaştır
        if (hasStoredData) {
          setTimeout(() => {
            console.log('🔄 Requesting fresh data to validate stored data');
            socketRef.current.emit("requestActiveOrders", { firmId });
          }, 2000);
        }
        
        setIsLoading(false);
      });
      socketRef.current.on("connect_error", (err: any) => {
        console.error("Socket connection error:", err);
        setSocketConnected(false);
        Alert.alert("Hata", "Socket bağlantısı kurulamadı.");
        setIsLoading(false);
      });
      
      socketRef.current.on("disconnect", () => {
        console.log("🔌 Socket bağlantısı kesildi");
        setSocketConnected(false);
      });
      socketRef.current.on("activeOrders", (data: any) => {
        // Veri alındığını işaretle
        lastDataReceived.current = Date.now();
        setConnectionHealth('healthy');
        
        console.log('💾 Fresh activeOrders data received from server');
        
        if (data && data.length > 0) {
          const currentTime = new Date().toISOString();
          const locations = data.map((order: any) => ({
            courierId: order.kuryeid,
            orderId: order.id,
            latitude: order.latitude,
            longitude: order.longitude,
            firmaid: order.firmaid,
            phone: order.phone,
            courier_name: order.courier_name,
            courier_phone: order.courier_phone,
            timestamp: order.timestamp || currentTime, // Fallback timestamp
            accuracy: order.accuracy || null,
            speed: order.speed || 0,
            heading: order.heading || 0
          }));
          
          // Server'dan gelen fresh data ile mevcut stored data'yı değiştir
          const activeOrderIds = new Set(locations.map(loc => loc.orderId));
          console.log(`🔄 Server has ${activeOrderIds.size} active orders:`, Array.from(activeOrderIds));
          
          setCourierLocations(locations);
          // Fresh server data'yı sakla
          dataRetentionRef.current = locations;
          setLastUpdateTime(new Date().toISOString());
          console.log(`💾 ${locations.length} fresh kurye verisi güncellendi ve saklandı`);
        } else {
          console.log('📵 No active orders from server - clearing all data');
          setCourierLocations([]);
          dataRetentionRef.current = [];
          setLastUpdateTime(null);
        }
      });
      socketRef.current.on("locationUpdate", (data: any) => {
        if (!data || !data.orderId) return;
        if (!data.firmaid || data.firmaid !== firmId) return;
        
        // Konum validasyonu
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        
        console.log(`📍 Canlı konum alındı - Kurye: ${data.courier_name || data.courierId}, Sipariş: ${data.orderId}`);
        
        const now = Date.now();
        if (now - lastUpdateRef.current < 500) return; // 500ms throttle for UI updates
        lastUpdateRef.current = now;
        
        setCourierLocations((prevLocations) => {
          const index = prevLocations.findIndex(
            (loc) => loc.courierId === data.courierId && loc.orderId === data.orderId
          );
          
          const updatedLocation = {
            courierId: data.courierId,
            orderId: data.orderId,
            latitude: lat,
            longitude: lng,
            firmaid: data.firmaid,
            phone: data.phone || data.courier_phone,
            courier_name: data.courier_name,
            courier_phone: data.courier_phone,
            timestamp: data.timestamp || new Date().toISOString(),
            accuracy: data.accuracy || null,
            speed: data.speed || 0,
            heading: data.heading || 0
          };
          
          let newLocations;
          if (index !== -1) {
            newLocations = [...prevLocations];
            newLocations[index] = updatedLocation;
          } else {
            newLocations = [...prevLocations, updatedLocation];
          }
          
          // Güncellenmiş verileri sakla ve son güncelleme zamanını kaydet
          dataRetentionRef.current = newLocations;
                  // Veri alındığını işaretle
        lastDataReceived.current = Date.now();
        setConnectionHealth('healthy');
        
        // Güncellenmiş verileri sakla ve son güncelleme zamanını kaydet
        dataRetentionRef.current = newLocations;
        setLastUpdateTime(new Date().toISOString());
        return newLocations;
        });
      });
      socketRef.current.on("trackingEnded", (data: any) => {
        if (data && data.orderId) {
          console.log(`🛑 Tracking ended for order: ${data.orderId} - removing from stored data too`);
          setCourierLocations((prevLocations) => {
            const filteredLocations = prevLocations.filter((loc) => loc.orderId !== data.orderId);
            // Filtrelenmiş verileri sakla VE dataRetentionRef'i de temizle
            dataRetentionRef.current = filteredLocations;
            console.log(`💾 Removed order ${data.orderId} from tracking and persistence`);
            return filteredLocations;
          });
        }
      });
      
      // Sipariş silinince tracking'i durdur
      socketRef.current.on("orderDeleted", (data: any) => {
        if (data && data.orderId) {
          console.log(`🗑️ Order deleted: ${data.orderId} - removing from tracking and stored data`);
          setCourierLocations((prevLocations) => {
            const filteredLocations = prevLocations.filter((loc) => loc.orderId !== data.orderId);
            // Filtrelenmiş verileri sakla VE dataRetentionRef'i de temizle
            dataRetentionRef.current = filteredLocations;
            console.log(`💾 Removed order ${data.orderId} from both active and stored locations`);
            return filteredLocations;
          });
          
          // 1 saniye sonra server'dan fresh data çekerek doğrula
          setTimeout(() => {
            if (socketRef.current && socketRef.current.connected) {
              console.log('🔄 Validating data after order deletion');
              socketRef.current.emit("requestActiveOrders", { firmId });
            }
          }, 1000);
        }
      });

      // Sipariş durumu değişikliklerini dinle
      socketRef.current.on("orderStatusUpdate", (data: any) => {
        console.log(`📋 Sipariş durumu güncellendi:`, data);
        
        // Eğer sipariş teslim edildi veya iptal edildi durumuna geçtiyse tracking'i durdur
        if (data.orderId && (data.status === 'teslim edildi' || data.status === 'iptal edildi')) {
          console.log(`🛑 Order ${data.orderId} finished (${data.status}) - removing from tracking`);
          setCourierLocations((prevLocations) => {
            const filteredLocations = prevLocations.filter((loc) => loc.orderId !== data.orderId);
            dataRetentionRef.current = filteredLocations;
            return filteredLocations;
          });
        }
        
        // Sipariş durumu değiştiğinde aktif siparişleri tekrar al
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("requestActiveOrders", { firmId });
        }
      });

      socketRef.current.on("orderAccepted", (data: any) => {
        console.log(`✅ Sipariş kabul edildi:`, data);
        // Yeni sipariş kabul edildiğinde aktif siparişleri güncelle
        socketRef.current.emit("requestActiveOrders", { firmId });
      });

      // Listen for order status changes (real-time updates)
      socketRef.current.on("orderStatusChanged", (data: { 
        orderId: string, 
        newStatus: string, 
        courierName?: string, 
        message: string, 
        timestamp: number 
      }) => {
        console.log("📡 RestaurantLiveMap received order status change:", data);
        
        if (data.newStatus === "kuryede") {
          // Check for duplicate notification
          if (isDuplicateNotification("order_accepted", data.orderId)) {
            return; // Skip duplicate
          }
          
          // Play notification sound
          playNotificationSound();
          
          // Sipariş kabul edildiğinde aktif siparişleri güncelle
          socketRef.current.emit("requestActiveOrders", { firmId });
          console.log(`🔄 RestaurantLiveMap: Order ${data.orderId} accepted, requesting active orders`);
        }
      });

      // Listen for order cancellations
      socketRef.current.on("orderCancelled", (data: { 
        orderId: string, 
        courierName: string, 
        reason: string, 
        message: string, 
        newStatus: string, 
        timestamp: number 
      }) => {
        console.log("❌ RestaurantLiveMap received order cancellation:", data);
        
        if (data.newStatus === "bekleniyor") {
          // Check for duplicate notification
          if (isDuplicateNotification("order_cancelled", data.orderId)) {
            return; // Skip duplicate
          }
          
          // Play notification sound
          playNotificationSound();
          
          // Sipariş iptal edilip tekrar havuza düştüğünde aktif siparişleri güncelle
          socketRef.current.emit("requestActiveOrders", { firmId });
          console.log(`🔄 RestaurantLiveMap: Order ${data.orderId} cancelled by courier, requesting active orders`);
        }
      });

      // Listen for order delivery notifications
      socketRef.current.on("orderDelivered", (data: { 
        orderId: string, 
        courierName: string, 
        paymentMethod: string, 
        message: string, 
        timestamp: number 
      }) => {
        console.log("📦 RestaurantLiveMap received order delivery notification:", data);
        
        // Check for duplicate notification
        if (isDuplicateNotification("order_delivered", data.orderId)) {
          return; // Skip duplicate
        }
        
        // Play notification sound
        playNotificationSound();
        
        // Sipariş teslim edildiğinde aktif siparişleri güncelle
        socketRef.current.emit("requestActiveOrders", { firmId });
        console.log(`🔄 RestaurantLiveMap: Order ${data.orderId} delivered by courier ${data.courierName}, requesting active orders`);
      });



      // Listen for force logout events (concurrent session control)
      socketRef.current.on("forceLogout", async (data: { reason: string, message: string }) => {
        console.log("🔐 Force logout event received:", data);
        
        // Show alert to user
        Alert.alert(
          "Oturum Sonlandırıldı",
          data.message || "Hesabınıza başka bir cihazdan giriş yapıldı.",
          [
            {
              text: "Tamam",
              onPress: () => {
                // Clear all user data
                AsyncStorage.multiRemove(['userData', 'userId', 'userToken'])
                  .then(() => {
                    // Navigate to login screen
                    router.replace("/(auth)/sign-in");
                  })
                  .catch((error) => {
                    console.error("Force logout cleanup error:", error);
                    router.replace("/(auth)/sign-in");
                  });
              }
            }
          ],
          { cancelable: false }
        );
      });

      // Periyodik güncelleme - 30 saniyede bir aktif siparişleri kontrol et
      const quickRefreshId = setInterval(() => {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("requestActiveOrders", { firmId });
        }
      }, 30000);
      
              // Kapsamlı temizleme - 1 dakikada bir eski siparişleri temizle
      const deepCleanupId = setInterval(() => {
        const now = Date.now();
        const timeSinceLastData = now - lastDataReceived.current;
        
        // Bağlantı sağlığını kontrol et
        if (timeSinceLastData > 120000) { // 2 dakikadan fazla veri gelmemişse
          console.log('⚠️ RestaurantLiveMap: No data received for 2+ minutes, connection may be stale');
          setConnectionHealth('error');
          
          // Socket'i yeniden bağla
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
            setSocketConnected(false);
          }
          
          // Yeni bağlantı kur
          setTimeout(() => {
            socketRef.current = io(API_CONFIG.SOCKET_URL, { transports: ["websocket"] });
            // Socket event'lerini tekrar tanımla... (bu kısım mevcut kodda zaten var)
          }, 1000);
          
        } else if (timeSinceLastData > 60000) {
          setConnectionHealth('warning');
        } else {
          setConnectionHealth('healthy');
        }
        
        if (socketRef.current && socketRef.current.connected) {
          console.log('🧹 RestaurantLiveMap: Deep cleanup - refreshing active orders');
          
          // Fresh data çek
          socketRef.current.emit("requestActiveOrders", { firmId });
          
          // Eski timestamp'lı verilerı temizle (3 dakikadan eski)
          const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
          setCourierLocations(prevLocations => {
            const filteredLocations = prevLocations.filter(loc => {
              if (!loc.timestamp) {
                // Timestamp yoksa 1 dakika grace period ver, sonra sil
                return Date.now() - lastDataReceived.current < 60000;
              }
              return loc.timestamp > threeMinutesAgo;
            });
            
            if (filteredLocations.length !== prevLocations.length) {
              console.log(`🗑️ Deep cleanup: Removed ${prevLocations.length - filteredLocations.length} stale location entries`);
              dataRetentionRef.current = filteredLocations;
            }
            
            return filteredLocations;
          });
          
          // Veriler çok eskiyse tümünü temizle
          if (timeSinceLastData > 180000) { // 3 dakika
            console.log('🧹 Force clearing all locations due to stale data');
            setCourierLocations([]);
            dataRetentionRef.current = [];
            setLastUpdateTime(null);
          }
        }
      }, 60000); // 1 dakika = 60000ms

      return () => {
        clearInterval(quickRefreshId);
        clearInterval(deepCleanupId);
        // Sayfa değişiminde socket'i kapatma (persistence için)
        // Socket sadece component unmount olduğunda kapanacak
        console.log('📱 Sayfa değişimi - socket bağlantısı korunuyor');
      };
    }, [user])
  );

  // Component unmount olduğunda socket'i kapat
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        console.log('📵 Component unmount - socket bağlantısı kapatılıyor');
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocketConnected(false);
      }
    };
  }, []);

  // Tüm kuryeleri ekrana sığdır (auto-fit bounds)
  const fitAllCouriers = useCallback(() => {
    if (mapRef.current && courierLocations.length > 0) {
      if (courierLocations.length === 1) {
        // Tek kurye varsa ona zoom yap
        const courier = courierLocations[0];
        mapRef.current.animateToRegion({
          latitude: courier.latitude,
          longitude: courier.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      } else if (courierLocations.length > 1) {
        // Birden fazla kurye varsa hepsini kapsayacak şekilde fit et
        const coordinates = courierLocations.map(loc => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
        }));
        
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 150, right: 50, bottom: 100, left: 50 },
          animated: true,
        });
      }
    }
  }, [courierLocations]);

  // Manuel kurye odaklama butonu için fonksiyon
  const focusOnCouriers = useCallback(() => {
    setAutoFitEnabled(true);
    fitAllCouriers();
  }, [fitAllCouriers]);

  // Dinamik initial region hesaplama
  const getInitialRegion = useCallback(() => {
    if (courierLocations.length > 0) {
      // Kurye varsa ilk kuryenin konumunu kullan
      const firstCourier = courierLocations[0];
      return {
        latitude: firstCourier.latitude,
        longitude: firstCourier.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    } else {
      // Kurye yoksa varsayılan konumu kullan
      return {
        latitude: userLocation ? userLocation.latitude : 37.06622,
        longitude: userLocation ? userLocation.longitude : 37.38332,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }
  }, [courierLocations, userLocation]);

  // Harita üzerinde kullanıcı etkileşimi olduğunda otomatik fit'i durdur
  const handleMapInteraction = useCallback(() => {
    setAutoFitEnabled(false);
  }, []);

  // İlk kurye verileri geldiğinde haritayı kuryelere odakla
  const [initialFocusDone, setInitialFocusDone] = useState<boolean>(false);
  
  useEffect(() => {
    if (courierLocations.length > 0 && !initialFocusDone) {
      // İlk kez kurye verileri geldiğinde direkt odakla
      setTimeout(() => {
        fitAllCouriers();
        setInitialFocusDone(true);
      }, 800); // Harita render olduktan sonra odakla
    }
  }, [courierLocations, initialFocusDone, fitAllCouriers]);

  // Kurye konumları değiştiğinde otomatik fit yap (sadece autoFit etkinse ve ilk odaklama yapıldıysa)
  useEffect(() => {
    if (autoFitEnabled && initialFocusDone) {
      const timeoutId = setTimeout(() => {
        fitAllCouriers();
      }, 500); // 500ms bekle, ardından fit yap
      
      return () => clearTimeout(timeoutId);
    }
  }, [courierLocations, fitAllCouriers, autoFitEnabled, initialFocusDone]);

  // Koşullu return, tüm hook'lardan sonra
  if (!isLoaded || !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const firmId = user.publicMetadata?.firmId || user.id;

  // Eğer aktif sipariş yoksa, harita erişimi engellensin
  if (!isLoading && courierLocations.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>
            Canlı Kurye Takibi
          </Text>
        </View>
        <View style={styles.emptyStateContainer}>
          <Ionicons name="map-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyStateText}>
            Aktif sipariş bulunamadı.{"\n"}Haritaya erişim yok.
          </Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => {
              setIsLoading(true);
              if (socketRef.current) {
                socketRef.current.emit("requestActiveOrders", { firmId });
              }
              setTimeout(() => setIsLoading(false), 2000);
            }}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>
              Aktif Siparişleri Yenile
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.activeHeaderContainer}>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleContainer}>
            <View>
              <Text style={styles.headerTitle}>
                Canlı Kurye Takibi
              </Text>
              <View style={styles.statusContainer}>
                {lastUpdateTime && (
                  <Text style={styles.lastUpdateText}>
                    Son konum: {formatTimestamp(lastUpdateTime)}
                  </Text>
                )}
                <View style={[styles.connectionIndicator, 
                  connectionHealth === 'healthy' ? styles.connectionHealthy : 
                  connectionHealth === 'warning' ? styles.connectionWarning : styles.connectionError]}>
                  <Text style={styles.connectionText}>
                    {connectionHealth === 'healthy' ? '• Canlı' : 
                     connectionHealth === 'warning' ? '• Bekliyor' : '• Bağlantı Sorunu'}
                  </Text>
                </View>
              </View>
            </View>
            {courierLocations.length > 0 && (
              <View style={styles.orderCountBadge}>
                <Text style={styles.orderCountText}>
                  {courierLocations.length} aktif
                </Text>
              </View>
            )}
          </View>
          {courierLocations.length > 0 && (
            <TouchableOpacity
              style={styles.fitAllButton}
              onPress={fitAllCouriers}
            >
                              <Ionicons name="scan-outline" size={16} color="#8B5CF6" />
              <Text style={styles.fitAllButtonText}>Kuryeleri Odakla</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingMapContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.connectingText}>
            Bağlantı kuruluyor...
          </Text>
        </View>
      ) : (
        <>
                      <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              customMapStyle={mapStyle}
              showsUserLocation={true}
              showsMyLocationButton={false}
              showsCompass={true}
              rotateEnabled={true}
              onRegionChangeStart={handleMapInteraction}
              onPanDrag={handleMapInteraction}
              initialRegion={getInitialRegion()}
            >
            {courierLocations.map((loc, index) => {
              if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
                const markerKey = `marker-${loc.orderId}-${loc.courierId}-${index}-${Math.random().toString(36).substr(2, 5)}`;
                return (
                  <Marker
                    key={markerKey}
                    coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                    title={loc.courier_name ? `Kurye: ${loc.courier_name}` : `Kurye ${loc.courierId}`}
                    description={loc.courier_phone ? `Tel: ${loc.courier_phone} | Sipariş: ${loc.orderId}` : `Sipariş: ${loc.orderId}`}
                  >
                    <View style={styles.markerContainer}>
                      <Ionicons name="bicycle" size={24} color="white" />
                    </View>
                  </Marker>
                );
              }
              return null;
            })}
          </MapView>

          {/* Kurye Bilgi Balonları */}
          <View style={styles.orderBubblesContainer}>
            {courierLocations.map((loc, index) => {
              // Enhanced unique key generation to prevent duplicate key warnings
              const bubbleKey = `${loc.courierId}-${loc.orderId}`;
              const randomSuffix = Math.random().toString(36).substr(2, 9);
              const uniqueKey = `${bubbleKey}-${index}-${randomSuffix}-${Date.now()}`;
              const isExpanded = expandedBubble === bubbleKey;
              
              return (
                <TouchableOpacity
                  key={uniqueKey}
                  style={[
                    styles.courierInfoBubble,
                    isExpanded ? styles.expandedBubble : styles.collapsedBubble
                  ]}
                  onPress={() => {
                    setExpandedBubble(isExpanded ? null : bubbleKey);
                  }}
                  activeOpacity={0.7}
                >
                  {!isExpanded ? (
                    // Küçük hali - sadece kurye adı ve sipariş numarası
                    <View style={styles.collapsedContent}>
                      <Ionicons name="bicycle" size={16} color="#FFFFFF" />
                      <View style={styles.collapsedTextContainer}>
                        <Text style={styles.collapsedCourierName}>
                          {loc.courier_name || `Kurye ${loc.courierId}`}
                        </Text>
                        <Text style={styles.collapsedOrderId}>
                          #{loc.orderId}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    // Genişletilmiş hali - tüm bilgiler ve butonlar
                    <View style={styles.expandedContent}>
                      <TouchableOpacity
                        style={styles.bubbleMapButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (mapRef.current) {
                            mapRef.current.animateToRegion({
                              latitude: loc.latitude,
                              longitude: loc.longitude,
                              latitudeDelta: 0.01,
                              longitudeDelta: 0.01,
                            }, 1000);
                          }
                        }}
                      >
                        <Ionicons name="location" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                      
                      <View style={styles.courierInfoContent}>
                        <Text style={styles.courierName}>
                          {loc.courier_name || `Kurye ${loc.courierId}`}
                        </Text>
                        <Text style={styles.orderIdText}>
                          Sipariş #{loc.orderId}
                        </Text>
                        {loc.courier_phone && (
                          <TouchableOpacity
                            style={styles.phoneButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              const phoneNumber = loc.courier_phone?.replace(/\D/g, '');
                              if (phoneNumber) {
                                Linking.openURL(`tel:${phoneNumber}`).catch((err) => {
                                  Alert.alert('Hata', 'Arama özelliği kullanılamıyor');
                                });
                              }
                            }}
                          >
                            <Ionicons name="call" size={14} color="#FFFFFF" />
                            <Text style={styles.phoneButtonText}>
                              {loc.courier_phone}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.timestampText}>
                          Son güncelleme: {formatTimestamp(loc.timestamp)}
                        </Text>
                        {loc.speed !== undefined && loc.speed > 0 && (
                          <Text style={styles.speedText}>
                            Hız: {Math.round(loc.speed * 3.6)} km/h
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Kuryelere Odaklan Butonu */}
          <TouchableOpacity
            style={styles.locationButton}
            onPress={focusOnCouriers}
          >
            <Ionicons name="scan-outline" size={24} color="#8B5CF6" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

export default RestaurantLiveMap;

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF'
  },
  loadingText: {
    marginTop: 16,
    color: '#374151'
  },
  headerContainer: {
    backgroundColor: '#8B5CF6',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  activeHeaderContainer: {
    backgroundColor: '#8B5CF6',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center'
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  emptyStateText: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24
  },
  retryButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16
  },
  loadingMapContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  connectingText: {
    color: '#6B7280',
    marginTop: 16
  },
  markerContainer: {
    backgroundColor: '#8B5CF6',
    padding: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  orderBubblesContainer: {
    position: 'absolute',
    top: 130,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  orderBubble: {
    backgroundColor: '#8B5CF6',
    borderRadius: 25,
    marginBottom: 8,
    marginLeft: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3
  },
  courierInfoBubble: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  collapsedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
    maxWidth: 150,
  },
  expandedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  },
  expandedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  collapsedTextContainer: {
    marginLeft: 8,
    flex: 1,
  },
  collapsedCourierName: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
    lineHeight: 14,
  },
  collapsedOrderId: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
    lineHeight: 12,
  },
  bubbleMapButton: {
    backgroundColor: '#6D28D9',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierInfoContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  },
  courierName: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 2,
  },
  orderIdText: {
    color: '#FFFFFF',
    fontSize: 11,
    opacity: 0.8,
    marginBottom: 4,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  phoneButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  bubbleContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center'
  },
  bubbleOrderId: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14
  },
  bubblePhone: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9
  },
  locationButton: {
    position: 'absolute',
    bottom: 128,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 20
  },
  header: {
    fontSize: 20,
    fontWeight: "bold",
  },
  map: { flex: 1 },
  loadingOverlay: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bubbleContainer: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "column",
    alignItems: "flex-end",
  },
  courierBubble: {
    backgroundColor: "#2575fc",
    borderRadius: 15,
    padding: 5,
    marginVertical: 2,
    minWidth: 30,
    alignItems: "center",
  },
  bubbleText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  centerButton: {
    position: "absolute",
    bottom: 140,
    right: 20,
    backgroundColor: "#2575fc",
    padding: 10,
    borderRadius: 5,
  },
  centerButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  timestampText: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
    marginTop: 2,
  },
  speedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orderCountBadge: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  orderCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  fitAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fitAllButtonText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  lastUpdateText: {
    color: '#FFFFFF',
    fontSize: 11,
    opacity: 0.8,
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 8,
  },
  connectionIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  connectionHealthy: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  connectionWarning: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  connectionError: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  connectionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
