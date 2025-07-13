import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Modal,
  Platform,
  Linking,
  ScrollView,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect, router } from "expo-router";
import * as Location from "expo-location";
import * as Notifications from 'expo-notifications';
import io from "socket.io-client";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { API_CONFIG, API_ENDPOINTS, getFullUrl, authedFetch } from "../../constants/api";
import { calculateAcceptanceCountdown, calculateDeletionCountdown, calculateDeliveryCountdown } from "../../lib/timeUtils";
import NotificationButton from "../../components/NotificationButton";
import { playNotificationSound, updateCachedSound } from "../../lib/notificationSoundUtils";
import PushNotificationService from "../../lib/pushNotificationService";
// Timezone import'ları kaldırıldı - artık basit hesaplama kullanıyoruz

// Notification handler configuration
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowList: true,
  }),
});

interface Order {
  firmaid: string;
  id: string | number;
  created_at: string;
  accepted_at?: string; // Kabul edilme zamanı
  title: string;
  kurye_tutari: number;
  courier_price: number; // Kurye ücreti
  status: string;
  mahalle: string;
  odeme_yontemi: string;
  firma_adi: string;
  resim?: string;
  logo_url?: string; // Restoran logosu
  preparation_time?: number; // Hazırlık süresi (dakika)
}

interface FailedOrder {
  orderId: string;
  reason: string;
  takenBy?: string;
  error?: string;
  }
  
  // Custom hook for countdown timer - Basit hesaplama (backend UTC kullanıyor)
const useCountdown = (targetTime: Date | null, orderId: string | number) => {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, isExpired: false });
  
  useEffect(() => {
    if (!targetTime) return;
    
    const updateCountdown = () => {
      const now = new Date();
      const diff = targetTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown({ hours, minutes, seconds, isExpired: false });
    };
    
    // İlk hesaplama
    updateCountdown();
    
    // Interval başlat
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [targetTime?.getTime()]); // targetTime'ın değişip değişmediğini kontrol et
  
  return countdown;
};

// Bekleniyor siparişler için countdown komponenti - Stateless
const OrderCountdown: React.FC<{ order: Order }> = ({ order }) => {
  const [tick, setTick] = useState(0); // Re-render için state
  
  useEffect(() => {
    // Her saniye re-render için interval
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Stateless hesaplamalar
  const acceptanceCountdown = calculateAcceptanceCountdown(order.created_at);
  const deletionCountdown = calculateDeletionCountdown(order.created_at);
  
  // Eğer kabul yasağı devam ediyorsa
  if (!acceptanceCountdown.isExpired) {
    return (
      <View style={styles.countdownContainer}>
        <View style={[styles.countdownBadge, { backgroundColor: '#EF4444' }]}>
          <Ionicons name="time" size={12} color="#FFFFFF" />
          <Text style={styles.countdownText}>
            {acceptanceCountdown.seconds}s sonra kabul edilebilir
          </Text>
        </View>
      </View>
    );
  }
  
  // Kabul yasağı bitti, otomatik silme countdown'u göster
  if (!deletionCountdown.isExpired) {
    const timeLeft = deletionCountdown.hours > 0 
      ? `${deletionCountdown.hours}sa ${deletionCountdown.minutes}dk`
      : `${deletionCountdown.minutes}dk ${deletionCountdown.seconds}s`;
      
    return (
      <View style={styles.countdownContainer}>
        <View style={[styles.countdownBadge, { backgroundColor: '#F59E0B' }]}>
          <Ionicons name="hourglass" size={12} color="#FFFFFF" />
          <Text style={styles.countdownText}>
            {timeLeft} sonra silinecek
          </Text>
        </View>
      </View>
    );
  }
  
  return null;
};

// Delivery countdown için yardımcı fonksiyon artık timeUtils'te

// Teslimat countdown hook'u - Basit hesaplama (backend UTC kullanıyor)
const useDeliveryCountdown = (acceptedTime: Date | null, orderId: string | number) => {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, isExpired: false });
  
  useEffect(() => {
    if (!acceptedTime) return;
    
    const updateCountdown = () => {
      const now = new Date();
      const deliveryDeadline = new Date(acceptedTime.getTime() + 3600000); // 1 saat sonra
      const diff = deliveryDeadline.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown({ hours, minutes, seconds, isExpired: false });
    };
    
    // İlk hesaplama
    updateCountdown();
    
    // Interval başlat
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [acceptedTime?.getTime()]); // acceptedTime'ın değişip değişmediğini kontrol et
  
  return countdown;
};

// Teslimat countdown komponenti (kuryede durumundaki siparişler için) - Stateless
const DeliveryCountdown: React.FC<{ order: Order }> = ({ order }) => {
  const [tick, setTick] = useState(0); // Re-render için state
  
  useEffect(() => {
    // Her saniye re-render için interval
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Stateless hesaplama
  const acceptedTime = order.accepted_at || order.created_at;
  const deliveryCountdown = calculateDeliveryCountdown(acceptedTime);
  const acceptedAt = new Date(acceptedTime);
  
  if (deliveryCountdown.isExpired) {
    return (
      <View style={styles.deliveryCountdownContainer}>
        <View style={[styles.deliveryCountdownCard, { backgroundColor: '#EF4444' }]}>
          <View style={styles.deliveryCountdownHeader}>
            <Ionicons name="warning" size={12} color="#FFFFFF" />
            <Text style={styles.deliveryCountdownTitle}>SÜRE AŞILDI!</Text>
          </View>
          <Text style={styles.deliveryCountdownSubtext}>
            Lütfen en kısa sürede teslim edin
          </Text>
        </View>
      </View>
    );
  }
  
  const timeLeft = deliveryCountdown.hours > 0 
    ? `${deliveryCountdown.hours}sa ${deliveryCountdown.minutes}dk`
    : `${deliveryCountdown.minutes}dk ${deliveryCountdown.seconds}s`;
    
  const isUrgent = deliveryCountdown.hours === 0 && deliveryCountdown.minutes < 15;
  const isModerate = deliveryCountdown.hours === 0 && deliveryCountdown.minutes < 30;
  
  const backgroundColor = isUrgent ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';
  const statusText = isUrgent ? 'ACİL TESLİMAT!' : isModerate ? 'HIZLI TESLİMAT' : 'TESLİMAT SÜRESİ';
  
  return (
    <View style={styles.deliveryCountdownContainer}>
      <View style={[styles.deliveryCountdownCard, { backgroundColor }]}>
        <View style={styles.deliveryCountdownHeader}>
          <Ionicons name="timer" size={12} color="#FFFFFF" />
          <Text style={styles.deliveryCountdownTitle}>{statusText}</Text>
        </View>
        <Text style={styles.deliveryCountdownTime}>
          {timeLeft} kaldı
        </Text>
        <Text style={styles.deliveryCountdownSubtext}>
          Kabul: {acceptedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
};

const KuryeHome = () => {
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [acceptedOrders, setAcceptedOrders] = useState<Order[]>([]);
  const [pendingApprovalOrders, setPendingApprovalOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [orderDetailModalVisible, setOrderDetailModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [blockedOrders, setBlockedOrders] = useState<Set<string>>(new Set());
  
  // Tam ekran resim modalı için state'ler
  const [fullScreenModalVisible, setFullScreenModalVisible] = useState(false);
  const [fullScreenImageUri, setFullScreenImageUri] = useState<string | null>(null);
  
  // Tam ekran resim modalını açan fonksiyon
  const openFullScreenImage = (uri: string) => {
    console.log("Image pressed, URI:", uri);
    setOrderDetailModalVisible(false);
    setFullScreenImageUri(uri);
    setFullScreenModalVisible(true);
  };
  
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);

  // Çevrimiçi durumu için yeni state'ler - İlk açılışta varsayılan true
  const [isOnline, setIsOnline] = useState<boolean>(true); // Varsayılan olarak çevrimiçi
  const [onlineStartTime, setOnlineStartTime] = useState<Date | null>(null); // Başlangıçta null, sonra doğru zamanla set edilecek

  const [totalOnlineTime, setTotalOnlineTime] = useState<{ hours: number, minutes: number }>({ hours: 0, minutes: 0 });
  
  // Kurye paket limit bilgileri
  const [packageLimit, setPackageLimit] = useState<number>(5);
  const [currentActiveOrders, setCurrentActiveOrders] = useState<number>(0);
  
  // Aktivite tracking state'leri
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [dailyStats, setDailyStats] = useState({
    todayMinutes: 0,
    todayHours: 0,
    todaySessions: 0
  });

  const socketRef = useRef<any>(null);
  const acceptSelectedOrdersRef = useRef<(() => Promise<void>) | null>(null);

  // Toplam çevrimiçi süresini yükle
  const loadTotalOnlineTime = async (courierId: string) => {
    try {
      const response = await authedFetch(getFullUrl(`/api/couriers/${courierId}/total-online-time`));
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.totalTime) {
          setTotalOnlineTime({
            hours: data.totalTime.hours || 0,
            minutes: data.totalTime.minutes || 0
          });
        }
      }
    } catch (error) {
      // Sessizce hata yakala
    }
  };

  // Çevrimiçi süresini veritabanına kaydet
  const saveTotalOnlineTime = async (courierId: string, additionalMinutes: number) => {
    try {
      const response = await authedFetch(getFullUrl(`/api/couriers/${courierId}/total-online-time`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ additionalMinutes })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.totalTime) {
          setTotalOnlineTime({
            hours: data.totalTime.hours || 0,
            minutes: data.totalTime.minutes || 0
          });
        }
      }
    } catch (error) {
      // Sessizce hata yakala
    }
  };

  // Aktivite oturumu başlat
  const startActivitySession = async () => {
    if (!user?.id) {
      return;
    }
    
    if (currentSessionId) {
      return;
    }
    
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.START_ACTIVITY_SESSION(user.id)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCurrentSessionId(data.sessionId);
          setSessionStartTime(new Date());
        }
      }
    } catch (error) {
      // Sessizce hata yakala
    }
  };

  // Aktivite oturumu sonlandır
  const endActivitySession = async () => {
    if (!user?.id || !currentSessionId) {
      return;
    }
    
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.END_ACTIVITY_SESSION(user.id)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Local state'i güncelle
          setCurrentSessionId(null);
          setSessionStartTime(null);
          
          // Günlük istatistikleri güncelle
          fetchDailyActivityStats();
        } else {
          // Backend'de oturum yoksa local state'i temizle
          setCurrentSessionId(null);
          setSessionStartTime(null);
        }
      } else {
        // Hata durumunda local state'i temizle
        if (response.status === 404) {
          setCurrentSessionId(null);
          setSessionStartTime(null);
        }
      }
    } catch (error) {
      // Network hatası durumunda da local state'i temizle
      setCurrentSessionId(null);
      setSessionStartTime(null);
    }
  };

  // Günlük aktivite istatistiklerini getir
  const fetchDailyActivityStats = async () => {
    if (!user) return;
    
    try {
      const response = await authedFetch(
        `${getFullUrl(API_ENDPOINTS.GET_COURIER_ACTIVITY_REPORT(user.id))}?period=daily&limit=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.daily && data.data.daily.length > 0) {
          const todayData = data.data.daily[0];
          setDailyStats({
            todayMinutes: todayData.total_minutes || 0,
            todayHours: todayData.hours || 0,
            todaySessions: todayData.session_count || 0
          });
        }
      }
    } catch (error) {
      // Sessizce hata yakala
    }
  };



  // Notification permission setup and push token registration
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        // Request notification permissions
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('❌ Push notification izni reddedildi');
          return;
        }

        // Push notification token'ını kaydet
        const storedUser = await AsyncStorage.getItem('userData');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          if (userData.id) {
            const token = await PushNotificationService.registerForPushNotifications(
              userData.id.toString(), 
              'courier'
            );
            console.log('✅ Courier push token kaydedildi:', token ? 'başarılı' : 'başarısız');
          }
        }
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };
    
    setupNotifications();
  }, []);

  // Show notification for new order
  const showOrderNotification = useCallback(async (order: Order) => {
    try {
      // Show notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🆕 Yeni Sipariş!",
          subtitle: `${order.firma_adi}`,
          body: `${order.mahalle} - ${order.courier_price || order.kurye_tutari} ₺`,
          data: { 
            orderId: order.id.toString(),
            type: 'new_order'
          },
          sound: true,
        },
        trigger: null, // Show immediately
      });

      // Removed alert popup for seamless experience
      // Alert.alert(
      //   "🆕 Yeni Sipariş Geldi!",
      //   `${order.firma_adi}\n${order.mahalle} - ${order.kurye_tutari} ₺\n\nSiparişi kabul etmek istiyor musunuz?`,
      //   [
      //     {
      //       text: "Daha Sonra",
      //       style: "cancel"
      //     },
      //     {
      //       text: "Kabul Et",
      //       onPress: () => {
      //         setSelectedOrders([order.id.toString()]);
      //         acceptSelectedOrders();
      //       }
      //     }
      //   ],
      //   { cancelable: true }
      // );
    } catch (error) {
      // Notification error handling
    }
  }, []);

  // Çevrimiçi durumu değiştiren fonksiyon
  const toggleOnlineStatus = useCallback(async () => {
    if (!isOnline) {
      // Çevrimiçi olacak
      const now = new Date();
      setIsOnline(true);
      setOnlineStartTime(now);
      
      // Aktivite oturumu başlat
      await startActivitySession();
      
      // Backend'e çevrimiçi durumunu bildir
      if (socketRef.current) {
        socketRef.current.emit("courierOnline", { courierId: user.id });
      }
      
      // AsyncStorage'a çevrimiçi durumunu kaydet
      await AsyncStorage.setItem('courierOnlineStatus', 'true');
      
      // Günlük istatistikleri yükle
      await fetchDailyActivityStats();
      
      // Seçili siparişler varsa otomatik kabul et
      if (selectedOrders.length > 0) {
        // Paket limit kontrolü
        if (currentActiveOrders + selectedOrders.length <= packageLimit) {
          // Kısa bir gecikme sonrası otomatik kabul et (sessizce)
          setTimeout(async () => {
            if (acceptSelectedOrdersRef.current) {
              await acceptSelectedOrdersRef.current();
            }
          }, 500);
        } else {
          // Limit aşıldığında seçimi temizle (sessizce)
          setSelectedOrders([]);
        }
      }
    } else {
      Alert.alert(
        "⏸️ Çevrimdışı Olmak İstiyor musunuz?",
        "Çevrimdışı olduğunuzda yeni sipariş alamazsınız.\n\nDevam etmek istiyor musunuz?",
        [
          {
            text: "İptal",
            style: "cancel"
          },
          {
            text: "Çevrimdışı Ol",
            style: "destructive",
            onPress: async () => {
              // Çevrimdışı olmadan önce süreyi kaydet
              // Not: Online time tracking geçici olarak devre dışı
              
              // Aktivite oturumu sonlandır
              await endActivitySession();
              
              // Çevrimdışı olacak
              setIsOnline(false);
              setOnlineStartTime(null);
              
              // Backend'e çevrimdışı durumunu bildir
              if (socketRef.current) {
                socketRef.current.emit("courierOffline", { courierId: user.id });
              }
              
              // AsyncStorage'a çevrimdışı durumunu kaydet
              await AsyncStorage.setItem('courierOnlineStatus', 'false');
              
              Alert.alert("⏸️ Çevrimdışı", "Artık yeni sipariş alamazsınız.");
            }
          }
        ]
      );
    }
  }, [isOnline, user, selectedOrders, currentActiveOrders, packageLimit, acceptedOrders, startActivitySession, endActivitySession, fetchDailyActivityStats]);

  // Çevrimiçi süre takibi geçici olarak devre dışı

  // Heartbeat sistemi - çevrimiçi durumunu sürdürmek için
  useEffect(() => {
    let heartbeatInterval: ReturnType<typeof setInterval>;
    
    if (isOnline && user && socketRef.current) {
      // İlk heartbeat'i hemen gönder
      socketRef.current.emit("courierHeartbeat", { courierId: user.id });
      
      // Her 2 dakikada bir heartbeat gönder
      heartbeatInterval = setInterval(() => {
        if (socketRef.current && isOnline) {
          socketRef.current.emit("courierHeartbeat", { courierId: user.id });
        }
      }, 120000); // 2 dakika = 120000ms
    }
    
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [isOnline, user]);

  // Uygulama kapanırken aktivite oturumu sonlandır
  useEffect(() => {
    const handleAppStateChange = async () => {
      // Aktivite oturumu sonlandır
      if (currentSessionId) {
        await endActivitySession();
      }
    };

    return () => {
      handleAppStateChange();
    };
  }, [currentSessionId, endActivitySession]);

  // Real-time socket connection for new orders
  useEffect(() => {
    if (!user) return;

    const socket = io(API_CONFIG.SOCKET_URL, { 
      transports: ["websocket", "polling"],
      forceNew: true,
      timeout: 45000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      upgrade: true
    });

    socket.on("connect", async () => {
      console.log("🔌 Socket connected successfully - Kurye ID:", user.id);
      setError(null); // Clear any previous connection errors
      
      // Get user token for session management
      const token = await AsyncStorage.getItem('userToken');
      
      // Join courier room to receive new orders
      console.log(`📡 Kurye odasına katılıyor: courier_${user.id}`);
      socket.emit("joinCourierRoom", { courierId: user.id, token });
      
      // Genel kuryeler odasına da katıl
      console.log("📡 Genel kuryeler odasına katılıyor: couriers");
      socket.emit("joinRoom", { room: "couriers" });
      
      // Bağlantı test et
      setTimeout(() => {
        console.log("🧪 Socket bağlantısı test ediliyor...");
        socket.emit("testConnection", { courierId: user.id, timestamp: Date.now() });
      }, 2000);
      
      // Eğer çevrimiçi durumdaysa backend'e bildir
      if (isOnline) {
        socket.emit("courierOnline", { courierId: user.id });
        console.log("🔄 Socket bağlantısında çevrimiçi durum backend'e bildirildi");
      }
    });

    socket.on("connect_error", (err: any) => {
      console.log("Socket connection error:", err);
      setError("Bağlantı hatası: Sunucuya ulaşılamıyor");
      
      // Enhanced retry logic with fallback transport
      setTimeout(() => {
        if (socketRef.current && !socketRef.current.connected) {
          console.log("Attempting to reconnect kurye socket with fallback...");
          socketRef.current.connect();
        }
      }, 3000);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      if (reason === "io server disconnect") {
        setError("Sunucu bağlantısı kesildi");
        // Server forcefully disconnected, reconnect manually
        socket.connect();
      } else if (reason === "transport close" || reason === "transport error") {
        setError("Bağlantı problemi: Yeniden bağlanıyor...");
      }
    });

    socket.on("reconnect", (attemptNumber) => {
      console.log("Socket reconnected after", attemptNumber, "attempts");
      setError(null);
      // Rejoin courier room after reconnection
      socket.emit("joinCourierRoom", { courierId: user.id });
      
      // Eğer çevrimiçi durumdaysa backend'e yeniden bildir
      if (isOnline) {
        socket.emit("courierOnline", { courierId: user.id });
        console.log("🔄 Reconnect sonrası çevrimiçi durum backend'e bildirildi");
      }
      
      // Refresh orders after reconnection
      fetchOrders();
    });

    socket.on("reconnect_error", (err) => {
      console.log("Socket reconnection failed:", err);
      setError("Yeniden bağlanma başarısız");
    });

    // Test connection response
    socket.on("testConnectionResponse", (data: any) => {
      console.log("🧪 Test connection response alındı:", data);
      console.log(`✅ Socket bağlantısı çalışıyor - Ping: ${data.serverTimestamp - data.clientTimestamp}ms`);
    });

    // Listen for new orders
    socket.on("newOrder", (order: Order) => {
      console.log("📥 newOrder event alındı:", {
        orderId: order.id,
        status: order.status,
        firma_adi: order.firma_adi,
        mahalle: order.mahalle,
        courier_price: order.courier_price
      });
      
      // Add to orders list if it's waiting
      if (order.status === "bekleniyor") {
        console.log(`✅ Yeni sipariş listeye ekleniyor: #${order.id} - ${order.firma_adi}`);
        
        // İlk 10 saniye için siparişi blokla
        setBlockedOrders(prev => {
          const newSet = new Set(prev);
          newSet.add(order.id.toString());
          return newSet;
        });
        
        // 10 saniye sonra bloğu kaldır
        setTimeout(() => {
          setBlockedOrders(prev => {
            const newSet = new Set(prev);
            newSet.delete(order.id.toString());
            return newSet;
          });
        }, 10000);

        setOrders(prevOrders => {
          // Check if order already exists
          const exists = prevOrders.some(o => o.id === order.id);
          if (!exists) {
            console.log(`📋 Sipariş #${order.id} listeye eklendi`);
            const orders = [order, ...prevOrders];
            // Sort by creation date
            return orders.sort(
              (a: Order, b: Order) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          } else {
            console.log(`⚠️ Sipariş #${order.id} zaten listede mevcut`);
          }
          return prevOrders;
        });

        // Show notification - BU ARTIK PUSH NOTIFICATION ILE YAPILIYOR
        // showOrderNotification(order);
      } else {
        console.log(`❌ Sipariş #${order.id} bekleniyor durumunda değil: ${order.status}`);
      }
    });

    // Listen for order reminders
    socket.on("orderReminder", (data: { order: Order, message: string, timeSinceCreated: number, isReminder: boolean }) => {
      console.log("🔔 Order reminder received:", data);
      
      // Show enhanced notification for reminder
      Notifications.scheduleNotificationAsync({
        content: {
          title: "🔔 Sipariş Hatırlatması!",
          subtitle: `${data.order.firma_adi}`,
          body: `${data.order.mahalle} - ${data.order.courier_price || data.order.kurye_tutari} ₺ (${data.timeSinceCreated} dk bekliyor)`,
          data: { 
            orderId: data.order.id.toString(),
            type: 'order_reminder',
            isReminder: true,
            timeSinceCreated: data.timeSinceCreated
          },
          sound: 'default',
        },
        trigger: null, // Show immediately
      });

      // Update orders list to ensure it's up to date
      fetchOrders();
    });

    // Listen for admin notifications
    socket.on("adminNotification", (data: { title: string, message: string, priority: string, withSound: boolean, timestamp: string, type: string, sender: string }) => {
      console.log("📢 Admin notification received:", data);
      
      // Özel bildirim sesi çal
      if (data.withSound) {
        playNotificationSound().catch(error => {
          console.log('Bildirim sesi çalınamadı:', error);
        });
      }
      
      // Show admin notification
      Notifications.scheduleNotificationAsync({
        content: {
          title: `📢 ${data.title}`,
          subtitle: "Yönetici Bildirimi",
          body: data.message,
          data: { 
            type: 'admin_notification',
            priority: data.priority,
            sender: data.sender,
            timestamp: data.timestamp
          },
          sound: false, // Kendi ses sistemimizi kullanıyoruz
        },
        trigger: null, // Show immediately
      });

      // Show in-app alert for urgent messages
      if (data.priority === 'urgent') {
        Alert.alert(
          `🚨 ${data.title}`,
          data.message,
          [{ text: "Tamam", style: "default" }],
          { cancelable: false }
        );
      } else if (data.priority === 'high') {
        Alert.alert(
          `⚠️ ${data.title}`,
          data.message,
          [{ text: "Tamam", style: "default" }]
        );
      }
    });

    // Listen for order status updates
    socket.on("orderStatusUpdate", (data: { orderId: string, status: string, courierId?: string }) => {
      console.log("📡 Order status update received:", data);
      
      if (data.status === "kuryede") {
        // Remove from available orders if accepted by any courier (including self)
        setOrders(prevOrders => {
          const filteredOrders = prevOrders.filter(o => o.id.toString() !== data.orderId);
          console.log(`🗑️ Removed order ${data.orderId} from available orders list`);
          return filteredOrders;
        });
        
        // Also remove from selected orders if it was selected
        setSelectedOrders(prevSelected => {
          const filteredSelected = prevSelected.filter(id => id !== data.orderId);
          if (filteredSelected.length !== prevSelected.length) {
            console.log(`🗑️ Removed order ${data.orderId} from selected orders`);
          }
          return filteredSelected;
        });
      } else if (data.status === "bekleniyor") {
        // Refresh orders if order becomes available again
        console.log("🔄 Order became available again, refreshing orders");
        fetchOrders();
      }
      
      // Always refresh accepted orders for any status change
      fetchAcceptedOrders();
    });

    // Listen for order acceptance notifications (when any courier accepts an order)
    socket.on("orderAccepted", (data: { orderId: string, courierId: string, courierName: string, message: string }) => {
      console.log("✅ Order accepted event received:", data);
      
      // Remove from available orders list
      setOrders(prevOrders => {
        const filteredOrders = prevOrders.filter(o => o.id.toString() !== data.orderId);
        console.log(`🗑️ Removed accepted order ${data.orderId} from available orders list`);
        return filteredOrders;
      });
      
      // Remove from selected orders if it was selected
      setSelectedOrders(prevSelected => {
        const filteredSelected = prevSelected.filter(id => id !== data.orderId);
        if (filteredSelected.length !== prevSelected.length) {
          console.log(`🗑️ Removed accepted order ${data.orderId} from selected orders`);
        }
        return filteredSelected;
      });
      
      // Refresh accepted orders to update count
      fetchAcceptedOrders();
    });

    // Listen for order updates (when restaurants update order details)
    socket.on("orderUpdated", (data: { orderId: string, orderDetails: any, message: string }) => {
      // Refresh orders to show updated information
      fetchOrders();
      fetchAcceptedOrders();
    });

    // Listen for order deletion events
    socket.on("orderDeleted", (data: { orderId: string | number, message: string, showAlert?: boolean }) => {
      // Remove deleted order from the list
      setOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId.toString()));
      
      // Remove from selected orders if it was selected
      setSelectedOrders(prevSelected => prevSelected.filter(id => id !== data.orderId.toString()));
      
      // Refresh orders to ensure consistency
      fetchOrders();
      fetchAcceptedOrders();
      
      // Note: Alert gösterilmiyor, sadece KuryeOrders sayfasında gösterilecek
    });

    // Listen for order cancellation events
    socket.on("orderCancelled", (data: { orderId: string | number, message: string, cancelledBy?: string }) => {
      // Remove cancelled order from the list
      setOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId.toString()));
      
      // Remove from selected orders if it was selected
      setSelectedOrders(prevSelected => prevSelected.filter(id => id !== data.orderId.toString()));
      
      // Refresh orders to ensure consistency
      fetchOrders();
      fetchAcceptedOrders();
      
      // Note: Alert gösterilmiyor, sadece KuryeOrders sayfasında gösterilecek
    });

    // Listen for orders becoming available again after cancellation
    socket.on("orderAvailableAgain", (data: { orderId: string, message: string, status: string }) => {
      // Refresh orders to include the newly available order
      fetchOrders();
      
      // Show subtle notification
      showOrderNotification({
        id: data.orderId,
        title: "Sipariş Tekrar Müsait",
        kurye_tutari: 0,
        status: data.status,
        mahalle: "",
        odeme_yontemi: "",
        firma_adi: "Tekrar Müsait",
        firmaid: "",
        created_at: new Date().toISOString()
      } as Order);
    });

    // Yeni timer event'leri
    socket.on("orderAcceptanceEnabled", (data: { orderId: string }) => {
      // UI'da siparişin kabul edilebilir olduğunu göster (optional)
    });

    socket.on("orderAutoDeleted", (data: { orderId: string, message: string }) => {
      // Siparişi listeden kaldır
      setOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId));
      
      // Remove from selected orders if it was selected
      setSelectedOrders(prevSelected => prevSelected.filter(id => id !== data.orderId));
      
      // Note: Alert gösterilmiyor, sadece KuryeOrders sayfasında gösterilecek
    });

    socket.on("deliveryOverdue", (data: { orderId: string, message: string, orderDetails: any }) => {
      // Note: Alert gösterilmiyor, sadece KuryeOrders sayfasında gösterilecek
    });

    // Listen for notifications when your assigned order is cancelled by another courier
    socket.on("yourOrderCancelled", (data: { orderId: string, message: string, cancelledBy: string }) => {
      // Refresh orders and accepted orders to update the lists
      fetchOrders();
      fetchAcceptedOrders();
      
      // Note: Alert gösterilmiyor, sadece KuryeOrders sayfasında gösterilecek
    });

    // Listen for notifications when restaurant deletes an order you have accepted
    socket.on("orderDeletedByCourierNotification", (data: { 
      orderId: string, 
      message: string, 
      restaurantName: string,
      courierTip: string,
      neighborhood: string,
      timestamp: string 
    }) => {
      console.log("🗑️ Courier received order deletion by restaurant:", data);
      
      // Send push notification
      Notifications.scheduleNotificationAsync({
        content: {
          title: "🗑️ Sipariş İptal Edildi",
          body: `${data.restaurantName} tarafından sipariş #${data.orderId} silindi. Ücret: ${data.courierTip} ₺`,
          sound: 'default',
          data: { 
            orderId: data.orderId,
            restaurantName: data.restaurantName,
            courierTip: data.courierTip,
            type: 'orderDeletedByRestaurant'
          },
        },
        trigger: null, // Show immediately
      });
      
      // Refresh orders and accepted orders to update the lists
      fetchOrders();
      fetchAcceptedOrders();
    });

    // Listen for notification sound changes
    socket.on("notificationSoundChanged", (data: { soundId: string, soundName: string, soundPath: string, message: string, timestamp: string }) => {
      console.log("🔊 Bildirim sesi değişti:", data);
      
      // Cache'i güncelle
      updateCachedSound({
        id: data.soundId,
        name: data.soundName,
        file_path: data.soundPath
      });
      
      // Kullanıcıya bilgi ver
      console.log(`🎵 ${data.message}`);
    });

    // Listen for order delivery confirmations
    socket.on("orderDelivered", (data: { orderId: string, courierId: string, message: string }) => {
      console.log("📦 Order delivered event received:", data);
      
      // Refresh both lists to update counts
      fetchOrders();
      fetchAcceptedOrders();
    });

    // Listen for order approval confirmations
    socket.on("orderApproved", (data: { orderId: string, restaurantId: string, message: string, orderDetails: any }) => {
      console.log("✅ Order approved event received:", data);
      
      // Push notification gönder
      Notifications.scheduleNotificationAsync({
        content: {
          title: "✅ Sipariş Onaylandı!",
          body: `Sipariş #${data.orderId} restoran tarafından onaylandı. Ödeme tahsil edildi.`,
          sound: 'custom-notification',
          data: { 
            orderId: data.orderId,
            restaurantId: data.restaurantId,
            type: 'orderApproved'
          },
        },
        trigger: null, // Show immediately
      });
      
      // Refresh all lists to update counts including pending approvals
      fetchOrders();
      fetchAcceptedOrders();
      fetchPendingApprovalOrders();
      
      // Remove from pending approval orders immediately
      setPendingApprovalOrders(prevOrders => 
        prevOrders.filter(order => order.id.toString() !== data.orderId)
      );
    });

    // Listen for refresh order list requests
    socket.on("refreshOrderList", (data: { orderId: string, action: string, message: string }) => {
      console.log("🔄 Refresh order list event received:", data);
      
      // Sipariş listelerini yenile
      fetchOrders();
      fetchAcceptedOrders();
      fetchPendingApprovalOrders();
      
      // Pending approval orders varsa sıfırla (onaylandıysa)
      if (data.action === 'orderApproved') {
        setPendingApprovalOrders(prevOrders => 
          prevOrders.filter(order => order.id.toString() !== data.orderId)
        );
      }
      
      console.log("🔄 Order lists refreshed due to:", data.action);
    });

    // Listen for force logout events (concurrent session control)
    socket.on("forceLogout", async (data: { reason: string, message: string }) => {
      console.log("🔐 Force logout event received:", data);
      
      // Show alert to user
      Alert.alert(
        "Oturum Sonlandırıldı",
        data.message || "Hesabınıza başka bir cihazdan giriş yapıldı.",
        [
          {
            text: "Tamam",
            onPress: async () => {
              try {
                // Clear all user data
                await AsyncStorage.multiRemove(['userData', 'userId', 'userToken']);
                
                // Navigate to login screen
                router.replace("/(auth)/sign-in");
              } catch (error) {
                console.error("Force logout cleanup error:", error);
                router.replace("/(auth)/sign-in");
              }
            }
          }
        ],
        { cancelable: false }
      );
    });

    socketRef.current = socket;

    return () => {
      if (socket) {
        console.log("Cleaning up socket connection");
        socket.removeAllListeners();
        socket.disconnect();
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [user, showOrderNotification]);

  // Tüm async fonksiyonları burada tanımlıyorum (hook'lardan önce)
  const fetchAcceptedOrders = useCallback(async () => {
    if (!user) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_ACTIVE_ORDERS(user.id)), {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        setAcceptedOrders(data.data || []);
        setCurrentActiveOrders((data.data || []).length);
      } else {
        console.error(`❌ KuryeHome: Failed to fetch accepted orders, status: ${response.status}`);
        
        // 401 hatası durumunda kullanıcıyı logout yap
        if (response.status === 401) {
          console.log('🔴 Token geçersiz, kullanıcı logout ediliyor...');
          Alert.alert(
            '🔑 Oturum Süresi Doldu',
            'Güvenlik nedeniyle oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.',
            [
              {
                text: 'Tekrar Giriş Yap',
                onPress: async () => {
                  await AsyncStorage.multiRemove(['userData', 'userId', 'userToken']);
                  router.replace('/(auth)/sign-in');
                }
              }
            ]
          );
          return;
        }
        
        setAcceptedOrders([]);
        setCurrentActiveOrders(0);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`⏱️ KuryeHome: Accepted orders request timeout (15s aşıldı)`);
      } else {
        console.error(`❌ KuryeHome: Error fetching accepted orders:`, error);
      }
      setAcceptedOrders([]);
      setCurrentActiveOrders(0);
    }
  }, [user]);

  // Kurye bilgilerini çeken fonksiyon
  const fetchCourierInfo = useCallback(async () => {
    if (!user?.id) return;

    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_COURIER(user.id)));
      if (response.ok) {
        const data = await response.json();
        setPackageLimit(data.data?.package_limit || 5);
      }
    } catch (error) {
      // Sessizce hata yakala
    }
  }, [user]);

  // Hesaplaşma verilerini çeken fonksiyon


  const fetchOrders = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      // Tercih sistemi ile filtrelenmiş siparişleri getir
              const url = getFullUrl(API_ENDPOINTS.GET_ORDERS_WITH_PREFERENCES(user.id));
      const response = await authedFetch(url, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          setOrders([]);
          return;
        }
        
        // 401 hatası durumunda kullanıcıyı logout yap
        if (response.status === 401) {
          console.log('🔴 Token geçersiz, kullanıcı logout ediliyor...');
          Alert.alert(
            '🔑 Oturum Süresi Doldu',
            'Güvenlik nedeniyle oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.',
            [
              {
                text: 'Tekrar Giriş Yap',
                onPress: async () => {
                  await AsyncStorage.multiRemove(['userData', 'userId', 'userToken']);
                  router.replace('/(auth)/sign-in');
                }
              }
            ]
          );
          return;
        }
        
        if (response.status >= 500) {
          throw new Error("Sunucu hatası. Lütfen daha sonra tekrar deneyin.");
        } else if (response.status >= 400) {
          throw new Error("İstek hatası. Lütfen uygulamayı yeniden başlatın.");
        } else {
          throw new Error("Bilinmeyen bir hata oluştu.");
        }
      }
      const data = await response.json();
      if (!data || !data.data) {
        setOrders([]);
        return;
      }
      
      // Sadece "bekleniyor" durumundaki siparişleri filtrele (ekstra güvenlik)
      const waitingOrders = data.data.filter((order: Order) => order.status === "bekleniyor");
      const sortedOrders = waitingOrders.sort((a: Order, b: Order) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Orders fetched successfully
      setOrders(sortedOrders);
    } catch (err) {
      setError("Bilinmeyen bir hata oluştu.");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchPendingApprovalOrders = useCallback(async () => {
    if (!user) return;
    try {
      console.log("fetchPendingApprovalOrders: Fetching pending approval orders for user.id:", user.id);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_PENDING_APPROVAL_ORDERS_COURIER(user.id)));
      console.log("fetchPendingApprovalOrders: Response status:", response.status);
      
      if (response.status === 404) {
        console.log("fetchPendingApprovalOrders: No pending approval orders found (404).");
        setPendingApprovalOrders([]);
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("fetchPendingApprovalOrders: HTTP error response:", errorText);
        
        // 401 hatası durumunda kullanıcıyı logout yap
        if (response.status === 401) {
          console.log('🔴 Token geçersiz, kullanıcı logout ediliyor...');
          Alert.alert(
            '🔑 Oturum Süresi Doldu',
            'Güvenlik nedeniyle oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.',
            [
              {
                text: 'Tekrar Giriş Yap',
                onPress: async () => {
                  await AsyncStorage.multiRemove(['userData', 'userId', 'userToken']);
                  router.replace('/(auth)/sign-in');
                }
              }
            ]
          );
          return;
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("fetchPendingApprovalOrders: API'den dönen raw data:", JSON.stringify(data, null, 2));
      
      const pendingOrdersArray = data.data || data || [];
      if (Array.isArray(pendingOrdersArray)) {
        console.log("fetchPendingApprovalOrders: Setting pendingApprovalOrders with", pendingOrdersArray.length, "items.");
        const validPendingOrders = pendingOrdersArray.filter((order: any) => order && order.id).map((order: any) => ({
          ...order,
          id: order.id.toString()
        }));
        console.log("fetchPendingApprovalOrders: Filtered to", validPendingOrders.length, "valid orders.");
        setPendingApprovalOrders(validPendingOrders);
      } else {
        console.warn("fetchPendingApprovalOrders: Response data is not an array:", JSON.stringify(data, null, 2));
        setPendingApprovalOrders([]);
      }
    } catch (err) {
      console.error("fetchPendingApprovalOrders: Error fetching pending approval orders:", err);
      setPendingApprovalOrders([]);
    }
  }, [user]);

  const toggleSelectOrder = useCallback((orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  }, []);

  // Tüm verileri yenileme fonksiyonu
  const refreshAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchOrders(),
        fetchPendingApprovalOrders(),
        fetchAcceptedOrders(),
        fetchCourierInfo(), // Kurye bilgilerini de yenile (paket limiti için)
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, fetchPendingApprovalOrders, fetchAcceptedOrders, fetchCourierInfo]);

  const acceptSelectedOrders = useCallback(async () => {
    if (!user || selectedOrders.length === 0) {
      Alert.alert("Lütfen en az bir sipariş seçin.");
      return;
    }
    
    // Çevrimiçi durumu kontrolü
    if (!isOnline) {
      Alert.alert(
        "⚠️ Çevrimdışısınız",
        "Sipariş kabul etmek için çevrimiçi olmanız gerekiyor. Şimdi çevrimiçi olmak istiyor musunuz?",
        [
          {
            text: "Hayır",
            style: "cancel"
          },
          {
            text: "Evet, Çevrimiçi Ol",
            onPress: async () => {
              setIsOnline(true);
              // Direkt sipariş kabul etme işlemini yap, fonksiyonu tekrar çağırma
              try {
                const response = await authedFetch(getFullUrl(API_ENDPOINTS.ACCEPT_ORDERS), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    orderIds: selectedOrders,
                    courierId: user.id,
                    newStatus: "kuryede",
                  }),
                });
                
                if (!response.ok) {
                  const errorBody = await response.text();
                  
                  if (response.status === 423) {
                    const errorData = JSON.parse(errorBody);
                    Alert.alert(
                      "⏰ Paket Limiti Aşıldı", 
                      errorData.message || "Paket limitinizi aştınız.",
                      [{ text: "Tamam", style: "default" }]
                    );
                    return;
                  }
                  
                  if (response.status === 409) {
                    const errorData = JSON.parse(errorBody);
                    Alert.alert(
                      "📦 Sipariş Çakışması", 
                      errorData.error || "Seçili siparişler başka kuryeler tarafından alınmış.",
                      [
                        { 
                          text: "Detayları Gör", 
                          onPress: () => {
                                                         if (errorData.failedOrders && errorData.failedOrders.length > 0) {
                               const failedDetails = errorData.failedOrders
                                 .map((failed: FailedOrder) => `Sipariş #${failed.orderId}: ${failed.reason}`)
                                 .join('\n');
                               Alert.alert("Başarısız Siparişler", failedDetails);
                             }
                          }
                        },
                        { text: "Tamam", style: "default" }
                      ]
                    );
                    fetchOrders();
                    setSelectedOrders([]);
                    return;
                  }
                  
                  if (response.status === 404) {
                    Alert.alert(
                      "📦 Sipariş Bulunamadı", 
                      "Seçili siparişler artık mevcut değil.",
                      [{ text: "Tamam", style: "default" }]
                    );
                    fetchOrders();
                    setSelectedOrders([]);
                    return;
                  }
                  
                  if (response.status === 403) {
                    Alert.alert(
                      "🚫 Erişim Engellendi", 
                      "Hesabınız engellenmiş olabilir. Lütfen yönetici ile iletişime geçin.",
                      [{ text: "Tamam", style: "default" }]
                    );
                    return;
                  }
                  
                  throw new Error("Sipariş kabul edilirken hata oluştu.");
                }

                const result = await response.json();
                
                // Başarılı ve başarısız sipariş bilgilerini kullanıcıya göster
                if (result.failedOrders && result.failedOrders.length > 0) {
                  Alert.alert(
                    "⚠️ Kısmi Başarı", 
                    `${result.successfullyAccepted} sipariş kabul edildi.\n${result.failedOrders.length} sipariş başka kuryeler tarafından alınmıştı.`,
                    [
                      { 
                        text: "Detayları Gör", 
                        onPress: () => {
                                                   const failedDetails = result.failedOrders
                           .map((failed: FailedOrder) => `Sipariş #${failed.orderId}: ${failed.reason}`)
                           .join('\n');
                          Alert.alert("Başarısız Siparişler", failedDetails);
                        }
                      },
                      { text: "Tamam", style: "default" }
                    ]
                  );
                }

                const acceptedOrdersWithCreditCard = orders.filter(order => 
                  selectedOrders.includes(order.id.toString()) && 
                  (order.odeme_yontemi.toLowerCase().includes("kredi_karti") || 
                   order.odeme_yontemi.toLowerCase().includes("kredi kartı"))
                );

                const acceptedOrdersWithCash = orders.filter(order => 
                  selectedOrders.includes(order.id.toString()) && 
                  order.odeme_yontemi.toLowerCase().includes("nakit")
                );

                if (socketRef.current) {
                  selectedOrders.forEach(orderId => {
                    console.log(`📤 Emitting order status update for order ${orderId}`);
                    socketRef.current.emit("orderStatusUpdate", {
                      orderId,
                      status: "kuryede",
                      courierId: user.id,
                      message: `Sipariş #${orderId} kurye ${user.id} tarafından kabul edildi`
                    });
                  });
                }

                if (acceptedOrdersWithCreditCard.length > 0) {
                  Alert.alert(
                    "💳 POS Cihazını Unutma!", 
                    `${acceptedOrdersWithCreditCard.length} adet kredi kartı ödemeli sipariş kabul ettiniz.\n\nPOS cihazınızı yanınıza almayı unutmayın!`,
                    [{ text: "Tamam", style: "default" }]
                  );
                } else if (acceptedOrdersWithCash.length > 0) {
                  Alert.alert(
                    "💰 Para Üstünü Almayı Unutma!", 
                    `${acceptedOrdersWithCash.length} adet nakit ödemeli sipariş kabul ettiniz.\n\nPara üstü vermeniz gerekebilir, yeterli bozuk para bulundurmayı unutmayın!`,
                    [{ text: "Tamam", style: "default" }]
                  );
                }

                fetchOrders();
                fetchAcceptedOrders();
                setSelectedOrders([]);
              } catch (error) {
                Alert.alert("Sipariş kabul edilirken hata oluştu.");
              }
            }
          }
        ]
      );
      return;
    }

    // Paket limit kontrolü
    if (currentActiveOrders + selectedOrders.length > packageLimit) {
      Alert.alert(
        "📦 Paket Limiti Aşıldı",
        `Maksimum ${packageLimit} paket alabilirsiniz.\nŞu anda ${currentActiveOrders} aktif paketiniz var.\n${selectedOrders.length} yeni paket eklenemez.`,
        [{ text: "Tamam", style: "default" }]
      );
      return;
    }
    
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.ACCEPT_ORDERS), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedOrders,
          courierId: user.id,
          newStatus: "kuryede",
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        
        if (response.status === 423) {
          const errorData = JSON.parse(errorBody);
          Alert.alert(
            "⏰ Paket Limiti Aşıldı", 
            errorData.message || "Paket limitinizi aştınız.",
            [{ text: "Tamam", style: "default" }]
          );
          return;
        }
        
        if (response.status === 409) {
          const errorData = JSON.parse(errorBody);
          Alert.alert(
            "📦 Sipariş Çakışması", 
            errorData.error || "Bu sipariş başka bir kurye tarafından alınmış.",
            [{ text: "Tamam", style: "default" }]
          );
          fetchOrders();
          setSelectedOrders([]);
          return;
        }
        
        if (response.status === 404) {
          Alert.alert(
            "📦 Sipariş Bulunamadı", 
            "Bu sipariş artık mevcut değil.",
            [{ text: "Tamam", style: "default" }]
          );
          fetchOrders();
          setSelectedOrders([]);
          return;
        }
        
        if (response.status === 403) {
          Alert.alert(
            "🚫 Erişim Engellendi", 
            "Hesabınız engellenmiş olabilir. Lütfen yönetici ile iletişime geçin.",
            [{ text: "Tamam", style: "default" }]
          );
          return;
        }
        
        throw new Error("Sipariş kabul edilirken hata oluştu.");
      }

      // Check if any accepted order has credit card payment method
      const acceptedOrdersWithCreditCard = orders.filter(order => 
        selectedOrders.includes(order.id.toString()) && 
        (order.odeme_yontemi.toLowerCase().includes("kredi_karti") || 
         order.odeme_yontemi.toLowerCase().includes("kredi kartı"))
      );

      // Check if any accepted order has cash payment method
      const acceptedOrdersWithCash = orders.filter(order => 
        selectedOrders.includes(order.id.toString()) && 
        order.odeme_yontemi.toLowerCase().includes("nakit")
      );

                      // Emit order status update via socket
                if (socketRef.current) {
                  selectedOrders.forEach(orderId => {
                    console.log(`📤 Emitting order status update for order ${orderId}`);
                    socketRef.current.emit("orderStatusUpdate", {
                      orderId,
                      status: "kuryede",
                      courierId: user.id,
                      message: `Sipariş #${orderId} kurye ${user.id} tarafından kabul edildi`
                    });
                  });
                }

      // Show POS device notification if credit card payment detected
      if (acceptedOrdersWithCreditCard.length > 0) {
        Alert.alert(
          "💳 POS Cihazını Unutma!", 
          `${acceptedOrdersWithCreditCard.length} adet kredi kartı ödemeli sipariş kabul ettiniz.\n\nPOS cihazınızı yanınıza almayı unutmayın!`,
          [{ text: "Tamam", style: "default" }]
        );
      } else if (acceptedOrdersWithCash.length > 0) {
        Alert.alert(
          "💰 Para Üstünü Almayı Unutma!", 
          `${acceptedOrdersWithCash.length} adet nakit ödemeli sipariş kabul ettiniz.\n\nPara üstü vermeniz gerekebilir, yeterli bozuk para bulundurmayı unutmayın!`,
          [{ text: "Tamam", style: "default" }]
        );
      }

      fetchOrders();
      fetchAcceptedOrders();
      setSelectedOrders([]);
    } catch (error) {
      Alert.alert("Sipariş kabul edilirken hata oluştu.");
    }
  }, [user, selectedOrders, fetchOrders, fetchAcceptedOrders, orders, isOnline, currentActiveOrders, packageLimit]);



  // Ref'e atama
  useEffect(() => {
    acceptSelectedOrdersRef.current = acceptSelectedOrders;
  }, [acceptSelectedOrders]);

  const openOrderDetail = useCallback((order: Order) => {
    setSelectedOrder(order);
    setOrderDetailModalVisible(true);
  }, []);

  const handleNavigateToRestaurant = useCallback(async (order: Order) => {
    try {
      // Restoran koordinatlarını restaurants endpoint'inden çek
      const response = await fetch(getFullUrl(API_ENDPOINTS.GET_RESTAURANT(order.firmaid)));
      
      if (!response.ok) {
        throw new Error('Restoran bilgileri alınamadı');
      }
      
      const data = await response.json();
      const restaurant = data.data;
      
      // Koordinatlar mevcut mu kontrol et
      if (!restaurant.latitude || !restaurant.longitude) {
        Alert.alert(
          "📍 Konum Bilgisi Yok",
          "Bu restoran için GPS koordinatları kayıtlı değil. Lütfen manuel olarak restoranı arayın.",
          [{ text: "Tamam", style: "default" }]
        );
        return;
      }
      
      // Koordinatlar ile hassas navigasyon
      const lat = parseFloat(restaurant.latitude);
      const lng = parseFloat(restaurant.longitude);
      
      Alert.alert(
        "🗺️ Navigasyon",
        `${order.firma_adi}'a yol tarifi almak istersiniz?`,
        [
          {
            text: "İptal",
            style: "cancel"
          },
          {
            text: "Google Maps",
            onPress: () => {
              const googleMapsUrl = Platform.OS === 'ios' 
                ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`
                : `google.navigation:q=${lat},${lng}&mode=d`;
              
              Linking.canOpenURL(googleMapsUrl).then(supported => {
                if (supported) {
                  Linking.openURL(googleMapsUrl);
                } else {
                  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
                  Linking.openURL(webUrl);
                }
              });
            }
          },
          {
            text: Platform.OS === 'ios' ? "Apple Maps" : "Haritalar",
            onPress: () => {
              const appleMapUrl = `maps://?daddr=${lat},${lng}&dirflg=d`;
              
              Linking.canOpenURL(appleMapUrl).then(supported => {
                if (supported) {
                  Linking.openURL(appleMapUrl);
                } else {
                  Alert.alert("Hata", "Harita uygulaması açılamadı");
                }
              });
            }
          }
        ]
      );
      
    } catch (error) {
      console.error('Navigasyon hatası:', error);
      Alert.alert(
        "🚫 Navigasyon Hatası",
        "Restoran konum bilgileri alınamadı. Lütfen daha sonra tekrar deneyin.",
        [{ text: "Tamam", style: "default" }]
      );
    }
  }, []);

  // Modal'dan tek sipariş kabul etme fonksiyonu
  const handleAcceptOrderFromModal = useCallback(async (order: Order) => {
    if (!user) {
      Alert.alert("Kullanıcı bilgisi bulunamadı.");
      return;
    }

    // Çevrimiçi durumu kontrolü
    if (!isOnline) {
      Alert.alert(
        "⚠️ Çevrimdışısınız",
        "Sipariş kabul etmek için çevrimiçi olmanız gerekiyor.",
        [{ text: "Tamam", style: "default" }]
      );
      return;
    }

    // Paket limit kontrolü
    if (currentActiveOrders >= packageLimit) {
      Alert.alert(
        "📦 Paket Limiti Aşıldı",
        `Maksimum ${packageLimit} paket alabilirsiniz.\nŞu anda ${currentActiveOrders} aktif paketiniz var.`,
        [{ text: "Tamam", style: "default" }]
      );
      return;
    }

    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.ACCEPT_ORDERS), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [order.id.toString()],
          courierId: user.id,
          newStatus: "kuryede",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        
        if (response.status === 423) {
          const errorData = JSON.parse(errorBody);
          Alert.alert(
            "⏰ Paket Limiti Aşıldı", 
            errorData.message || "Paket limitinizi aştınız.",
            [{ text: "Tamam", style: "default" }]
          );
          return;
        }
        
        if (response.status === 409) {
          const errorData = JSON.parse(errorBody);
          Alert.alert(
            "📦 Sipariş Çakışması", 
            errorData.error || "Bu sipariş başka bir kurye tarafından alınmış.",
            [{ text: "Tamam", style: "default" }]
          );
          fetchOrders();
          setOrderDetailModalVisible(false);
          return;
        }
        
        if (response.status === 404) {
          Alert.alert(
            "📦 Sipariş Bulunamadı", 
            "Bu sipariş artık mevcut değil.",
            [{ text: "Tamam", style: "default" }]
          );
          fetchOrders();
          setOrderDetailModalVisible(false);
          return;
        }
        
        if (response.status === 403) {
          Alert.alert(
            "🚫 Erişim Engellendi", 
            "Hesabınız engellenmiş olabilir. Lütfen yönetici ile iletişime geçin.",
            [{ text: "Tamam", style: "default" }]
          );
          return;
        }
        
        throw new Error("Sipariş kabul edilirken hata oluştu.");
      }

      // Socket ile durum güncellemesi gönder
      if (socketRef.current) {
        console.log(`📤 Emitting order status update for order ${order.id}`);
        socketRef.current.emit("orderStatusUpdate", {
          orderId: order.id.toString(),
          status: "kuryede",
          courierId: user.id,
          message: `Sipariş #${order.id} kurye ${user.id} tarafından kabul edildi`
        });
      }

      // Ödeme türüne göre uyarı
      if (order.odeme_yontemi.toLowerCase().includes("kredi_karti") || 
          order.odeme_yontemi.toLowerCase().includes("kredi kartı")) {
        Alert.alert(
          "💳 POS Cihazını Unutma!", 
          `Kredi kartı ödemeli sipariş kabul ettiniz.\n\nPOS cihazınızı yanınıza almayı unutmayın!`,
          [{ text: "Tamam", style: "default" }]
        );
      } else if (order.odeme_yontemi.toLowerCase().includes("nakit")) {
        Alert.alert(
          "💰 Para Üstünü Almayı Unutma!", 
          "Bu sipariş nakit ödemeli.\n\nPara üstü vermeniz gerekebilir, yeterli bozuk para bulundurmayı unutmayın!",
          [{ text: "Tamam", style: "default" }]
        );
      }

      // Başarılı kabul mesajı
      Alert.alert(
        "✅ Sipariş Kabul Edildi!",
        `Sipariş #${order.id} başarıyla kabul edildi.`,
        [{ text: "Tamam", style: "default" }]
      );

      fetchOrders();
      fetchAcceptedOrders();
      setOrderDetailModalVisible(false);
    } catch (error) {
      console.error("Sipariş kabul hatası:", error);
      Alert.alert("Hata", "Sipariş kabul edilirken bir hata oluştu.");
    }
  }, [user, isOnline, currentActiveOrders, packageLimit, fetchOrders, fetchAcceptedOrders]);

  const handleLongPress = useCallback((order: Order) => {
    Alert.alert(
      "Sipariş İşlemleri",
      "Ne yapmak istersiniz?",
      [
        {
          text: "Kabul Et",
          onPress: async () => {
            // Çevrimiçi durumu kontrolü
            if (!isOnline) {
              Alert.alert(
                "⚠️ Çevrimdışısınız",
                "Sipariş kabul etmek için çevrimiçi olmanız gerekiyor. Şimdi çevrimiçi olmak istiyor musunuz?",
                [
                  {
                    text: "Hayır",
                    style: "cancel"
                  },
                  {
                    text: "Evet, Çevrimiçi Ol",
                    onPress: async () => {
                      setIsOnline(true);
                      // Tek sipariş kabul et
                      try {
                        const response = await authedFetch(getFullUrl(API_ENDPOINTS.ACCEPT_ORDERS), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            orderIds: [order.id.toString()],
                            courierId: user.id,
                            newStatus: "kuryede",
                          }),
                        });
                        
                        if (!response.ok) {
                          const errorBody = await response.text();
                          
                          if (response.status === 423) {
                            const errorData = JSON.parse(errorBody);
                            Alert.alert(
                              "⏰ Paket Limiti Aşıldı", 
                              errorData.message || "Paket limitinizi aştınız.",
                              [{ text: "Tamam", style: "default" }]
                            );
                            return;
                          }
                          
                          if (response.status === 409) {
                            const errorData = JSON.parse(errorBody);
                            Alert.alert(
                              "📦 Sipariş Çakışması", 
                              errorData.error || "Bu sipariş başka bir kurye tarafından alınmış.",
                              [{ text: "Tamam", style: "default" }]
                            );
                            fetchOrders();
                            return;
                          }
                          
                          if (response.status === 404) {
                            Alert.alert(
                              "📦 Sipariş Bulunamadı", 
                              "Bu sipariş artık mevcut değil.",
                              [{ text: "Tamam", style: "default" }]
                            );
                            fetchOrders();
                            return;
                          }
                          
                          if (response.status === 403) {
                            Alert.alert(
                              "🚫 Erişim Engellendi", 
                              "Hesabınız engellenmiş olabilir. Lütfen yönetici ile iletişime geçin.",
                              [{ text: "Tamam", style: "default" }]
                            );
                            return;
                          }
                          
                          throw new Error("Sipariş kabul edilirken hata oluştu.");
                        }
                        
                        if (socketRef.current) {
                          console.log(`📤 Emitting order status update for order ${order.id}`);
                          socketRef.current.emit("orderStatusUpdate", {
                            orderId: order.id.toString(),
                            status: "kuryede",
                            courierId: user.id,
                            message: `Sipariş #${order.id} kurye ${user.id} tarafından kabul edildi`
                          });
                        }
                        
                        if (order.odeme_yontemi.toLowerCase().includes("kredi_karti") || 
                            order.odeme_yontemi.toLowerCase().includes("kredi kartı")) {
                          Alert.alert(
                            "💳 POS Cihazını Unutma!", 
                            "Bu sipariş kredi kartı ödemeli.\n\nPOS cihazınızı yanınıza almayı unutmayın!",
                            [{ text: "Tamam", style: "default" }]
                          );
                        } else if (order.odeme_yontemi.toLowerCase().includes("nakit")) {
                          Alert.alert(
                            "💰 Para Üstünü Almayı Unutma!", 
                            "Bu sipariş nakit ödemeli.\n\nPara üstü vermeniz gerekebilir, yeterli bozuk para bulundurmayı unutmayın!",
                            [{ text: "Tamam", style: "default" }]
                          );
                        }
                        
                        fetchOrders();
                      } catch (error) {
                        Alert.alert("Sipariş kabul edilirken hata oluştu.");
                      }
                    }
                  }
                ]
              );
              return;
            }

            // Paket limit kontrolü
            if (currentActiveOrders >= packageLimit) {
              Alert.alert(
                "📦 Paket Limiti Doldu",
                `Maksimum ${packageLimit} paket alabilirsiniz.\nŞu anda ${currentActiveOrders} aktif paketiniz var.\nYeni paket alamazsınız.`,
                [{ text: "Tamam", style: "default" }]
              );
              return;
            }
            
            try {
              const response = await authedFetch(getFullUrl(API_ENDPOINTS.ACCEPT_ORDERS), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderIds: [order.id.toString()],
                  courierId: user.id,
                  newStatus: "kuryede",
                }),
              });
              
              if (!response.ok) {
                const errorBody = await response.text();
                
                if (response.status === 423) {
                  const errorData = JSON.parse(errorBody);
                  Alert.alert(
                    "⏰ Paket Limiti Aşıldı", 
                    errorData.message || "Paket limitinizi aştınız.",
                    [{ text: "Tamam", style: "default" }]
                  );
                  return;
                }
                
                if (response.status === 409) {
                  const errorData = JSON.parse(errorBody);
                  Alert.alert(
                    "📦 Sipariş Çakışması", 
                    errorData.error || "Bu sipariş başka bir kurye tarafından alınmış.",
                    [{ text: "Tamam", style: "default" }]
                  );
                  fetchOrders();
                  return;
                }
                
                if (response.status === 404) {
                  Alert.alert(
                    "📦 Sipariş Bulunamadı", 
                    "Bu sipariş artık mevcut değil.",
                    [{ text: "Tamam", style: "default" }]
                  );
                  fetchOrders();
                  return;
                }
                
                if (response.status === 403) {
                  Alert.alert(
                    "🚫 Erişim Engellendi", 
                    "Hesabınız engellenmiş olabilir. Lütfen yönetici ile iletişime geçin.",
                    [{ text: "Tamam", style: "default" }]
                  );
                  return;
                }
                
                throw new Error("Sipariş kabul edilirken hata oluştu.");
              }

              // Emit order status update via socket
              if (socketRef.current) {
                console.log(`📤 Emitting order status update for order ${order.id}`);
                socketRef.current.emit("orderStatusUpdate", {
                  orderId: order.id.toString(),
                  status: "kuryede",
                  courierId: user.id,
                  message: `Sipariş #${order.id} kurye ${user.id} tarafından kabul edildi`
                });
              }

              // Check if this order has credit card payment method
              if (order.odeme_yontemi.toLowerCase().includes("kredi_karti") || 
                  order.odeme_yontemi.toLowerCase().includes("kredi kartı")) {
                Alert.alert(
                  "💳 POS Cihazını Unutma!", 
                  `Kredi kartı ödemeli sipariş kabul ettiniz.\n\nPOS cihazınızı yanınıza almayı unutmayın!`,
                  [{ text: "Tamam", style: "default" }]
                );
              } else if (order.odeme_yontemi.toLowerCase().includes("nakit")) {
                Alert.alert(
                  "💰 Para Üstünü Almayı Unutma!", 
                  "Bu sipariş nakit ödemeli.\n\nPara üstü vermeniz gerekebilir, yeterli bozuk para bulundurmayı unutmayın!",
                  [{ text: "Tamam", style: "default" }]
                );
              }

              fetchOrders();
              fetchAcceptedOrders();
            } catch (error) {
              Alert.alert("Hata", "Sipariş kabul edilirken hata oluştu.");
            }
          },
        },
        {
          text: "Detayları Gör",
          onPress: () => openOrderDetail(order),
        },
        {
          text: "İptal",
          style: "cancel",
        },
      ]
    );
  }, [openOrderDetail, user, fetchOrders]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          
          // Kurye ise engellenmiş durumunu kontrol et
          if (parsedUser.role === 'courier') {
            try {
              const response = await fetch(`${API_CONFIG.BASE_URL}/api/couriers/${parsedUser.id}`);
              const result = await response.json();
              
              if (result.success && result.courier) {
                // Eğer kurye engellenmiş ise oturumu sonlandır
                if (result.courier.is_blocked) {
                  await AsyncStorage.multiRemove(['userData', 'userId', 'userToken']);
                  Alert.alert(
                    "Hesap Engellendi", 
                    "Hesabınız engellenmiştir. Lütfen yöneticiyle iletişime geçin.",
                    [{ text: "Tamam", onPress: () => router.replace("/(auth)/sign-in") }]
                  );
                  return;
                }
              }
            } catch (error) {
              console.log("Kurye durumu kontrol edilemedi:", error);
            }
          }
          
          setUser(parsedUser);
          // Toplam çevrimiçi süresini yükle
          await loadTotalOnlineTime(parsedUser.id);
          
          // Otomatik çevrimiçi olma özelliği - Geliştirilmiş
          try {
            const savedOnlineStatus = await AsyncStorage.getItem('courierOnlineStatus');
            console.log("💾 Kaydedilmiş çevrimiçi durum:", savedOnlineStatus);
            
            // Kısa bir gecikme sonrasında çevrimiçi durumu kontrol et
            setTimeout(async () => {
              // Aktif siparişleri kontrol et
              try {
                const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_ACTIVE_ORDERS(parsedUser.id)));
                let hasActiveOrders = false;
                
                if (response.ok) {
                  const data = await response.json();
                  hasActiveOrders = (data.data || []).length > 0;
                  console.log("📦 Aktif sipariş sayısı:", (data.data || []).length);
                }
                
                // Otomatik çevrimiçi olma mantığı
                let shouldBeOnline = false;
                let reason = "";
                
                if (hasActiveOrders) {
                  // Aktif sipariş varsa MUTLAKA çevrimiçi ol
                  shouldBeOnline = true;
                  reason = "Aktif siparişler mevcut";
                } else if (savedOnlineStatus === 'true') {
                  // Daha önce çevrimiçiydi, devam et
                  shouldBeOnline = true;
                  reason = "Önceki oturumda çevrimiçiydi";
                } else if (savedOnlineStatus === null || savedOnlineStatus === undefined) {
                  // İlk kez kullanım, varsayılan olarak çevrimiçi ol
                  shouldBeOnline = true;
                  reason = "İlk kullanım - varsayılan çevrimiçi";
                } else {
                  // Açıkça çevrimdışı yapılmış, çevrimdışı kal
                  shouldBeOnline = false;
                  reason = "Kullanıcı tarafından çevrimdışı yapılmış";
                }
                
                if (shouldBeOnline) {
                  const now = new Date();
                  setIsOnline(true);
                  setOnlineStartTime(now);
                  
                  // AsyncStorage'ı güncelle
                  await AsyncStorage.setItem('courierOnlineStatus', 'true');
                  
                  // Aktivite oturumu başlat
                  setTimeout(async () => {
                    await startActivitySession();
                    await fetchDailyActivityStats();
                  }, 2000); // Socket bağlantısı için 2 saniye bekle
                } else {
                  setIsOnline(false);
                }
                
              } catch (error) {
                // Hata durumunda varsayılan olarak çevrimiçi ol
                setIsOnline(true);
                setOnlineStartTime(new Date());
                await AsyncStorage.setItem('courierOnlineStatus', 'true');
              }
            }, 1500); // 1.5 saniye gecikme ile socket bağlantısının kurulması için
            
          } catch (error) {
            console.log("❌ Çevrimiçi durum kontrolü hatası:", error);
            // Ana hata durumunda da varsayılan çevrimiçi
            setTimeout(() => {
              setIsOnline(true);
              setOnlineStartTime(new Date());
              console.log("🟡 Ana hata nedeniyle varsayılan çevrimiçi yapıldı");
            }, 1500);
          }
        }
        setIsLoaded(true);
      } catch (error) {
        setIsLoaded(true);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchPendingApprovalOrders();
      fetchCourierInfo();
      
      // Hemen çevrimiçi durumu kontrol et
      checkAndSetOnlineStatus(user.id);
    }
  }, [user, fetchOrders, fetchPendingApprovalOrders, fetchCourierInfo]);
  
  // Çevrimiçi durumu kontrol eden yardımcı fonksiyon
  const checkAndSetOnlineStatus = useCallback(async (userId: string) => {
    try {
      const savedOnlineStatus = await AsyncStorage.getItem('courierOnlineStatus');
      
      // Aktif siparişleri kontrol et
      try {
        const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_ACTIVE_ORDERS(userId)));
        let hasActiveOrders = false;
        
        if (response.ok) {
          const data = await response.json();
          hasActiveOrders = (data.data || []).length > 0;
        }
        
        // Çevrimiçi olma mantığı
        let shouldBeOnline = true; // Varsayılan çevrimiçi
        
        if (hasActiveOrders) {
          shouldBeOnline = true;
        } else if (savedOnlineStatus === 'false') {
          // Sadece açıkça false ise çevrimdışı yap
          shouldBeOnline = false;
        } else {
          shouldBeOnline = true;
        }
        
        setIsOnline(shouldBeOnline);
        if (shouldBeOnline) {
          const now = new Date();
          setOnlineStartTime(now);
          await AsyncStorage.setItem('courierOnlineStatus', 'true');
        }
        
      } catch (error) {
        // Hata durumunda çevrimiçi kal
        setIsOnline(true);
        setOnlineStartTime(new Date());
        await AsyncStorage.setItem('courierOnlineStatus', 'true');
      }
      
    } catch (error) {
      // Ana hata durumunda da çevrimiçi kal
      setIsOnline(true);
      setOnlineStartTime(new Date());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchOrders();
        fetchPendingApprovalOrders();
        fetchAcceptedOrders();
        fetchCourierInfo();
      }
    }, [user, fetchOrders, fetchPendingApprovalOrders, fetchAcceptedOrders, fetchCourierInfo])
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchAcceptedOrders();
    }, 5000);
    return () => clearInterval(intervalId);
  }, [fetchAcceptedOrders]);

  // Yeni konum güncelleme useEffect'i: acceptedOrders varsa her 15 saniyede bir güncelleme yapar.
  useEffect(() => {
    if (!user) return;
    
    let intervalId: ReturnType<typeof setInterval>;
    const updateLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Konum izni reddedildi");
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        acceptedOrders.forEach((order) => {
          if (socketRef.current) {
            socketRef.current.emit("locationUpdate", {
              courierId: user.id,
              orderId: order.id,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              firmaid: order.firmaid || user.id,
            });
          }
        });
      } catch (error) {
        // Konum güncelleme hatası
      }
    };

    if (acceptedOrders.length > 0) {
      // İlk güncelleme hemen yapılıyor
      updateLocation();
      intervalId = setInterval(updateLocation, 15000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [acceptedOrders, user]);

  // Koşullu return, tüm hook'lardan sonra
  if (!isLoaded || !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const courierId = user.id;
  const firmId = user.id;

  const renderOrderItem = ({ item }: { item: Order }) => {
    // Kuryede olan siparişleri anasayfada gösterme
    if (item.status.toLowerCase() === "kuryede") {
      return null;
    }
    
    const isSelected = selectedOrders.includes(item.id.toString());
    const isBlocked = blockedOrders.has(item.id.toString());
    
    return (
      <View style={[styles.orderItemWrapper, isBlocked && styles.blockedOrderWrapper]}>
        <TouchableOpacity
          onPress={() => {
            if (isBlocked) {
              Alert.alert(
                "⏰ Henüz Kabul Edilemez",
                "Yeni eklenen siparişler 10 saniye sonra kabul edilebilir. Lütfen bekleyin.",
                [{ text: "Tamam", style: "default" }]
              );
              return;
            }
            toggleSelectOrder(item.id.toString());
          }}
          onLongPress={() => {
            if (isBlocked) {
              Alert.alert(
                "⏰ Henüz Kabul Edilemez",
                "Yeni eklenen siparişler 10 saniye sonra kabul edilebilir. Lütfen bekleyin.",
                [{ text: "Tamam", style: "default" }]
              );
              return;
            }
            handleLongPress(item);
          }}
          activeOpacity={0.9}
          disabled={isBlocked}
        >
          <LinearGradient
            colors={
              isBlocked
                ? ["#9CA3AF", "#D1D5DB"] // Gri tonları bloklu siparişler için
                : isSelected 
                  ? ["#059669", "#10B981"]
                  : item.status.toLowerCase() === "kuryede" 
                    ? ["#059669", "#10B981"] 
                    : ["#4F46E5", "#6366F1"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.orderItem, isBlocked && styles.blockedOrderItem]}
          >
            {isBlocked && (
              <View style={styles.blockedOverlay}>
                <Ionicons name="lock-closed" size={20} color="#6B7280" />
                <Text style={styles.blockedText}>10 saniye bekleyin...</Text>
              </View>
            )}
            <View style={[styles.orderContent, isBlocked && styles.blockedOrderContent]}>
              {/* Üst Başlık - Restoran ve Durumlar */}
              <View style={styles.cardTopSection}>
                <View style={styles.restaurantSection}>
                  <View style={styles.restaurantLogoContainer}>
                    {item.logo_url ? (
                      <Image
                        source={{ uri: item.logo_url }}
                        style={styles.restaurantLogo}
                      />
                    ) : (
                      <View style={styles.defaultLogoContainer}>
                        <Ionicons name="restaurant" size={16} color="#6366F1" />
                      </View>
                    )}
                  </View>
                  <View style={styles.restaurantDetails}>
                    <Text style={[styles.restaurantNameMain, isBlocked && styles.blockedText]} numberOfLines={1}>
                      {item.firma_adi}
                    </Text>
                    <Text style={[styles.orderIdDisplay, isBlocked && styles.blockedText]}>
                      Sipariş #{item.id}
                    </Text>
                  </View>
                </View>

                {/* Sağ Üst - Durum ve Hazırlık Süresi */}
                <View style={styles.topRightBadges}>
                  <View style={styles.statusBadge}>
                    <Text style={[styles.statusText, isBlocked && styles.blockedText]}>
                      {isBlocked ? "🔒 Beklemede" : item.status.toLowerCase() === "kuryede" ? "🛵 Kuryede" : "⌛ Bekleniyor"}
                    </Text>
                  </View>
                  
                  <View style={[
                    styles.preparationTimeInlineBadge,
                    item.preparation_time === 0 && styles.preparationTimeInlineBadgeReady,
                    isBlocked && styles.preparationTimeInlineBadgeBlocked
                  ]}>
                    <Ionicons 
                      name={item.preparation_time === 0 ? "checkmark-circle" : "timer"}
                      size={12} 
                      color={isBlocked ? "#9CA3AF" : (item.preparation_time === 0 ? "#10B981" : "#F59E0B")}
                    />
                    <Text style={[
                      styles.preparationTimeInlineText, 
                      isBlocked && styles.blockedText,
                      item.preparation_time === 0 && styles.preparationTimeInlineTextReady
                    ]}>
                      {(item.preparation_time === 0 || item.preparation_time) ? 
                        (item.preparation_time === 0 ? 'Hazır' : `${item.preparation_time}dk`) : 
                        'Bilinmiyor'
                      }
                    </Text>
                  </View>
                </View>
              </View>

              {/* Alt Bilgiler Grid */}
              <View style={styles.gridContainer}>
                {/* Mahalle - Sol (Küçültüldü) */}
                <View style={styles.gridItemSmall}>
                  <View style={styles.gridIconBox}>
                    <Ionicons name="location" size={12} color={isBlocked ? "#9CA3AF" : "#FFFFFF"} />
                  </View>
                  <Text style={[styles.gridValueSmall, isBlocked && styles.blockedText]} numberOfLines={1}>
                    {item.mahalle}
                  </Text>
                </View>

                {/* Ödeme Bilgileri - Orta (Büyütüldü) */}
                <View style={styles.paymentCenterItemLarge}>
                  <View style={styles.paymentInfoBox}>
                    <View style={styles.gridIconBox}>
                      <Ionicons name="card" size={14} color={isBlocked ? "#9CA3AF" : "#FFFFFF"} />
                    </View>
                    <View style={styles.paymentContentBox}>
                      <Text style={[styles.paymentMethodTextLarge, isBlocked && styles.blockedText]} numberOfLines={2}>
                        {item.odeme_yontemi}
                      </Text>
                      <Text style={[styles.paymentAmountLabelLarge, isBlocked && styles.blockedText]}>
                        Tahsil Edilecek Net Tutar
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Kurye Ücreti - Sağ */}
                <View style={styles.courierFeeItem}>
                  <View style={styles.courierFeeBox}>
                    <Ionicons name="bicycle" size={14} color={isBlocked ? "#9CA3AF" : "#FFFFFF"} />
                    <Text style={[styles.courierFeeAmount, isBlocked && styles.blockedText]}>
                      {Math.floor(item.courier_price || item.kurye_tutari)} ₺
                    </Text>
                  </View>
                </View>
              </View>

              {/* Detay */}
              <View style={styles.bottomRow}>
                
                {/* Countdown Timer */}
                {item.status.toLowerCase() === "kuryede" ? (
                  <DeliveryCountdown order={item} />
                ) : (
                  <OrderCountdown order={item} />
                )}
                
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.miniActionButton, styles.navigationButton, isBlocked && styles.blockedDetailButton]}
                    onPress={() => handleNavigateToRestaurant(item)}
                    activeOpacity={0.8}
                    disabled={isBlocked}
                  >
                    <Ionicons name="navigate" size={12} color={isBlocked ? "#9CA3AF" : "#FFFFFF"} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.detailButton, isBlocked && styles.blockedDetailButton]}
                    onPress={() => openOrderDetail(item)}
                    activeOpacity={0.8}
                    disabled={isBlocked}
                  >
                    <Text style={[styles.detailButtonText, isBlocked && styles.blockedText]}>Detay</Text>
                    <Ionicons name="arrow-forward" size={12} color={isBlocked ? "#9CA3AF" : "#FFFFFF"} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.loaderContainer}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => {
              setError(null);
              fetchOrders();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Yeniden Dene</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.container}>
            <LinearGradient
        colors={['#8B5CF6', '#7C3AED', '#6D28D9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.modernHeaderContent}>
          {/* Sol Taraf - Marka ve Bilgiler */}
          <View style={styles.headerLeftModern}>
            <View style={styles.brandContainer}>
              <View style={styles.professionalIconBox}>
                <Ionicons name="bicycle" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.brandTextContainer}>
                <Text style={styles.modernSubtitle}>Sipariş Yönetimi</Text>
              </View>
            </View>
            
            {/* Alt Metrik Bilgileri */}
            <View style={styles.modernMetricsRow}>
              <View style={styles.modernMetricItem}>
                <Ionicons name="cube-outline" size={14} color="rgba(255, 255, 255, 0.9)" />
                <Text style={styles.modernMetricText}>
                  {currentActiveOrders}/{packageLimit} Paket
                </Text>
              </View>
            </View>
          </View>

          {/* Sağ Taraf - Durum ve Kontroller */}
          <View style={styles.headerRightModern}>
            {/* Üst Satır - Bildirim ve Durum */}
            <View style={styles.topActionRow}>
              <NotificationButton 
                userType="courier" 
                userId={user?.id?.toString() || ''} 
              />
              
              {/* Seçili Sipariş Göstergesi */}
              {selectedOrders.length > 0 && (
                <View style={styles.modernSelectedBadge}>
                  <Text style={styles.modernSelectedText}>{selectedOrders.length}</Text>
                </View>
              )}
            </View>

            {/* Alt Satır - Online/Offline Toggle */}
            <View style={styles.statusToggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleSwitch,
                  { backgroundColor: isOnline ? "#10B981" : "#EF4444" }
                ]}
                onPress={toggleOnlineStatus}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.toggleThumb,
                  { transform: [{ translateX: isOnline ? 20 : 2 }] }
                ]}>
                  <Ionicons 
                    name={isOnline ? "checkmark" : "close"} 
                    size={12} 
                    color={isOnline ? "#10B981" : "#EF4444"} 
                  />
                </View>
              </TouchableOpacity>
              <Text style={styles.modernStatusText}>
                {isOnline ? "Çevrimiçi" : "Çevrimdışı"}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>



      {/* Statistics Cards */}
      <View style={styles.statsContainer}>
        {/* Aktif Siparişler Bildirimi */}
        {currentActiveOrders > 0 && (
          <TouchableOpacity 
            style={styles.activeOrdersAlert} 
            onPress={() => router.push('/kurye/kuryeorders')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={["#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeOrdersGradient}
            >
              <View style={styles.activeOrdersContent}>
                <View style={styles.activeOrdersLeft}>
                  <View style={styles.activeOrdersIcon}>
                    <Ionicons name="bicycle" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.activeOrdersInfo}>
                    <Text style={styles.activeOrdersTitle}>
                      🚴 Aktif Siparişleriniz Var!
                    </Text>
                    <Text style={styles.activeOrdersSubtitle}>
                      {currentActiveOrders} sipariş teslim bekliyor
                    </Text>
                  </View>
                </View>
                <View style={styles.activeOrdersArrow}>
                  <Ionicons name="arrow-forward-circle" size={28} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Onay Bekleyen Siparişler Bildirimi */}
        {pendingApprovalOrders.length > 0 && (
          <TouchableOpacity 
            style={styles.pendingApprovalAlert} 
            onPress={() => router.push('/kurye/kuryeorders')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={["#F59E0B", "#D97706"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pendingApprovalGradient}
            >
              <View style={styles.pendingApprovalContent}>
                <View style={styles.pendingApprovalLeft}>
                  <View style={styles.pendingApprovalIcon}>
                    <Ionicons name="hourglass" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.pendingApprovalInfo}>
                    <Text style={styles.pendingApprovalTitle}>
                      ⏳ Onay Bekleyen Siparişleriniz Var!
                    </Text>
                    <Text style={styles.pendingApprovalSubtitle}>
                      {pendingApprovalOrders.length} sipariş onay bekliyor - Unutmayın!
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingApprovalArrow}>
                  <Ionicons name="arrow-forward-circle" size={28} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {selectedOrders.length > 0 && (
          <TouchableOpacity 
            style={styles.acceptButton} 
            onPress={acceptSelectedOrders}
            activeOpacity={0.9}
          >
            <View style={styles.acceptButtonInner}>
              <View style={styles.acceptButtonLeft}>
                <View style={styles.acceptButtonIcon}>
                  <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.acceptButtonText}>
                  {selectedOrders.length} Siparişi Kabul Et
                </Text>
              </View>
              <View style={styles.acceptButtonArrow}>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </View>
            </View>
          </TouchableOpacity>
        )}
        
        <FlatList
          data={orders.filter(order => order.status.toLowerCase() === "bekleniyor")}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshAllData} 
              tintColor="#8B5CF6"
              colors={["#8B5CF6"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <View style={styles.emptyIconInner}>
                  <Ionicons name="time-outline" size={32} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.emptyTitle}>Henüz Aktif Sipariş Yok</Text>
              <Text style={styles.emptyText}>
                Şu anda bekleyen sipariş bulunmuyor.{'\n'}Yeni siparişler geldiğinde burada görünecek.{'\n'}Sayfayı aşağı çekerek yenileyebilirsiniz.
              </Text>
            </View>
          }
        />
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={orderDetailModalVisible}
        onRequestClose={() => setOrderDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <Text style={styles.modalTitle}>Sipariş #{selectedOrder?.id}</Text>
                  <Text style={styles.modalSubtitle}>Detaylı Bilgiler</Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setOrderDetailModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>

              {selectedOrder && (
                <View style={styles.modalBody}>
                {selectedOrder.resim && (
                  <View style={styles.modalImageContainer}>
                    <TouchableOpacity
                      onPress={() => openFullScreenImage(selectedOrder.resim!)}
                      style={styles.modalImageTouchable}
                    >
                      <Image
                        source={{ uri: selectedOrder.resim }}
                        style={styles.modalImage}
                        resizeMode="cover"
                      />
                      <View style={styles.modalImageOverlay}>
                        <Ionicons name="expand" size={32} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
                
                <View style={styles.detailsGrid}>
                  <View style={styles.detailCard}>
                    <View style={[styles.detailIconBox, { backgroundColor: '#F0FDF9' }]}>
                      <Ionicons name="business" size={20} color="#4FACFE" />
                    </View>
                    <View style={styles.detailCardContent}>
                      <Text style={styles.detailCardLabel}>Firma</Text>
                      <Text style={styles.detailCardValue}>{selectedOrder.firma_adi}</Text>
                    </View>
                  </View>

                  <View style={styles.detailCard}>
                    <View style={[styles.detailIconBox, { backgroundColor: '#ECFDF5' }]}>
                      <Ionicons name="cash" size={20} color="#4FACFE" />
                    </View>
                    <View style={styles.detailCardContent}>
                      <Text style={styles.detailCardLabel}>Kurye Ücreti</Text>
                      <Text style={[styles.detailCardValue, styles.priceValue]}>
                        {selectedOrder.courier_price || selectedOrder.kurye_tutari} ₺
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailCard}>
                    <View style={[styles.detailIconBox, { backgroundColor: '#F0F9FF' }]}>
                      <Ionicons name="location" size={20} color="#4FACFE" />
                    </View>
                    <View style={styles.detailCardContent}>
                      <Text style={styles.detailCardLabel}>Teslimat Bölgesi</Text>
                      <Text style={styles.detailCardValue}>{selectedOrder.mahalle}</Text>
                    </View>
                  </View>

                  <View style={styles.detailCard}>
                    <View style={[styles.detailIconBox, { backgroundColor: '#F5F3FF' }]}>
                      <Ionicons name="card" size={20} color="#8B5CF6" />
                    </View>
                    <View style={styles.detailCardContent}>
                      <Text style={styles.detailCardLabel}>Ödeme Yöntemi</Text>
                      <Text style={styles.detailCardValue}>{selectedOrder.odeme_yontemi}</Text>
                    </View>
                  </View>

                  <View style={styles.detailCard}>
                    <View style={[styles.detailIconBox, { 
                      backgroundColor: selectedOrder.preparation_time === 0 ? '#DCFCE7' : '#FEF3C7' 
                    }]}>
                      <Ionicons 
                        name={selectedOrder.preparation_time === 0 ? "checkmark-circle" : "timer"} 
                        size={20} 
                        color={selectedOrder.preparation_time === 0 ? "#10B981" : "#F59E0B"} 
                      />
                    </View>
                    <View style={styles.detailCardContent}>
                      <Text style={styles.detailCardLabel}>Hazırlık Süresi</Text>
                      <Text style={[
                        styles.detailCardValue, 
                        { 
                          color: selectedOrder.preparation_time === 0 ? '#10B981' : '#374151',
                          fontWeight: '600' 
                        }
                      ]}>
                        {selectedOrder.preparation_time === 0 ? 'Hazır' : `${selectedOrder.preparation_time || 0} dakika`}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
            </ScrollView>
            
            {/* Modal Footer - Kabul Et Butonu */}
            {selectedOrder && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalAcceptButton}
                  onPress={() => handleAcceptOrderFromModal(selectedOrder)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalAcceptButtonGradient}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.modalAcceptButtonText}>Siparişi Kabul Et</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Tam Ekran Resim Modalı */}
      <Modal
        visible={fullScreenModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullScreenModalVisible(false)}
      >
        <TouchableOpacity
          onPress={() => setFullScreenModalVisible(false)}
          style={styles.fullScreenContainer}
        >
          {fullScreenImageUri && (
            <Image
              source={{ uri: fullScreenImageUri }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 15,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerLeft: {
    flex: 1,
    gap: 16,
  },  
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 14,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  titleSection: {
    flex: 1,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  metricBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  headerRight: {
    alignItems: 'center',
    gap: 12,
  },
  statusSection: {
    alignItems: 'center',
    gap: 8,
  },
  statusToggle: {
    padding: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  selectedBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  // Modern header styles
  modernHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
  },
  headerLeftModern: {
    flex: 1,
    gap: 16,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  professionalIconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  brandTextContainer: {
    flex: 1,
  },
  modernTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  modernSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
  },
  modernMetricsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  modernMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
  },
  modernMetricText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.98)',
  },
  headerRightModern: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  statusToggleRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginRight: 20,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modernStatusContainer: {
    alignItems: 'center',
    gap: 10,
    marginTop: 65,
  },

  modernStatusButton: {
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  modernStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modernSelectedBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 36,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  modernSelectedText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#8B5CF6',
  },

  orderItem: {
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 10,
  },
  orderContent: {
    padding: 8,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mainHeaderLeft: {
    gap: 4,
  },

  headerInfo: {
    flex: 1,
  },
  iconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 8,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restaurantInfoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 8,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  restaurantLogoContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  restaurantLogo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  defaultLogoContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  restaurantNameInIcon: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    flex: 1,
  },
  firmName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  orderIdMain: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orderId: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridIconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 4,
    borderRadius: 6,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    flex: 1,
  },
  paymentCenterItem: {
    flex: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentContentBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  paymentMethodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  paymentAmountLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 10,
  },
  courierFeeItem: {
    flex: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierFeeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  courierFeeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  detailButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  detailButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 2,
    zIndex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 64,
  },
  emptyIconBox: {
    backgroundColor: '#E6F3FF',
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
  },
  emptyIconInner: {
    backgroundColor: '#4FACFE',
    padding: 16,
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E3A8A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E6F3FF',
  },
  modalHeaderLeft: {
    gap: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  modalCloseButton: {
    padding: 8,
    backgroundColor: '#E6F3FF',
    borderRadius: 12,
  },
  modalBody: {
    padding: 20,
  },
  modalImageContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  modalImage: {
    width: '100%',
    height: 200,
  },
  detailsGrid: {
    gap: 16,
  },
  detailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6F3FF',
    gap: 16,
  },
  detailIconBox: {
    padding: 12,
    borderRadius: 19,
    backgroundColor: '#E6F3FF',
  },
  detailCardContent: {
    flex: 1,
    gap: 4,
  },
  detailCardLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  detailCardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  priceValue: {
    color: '#4FACFE',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorContainer: {
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  acceptButton: {
    margin: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  acceptButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptButtonIcon: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  acceptButtonArrow: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 8,
  },
  listContainer: {
    padding: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  
  },
  orderItemWrapper: {
    marginBottom: 8,
  },

  onlineToggleButton: {
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    top: -30,
  },

  onlineTimeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
    paddingLeft: 10,
    paddingRight: 70,
  },

  deliveryCountdownContainer: {
    marginVertical: 4,
  },
  deliveryCountdownCard: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  deliveryCountdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  deliveryCountdownTitle: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  deliveryCountdownTime: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  deliveryCountdownSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 9,
    fontWeight: '500',
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  countdownBadge: {
    padding: 2,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Bloklu sipariş stilleri
  blockedOrderWrapper: {
    opacity: 0.6,
  },
  blockedOrderItem: {
    opacity: 0.8,
  },
  blockedOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 10,
  },
  blockedOrderContent: {
    opacity: 0.7,
  },
  blockedText: {
    color: '#6B7280',
  },
  blockedDetailButton: {
    opacity: 0.5,
  },
  settlementCard: {
    margin: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  settlementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  settlementIconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 8,
    borderRadius: 8,
  },
  settlementTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  settlementGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  settlementItem: {
    flex: 1,
  },
  settlementLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  settlementValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  settlementNetBalance: {
    marginTop: 16,
    alignItems: 'center',
  },
  settlementNetLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  settlementNetValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  statsContainer: {
    flex: 1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniActionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 6,
    borderRadius: 6,
  },
  navigationButton: {
    backgroundColor: 'rgba(34, 197, 94, 0.4)',
    paddingHorizontal: 30,
    paddingVertical: 6,
    minWidth: 50,
  },
  // Aktif siparişler alert stilleri
  activeOrdersAlert: {
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activeOrdersGradient: {
    borderRadius: 16,
  },
  activeOrdersContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeOrdersLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  activeOrdersIcon: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 10,
    borderRadius: 12,
  },
  activeOrdersInfo: {
    flex: 1,
    gap: 4,
  },
  activeOrdersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeOrdersSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  activeOrdersArrow: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 12,
  },
  // Onay bekleyen siparişler alert stilleri
  pendingApprovalAlert: {
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  pendingApprovalGradient: {
    borderRadius: 16,
  },
  pendingApprovalContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingApprovalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  pendingApprovalIcon: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 10,
    borderRadius: 12,
  },
  pendingApprovalInfo: {
    flex: 1,
    gap: 4,
  },
  pendingApprovalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pendingApprovalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  pendingApprovalArrow: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 12,
  },
  // Hazırlık süresi stilleri
  preparationTimeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  preparationTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(253, 224, 71, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  preparationTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  restaurantNameAndId: {
    flex: 1,
  },
  orderIdSmall: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 1,
  },
  preparationTimeInline: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  preparationTimeTextInline: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  gridItemLarge: {
    flex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridItemMedium: {
    flex: 1.3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridValueSmall: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
    flex: 1,
  },
  paymentCenterItemSmaller: {
    flex: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodTextSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  paymentAmountLabelSmall: {
    fontSize: 7,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 9,
  },
  courierFeeItemSmall: {
    flex: 0.8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierFeeAmountSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  preparationBadge: {
    backgroundColor: 'rgba(253, 224, 71, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  preparationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  preparationBadgeReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  preparationBadgeTextReady: {
    color: '#10B981',
  },

  // Yeni kart tasarımı stilleri
  cardTopSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  restaurantSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  restaurantDetails: {
    flex: 1,
    gap: 2,
  },
  restaurantNameMain: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orderIdDisplay: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  preparationTimeCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  preparationTimeCardReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderLeftColor: '#10B981',
  },
  preparationTimeCardBlocked: {
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
    borderLeftColor: '#9CA3AF',
  },
  preparationTimeContent: {
    flex: 1,
    gap: 2,
  },
  preparationTimeMainText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  preparationTimeMainTextReady: {
    color: '#10B981',
  },
  preparationTimeLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  preparationTimeLabelReady: {
    color: 'rgba(16, 185, 129, 0.9)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  statusAndTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  preparationTimeInlineBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  preparationTimeInlineBadgeReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  preparationTimeInlineBadgeBlocked: {
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
    borderColor: 'rgba(156, 163, 175, 0.3)',
  },
  preparationTimeInlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  preparationTimeInlineTextReady: {
    color: '#10B981',
  },
  topRightBadges: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  gridItemSmall: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentCenterItemLarge: {
    flex: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodTextLarge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  paymentAmountLabelLarge: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 12,
  },

  // Tam ekran resim modalı style'ları
  modalImageTouchable: {
    position: 'relative',
  },
  modalImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },

  // Modal Footer Styles
  modalFooter: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6F3FF',
  },
  modalAcceptButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalAcceptButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
  },
  modalAcceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

});

export default KuryeHome;
