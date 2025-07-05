import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Button,
  Alert,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "react-native-vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import io from "socket.io-client";
import { API_CONFIG, getFullUrl, API_ENDPOINTS, authedFetch } from "../../constants/api";
import NotificationButton from "../../components/NotificationButton";
// Timezone import'ları kaldırıldı - artık basit hesaplama kullanıyoruzir

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Mahalle verileri için tip tanımı
interface Neighborhood {
  id: number;
  name: string;
  district: string;
  fullName: string;
  courierPrice: number;  // Kurye fiyatı
  restaurantPrice: number;  // Restoran fiyatı
  minOrderAmount: number;
  estimatedTime: number;
  deliveryPriceId: number;
}

// Restoran mahalle verisi için tip tanımı
interface RestaurantNeighborhoodData {
  restaurant: {
    id: number;
    name: string;
  };
  availableNeighborhoods: Neighborhood[];
  totalNeighborhoods: number;
}

// Resim verisi için tip tanımı
interface ImageAsset {
  uri: string;
}

interface Order {
  id: number;
  firmaid: string;
  mahalle: string;
  odeme_yontemi: string;
  kurye_tutari: string;
  nakit_tutari: string;
  banka_tutari: string;
  hediye_tutari: string;
  firma_adi: string;
  resim: string;
  status: string;
  kuryeid: string;
  created_at: string;
  accepted_at?: string; // Kabul edilme zamanı
  courier_price?: string;
  restaurant_price?: string;
  courier_name?: string; // Kurye adı
  courier_surname?: string; // Kurye soyadı
  courier_phone?: string; // Kurye telefonu
  preparation_time?: number; // Hazırlık süresi (dakika)
}

  // Ödeme yöntemi için tip tanımı
type PaymentMethod = "nakit" | "kredi_karti" | "hediye" | "online";

// Hazırlık süresi seçenekleri
const PREPARATION_TIME_OPTIONS = [
  { value: 0, label: "Hazır" },
  { value: 5, label: "5 Dakika" },
  { value: 10, label: "10 Dakika" },
  { value: 15, label: "15 Dakika" },
  { value: 30, label: "30 Dakika" },
  { value: 45, label: "45 Dakika" },
];

// Custom hook for countdown timer - Backend ve frontend aynı timezone'da (Turkey time)
const useCountdown = (targetTime: Date | null) => {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, isExpired: false });
  
  useEffect(() => {
          if (!targetTime) return;
      
      const interval = setInterval(() => {
        // Backend Turkey time kullanıyor, frontend'te de Turkey time kullan
        const now = new Date(new Date().getTime() + (3 * 60 * 60 * 1000)); // Turkey time
        const diff = targetTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        clearInterval(interval);
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown({ hours, minutes, seconds, isExpired: false });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [targetTime]);
  
  return countdown;
};

// Gereksiz hook'lar kaldırıldı - artık tek bir useCountdown yeterli

// Restaurant countdown component - Displays appropriate countdown based on order status
const RestaurantCountdown: React.FC<{ order: Order }> = ({ order }) => {
  const status = order.status.toLowerCase();
  
  // Backend zaten Türkiye saatinde timestamp kaydediyor, direkt kullan
  const createdAt = new Date(order.created_at);
  const deletionTime = new Date(createdAt.getTime() + 3600000); // 1 saat sonra silinecek
  
  // Kuryede durumu için accepted_at zamanından teslimat deadline'ını hesapla
  let deliveryDeadline: Date;
  if (status === "kuryede" && order.accepted_at) {
    const acceptedAt = new Date(order.accepted_at);
    deliveryDeadline = new Date(acceptedAt.getTime() + 3600000); // Kabul edildiği andan 1 saat sonra
  } else {
    // Fallback: created_at + 1 saat (eski davranış)
    deliveryDeadline = new Date(createdAt.getTime() + 3600000);
  }
  
  // Countdown hook'larını çağır - timezone düzeltmesi olmadan doğrudan hesapla
  const autoDeleteCountdown = useCountdown(deletionTime);
  const deliveryCountdown = useCountdown(deliveryDeadline);
  
  if (status === "bekleniyor") {
    if (autoDeleteCountdown.isExpired) {
      return (
        <View style={styles.countdownContainer}>
          <View style={[styles.countdownBadge, { backgroundColor: '#EF4444' }]}>
            <Icon name="warning" size={14} color="#FFFFFF" />
            <Text style={styles.countdownText}>
              SÜRE DOLDU! Sipariş silinecek
            </Text>
          </View>
        </View>
      );
    }
    
    const timeLeft = autoDeleteCountdown.hours > 0 
      ? `${autoDeleteCountdown.hours}s ${autoDeleteCountdown.minutes}dk`
      : `${autoDeleteCountdown.minutes}dk ${autoDeleteCountdown.seconds}s`;
    
    return (
      <View style={styles.countdownContainer}>
        <View style={[styles.countdownBadge, { backgroundColor: '#F59E0B' }]}>
          <Icon name="schedule" size={14} color="#FFFFFF" />
          <Text style={styles.countdownText}>
            {timeLeft} sonra silinecek
          </Text>
        </View>
      </View>
    );
  }
  
  if (status === "kuryede") {
    if (deliveryCountdown.isExpired) {
      return (
        <View style={styles.countdownContainer}>
          <View style={[styles.countdownBadge, { backgroundColor: '#EF4444' }]}>
            <Icon name="warning" size={14} color="#FFFFFF" />
            <Text style={styles.countdownText}>
              TESLİMAT SÜRESİ AŞILDI!
            </Text>
          </View>
        </View>
      );
    }
    
    const timeLeft = deliveryCountdown.hours > 0 
      ? `${deliveryCountdown.hours}s ${deliveryCountdown.minutes}dk`
      : `${deliveryCountdown.minutes}dk ${deliveryCountdown.seconds}s`;
      
    const isUrgent = deliveryCountdown.hours === 0 && deliveryCountdown.minutes < 15;
    const isModerate = deliveryCountdown.hours === 0 && deliveryCountdown.minutes < 30;
    
    const backgroundColor = isUrgent ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';
    const statusText = isUrgent ? 'ACİL TESLİMAT!' : isModerate ? 'HIZLI TESLİMAT' : 'TESLİMAT SÜRESİ';
    
    return (
      <View style={styles.countdownContainer}>
        <View style={[styles.countdownBadge, { backgroundColor }]}>
          <Icon name="delivery-dining" size={14} color="#FFFFFF" />
          <Text style={styles.countdownText}>
            {statusText}: {timeLeft}
          </Text>
        </View>
      </View>
    );
  }
  
  // Diğer durumlar için countdown gösterme
  return null;
};

// Tab Badge Component - Displays count badge for tabs
const TabBadge: React.FC<{ count: number, color: string }> = ({ count, color }) => {
  if (count <= 0) return null;
  
  return (
    <View style={[styles.tabBadge, { backgroundColor: color }]}>
      <Text style={styles.tabBadgeText}>{count}</Text>
    </View>
  );
};

const RestaurantHome = () => {
  const navigation = useNavigation();

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingApprovalOrders, setPendingApprovalOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Tab sistemi için state - 3 sekme: bekleniyor, kuryede, onay bekleyen
  const [activeTab, setActiveTab] = useState<'waiting' | 'indelivery' | 'pending'>('waiting');

  // Güvenli parseFloat fonksiyonu - NaN hatalarını önler
  const safeParseFloat = (value: any): number => {
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    const parsed = parseFloat(value.toString());
    return isNaN(parsed) ? 0 : parsed;
  };

  // Toplam tutar hesaplama fonksiyonu - Sadece ödeme tutarı (kurye ücreti hariç)
  const calculateTotalAmount = (order: Order): number => {
    // Online ödemeler için 0 döndür
    if (order.odeme_yontemi.toLowerCase().includes("online")) {
      return 0;
    }
    
    const nakitTutari = safeParseFloat(order.nakit_tutari);
    const bankaTutari = safeParseFloat(order.banka_tutari);
    const hediyeTutari = safeParseFloat(order.hediye_tutari);
    
    return nakitTutari + bankaTutari + hediyeTutari;
  };

  // Mahalle seçimi için yeni state'ler
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [neighborhoodsLoading, setNeighborhoodsLoading] = useState(false);
  const [neighborhoodModalVisible, setNeighborhoodModalVisible] = useState(false);
  const [totalNeighborhoods, setTotalNeighborhoods] = useState(0);

  // Sipariş ekleme/düzenleme modalı (yeni veya düzenleme için)
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<Neighborhood | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [image, setImage] = useState<ImageAsset | null>(null);
  const [enteredCash, setEnteredCash] = useState<string>("");
  const [enteredBank, setEnteredBank] = useState<string>("");
  const [enteredGift, setEnteredGift] = useState<string>("");
  const [selectedPreparationTime, setSelectedPreparationTime] = useState<number>(0); // Default: Hazır
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Eğer editingOrder null ise yeni sipariş, dolu ise düzenleme modunda
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Sipariş detay modalı için state
  const [orderDetailModalVisible, setOrderDetailModalVisible] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Tam ekran resim modalı için state
  const [fullScreenModalVisible, setFullScreenModalVisible] = useState(false);
  const [fullScreenImageUri, setFullScreenImageUri] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Socket connection for real-time notifications
  const socketRef = useRef<any>(null);
  const notificationTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  
  // Modal scroll ref
  const modalScrollRef = useRef<ScrollView>(null);

  // Debounced notification function to prevent duplicates
  const sendNotificationDebounced = useCallback((notificationId: string, notificationConfig: any) => {
    // Clear existing timeout for this notification type
    if (notificationTimeouts.current.has(notificationId)) {
      clearTimeout(notificationTimeouts.current.get(notificationId)!);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      Notifications.scheduleNotificationAsync(notificationConfig);
      notificationTimeouts.current.delete(notificationId);
    }, 100); // 100ms debounce
    
    notificationTimeouts.current.set(notificationId, timeout);
  }, []);

  // Setup notifications
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          return;
        }
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };
    
    setupNotifications();
  }, []);



  // Initialize socket connection after user is loaded
  useEffect(() => {
    if (!user) return;

    const socket = io(API_CONFIG.SOCKET_URL, { 
      transports: ["websocket", "polling"],
      timeout: 45000,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
      forceNew: true,
      upgrade: true
    });

    socket.on("connect", () => {
      console.log("🔗 Restaurant socket connected");
      // Join restaurant room to receive order status updates
      socket.emit("joinRestaurantRoom", { restaurantId: user.id });
    });

    socket.on("connect_error", (err: any) => {
      console.error("Restaurant socket connection error:", err);
      
      // Try to reconnect with fallback transport
      setTimeout(() => {
        if (!socket.connected) {
          console.log("Attempting to reconnect restaurant socket...");
          socket.connect();
        }
      }, 3000);
    });

    // Listen for order status updates from couriers
    socket.on("orderStatusUpdate", (data: { orderId: string, status: string }) => {
      console.log("📋 Restaurant received order status update:", data);
      
      // Eğer sipariş teslim edildi veya onay bekliyor durumuna geçtiyse, anlık olarak aktif listeden kaldır
      if (data.status === "teslim edildi" || data.status === "onay bekliyor") {
        setOrders(prevOrders => prevOrders.filter(order => order.id.toString() !== data.orderId.toString()));
      }
      
      // Always refresh orders to ensure data consistency
      fetchOrders();
      
      // If status is pending approval, also refresh pending approval orders
      if (data.status === "onay bekliyor") {
        fetchPendingApprovalOrders();
      }
    });

    // Listen for order deletion events (already handled in deleteOrder function)
    socket.on("orderDeleted", (data: { orderId: string | number, message: string }) => {
      console.log("🗑️ Restaurant received order deletion:", data);
      // This is handled by the deleteOrder function itself
    });

    // Listen for new orders from other restaurants (for general awareness)
    socket.on("newOrder", (data: any) => {
      console.log("🆕 Restaurant received new order notification:", data);
      // Refresh orders list when new order is created
      fetchOrders();
    });

    // Listen for order cancellations specifically
    socket.on("orderCancelled", (data: { orderId: string, message: string }) => {
      console.log("❌ Restaurant received order cancellation:", data);
      
      // Send debounced push notification
      sendNotificationDebounced(`orderCancelled_${data.orderId}`, {
        content: {
          title: "🔄 Sipariş İptal Edildi",
          body: `Sipariş #${data.orderId} kurye tarafından iptal edildi ve tekrar bekleme listesine alındı.`,
          sound: 'default',
          data: { 
            orderId: data.orderId,
            type: 'orderCancelled'
          },
        },
        trigger: null,
      });
      
      // Refresh order list when any order is cancelled
      fetchOrders();
      fetchPendingApprovalOrders();
    });

    // Listen for order acceptance notifications
    socket.on("orderAccepted", (data: { 
      orderId: string, 
      message: string, 
      courierName: string, 
      courierPhone: string,
      orderDetails: Order,
      timestamp: string 
    }) => {
      console.log("✅ Restaurant received order acceptance:", data);
      
      // Send debounced push notification
      sendNotificationDebounced(`orderAccepted_${data.orderId}`, {
        content: {
          title: "✅ Sipariş Kabul Edildi!",
          body: `Sipariş #${data.orderId} ${data.courierName} tarafından kabul edildi.`,
          sound: 'default',
          data: { 
            orderId: data.orderId,
            courierName: data.courierName,
            courierPhone: data.courierPhone,
            type: 'orderAccepted'
          },
        },
        trigger: null, // Show immediately
      });
      
      // Refresh order list to show updated status
      fetchOrders();
    });

    // Listen for pending approval orders
    socket.on("orderPendingApproval", (data: { orderId: string, courierId: string, message: string, orderDetails: any }) => {
      console.log("⏳ Restaurant received order pending approval notification:", data);
      
      // Sipariş artık aktif listeden çıkıp onay bekleyen listeye geçiyor, anlık olarak kaldır
      setOrders(prevOrders => prevOrders.filter(order => order.id.toString() !== data.orderId.toString()));
      
      // Send debounced push notification
      sendNotificationDebounced(`orderPendingApproval_${data.orderId}`, {
        content: {
          title: "⏳ Sipariş Onay Bekliyor",
          body: `Sipariş #${data.orderId} teslim edildi ve onayınızı bekliyor.`,
          sound: 'default',
          data: { 
            orderId: data.orderId,
            courierId: data.courierId,
            type: 'orderPendingApproval'
          },
        },
        trigger: null,
      });
      
      // Refresh pending approval orders list
      fetchPendingApprovalOrders();
    });

    // Listen for order delivery notifications
    socket.on("orderDelivered", (data: { orderId: string, courierId: string, message: string, orderDetails: any }) => {
      console.log("📦 Restaurant received order delivery notification:", data);
      
      // Anlık olarak siparişi listeden kaldır
      setOrders(prevOrders => prevOrders.filter(order => order.id.toString() !== data.orderId.toString()));
      
      // Send debounced push notification
      sendNotificationDebounced(`orderDelivered_${data.orderId}`, {
        content: {
          title: "✅ Sipariş Teslim Edildi",
          body: `Sipariş #${data.orderId} başarıyla teslim edildi! Kurye Ücreti: ${data.orderDetails?.courier_price} ₺`,
          sound: 'default',
          data: { 
            orderId: data.orderId,
            courierTip: data.orderDetails?.courier_price,
            type: 'orderDelivered'
          },
        },
        trigger: null,
      });
      
      // Refresh order list to update status (backup)
      fetchOrders();
    });

    // Listen for automatic order deletion notifications
    socket.on("orderAutoDeleted", (data: { orderId: string, firmName: string, neighborhood: string, message: string }) => {
      console.log("🗑️ Restaurant received order auto-deletion notification:", data);
      
      // Remove order from list
      setOrders(prevOrders => prevOrders.filter(order => order.id.toString() !== data.orderId.toString()));
      
      // Show deletion notification
      Alert.alert(
        "⏰ Sipariş Otomatik Silindi",
        `${data.message}\n\nSiparişiniz 1 saat içinde kurye tarafından kabul edilmediği için otomatik olarak silindi.`,
        [{ text: "Tamam", style: "default" }]
      );
    });

    // Listen for order expiration notifications specifically for this restaurant
    socket.on("yourOrderExpired", (data: { orderId: string, message: string }) => {
      console.log("⏰ Restaurant received order expiration notification:", data);
      
      // Remove expired order from list
      setOrders(prevOrders => prevOrders.filter(order => order.id.toString() !== data.orderId.toString()));
      
      // Show expiration alert
      Alert.alert(
        "⏰ Sipariş Süresi Doldu",
        data.message,
        [{ 
          text: "Tamam", 
          style: "default",
          onPress: () => {
            // Refresh orders to ensure list is up to date
            fetchOrders();
          }
        }]
      );
    });

    // Listen for order approved events
    socket.on("orderApproved", (data: { orderId: string, order: any }) => {
      console.log("✅ Restaurant received order approved event:", data);
      
      // Remove from pending approval list instantly
      setPendingApprovalOrders(prevOrders => 
        prevOrders.filter(order => order.id.toString() !== data.orderId.toString())
      );
      
      // Refresh orders list to ensure consistency
      fetchOrders();
    });

    // Listen for refresh order list events
    socket.on("refreshOrderList", (data: { orderId: string, action: string, message: string }) => {
      console.log("🔄 Restaurant received refresh order list event:", data);
      
      // Refresh both lists based on action
      if (data.action === 'orderApproved') {
        // Order moved from pending approval to completed, refresh both lists
        fetchPendingApprovalOrders();
        fetchOrders();
      } else {
        // General refresh
        fetchOrders();
        fetchPendingApprovalOrders();
      }
    });

    // Listen for admin notifications
    socket.on("adminNotification", (data: { title: string, message: string, priority: string, withSound: boolean, timestamp: string, type: string, sender: string }) => {
      console.log("📢 Restaurant: Admin notification received:", data);
      
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
          sound: data.withSound ? 'default' : undefined,
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

    socketRef.current = socket;

    return () => {
      // Clear all notification timeouts
      notificationTimeouts.current.forEach(timeout => clearTimeout(timeout));
      notificationTimeouts.current.clear();
      
      // Disconnect socket properly
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      
      // Clear socket ref
      socketRef.current = null;
    };
  }, [user, sendNotificationDebounced]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          setUser(JSON.parse(userData));
        }
        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading user data:', error);
        setIsLoaded(true);
      }
    };
    loadUser();
  }, []);

  const userId = user?.id;
  const firmaAdi = user?.name;

  // Siparişleri getiren fonksiyon
  const fetchOrders = useCallback(async () => {
    if (!user) {
      console.log("🚫 fetchOrders: User not loaded, skipping fetch.");
      return;
    }
    
    try {
      setError(null);
      console.log(`📡 Fetching orders for restaurant ID: ${user.id}`);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_ORDERS_BY_FIRM(user.id)));
      console.log(`RESPONSE: status = ${response.status}, ok = ${response.ok}`);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Orders fetched successfully. Data:", JSON.stringify(data, null, 2));
        setOrders(data.data || []);
      } else if (response.status === 404) {
        console.log("⚠️ No orders found for this restaurant (404). Setting orders to empty.");
        setOrders([]);
      } else {
        const errorText = await response.text();
        console.error(`❌ HTTP error! Status: ${response.status}, Details: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (err) {
      if ((err as Error).message.includes('404')) {
        console.log("⚠️ Caught 404 error, silently managing empty orders.");
        setOrders([]);
      } else {
        console.error("❌ Error fetching orders (catch block):", err);
        setError("Siparişler yüklenirken bir hata oluştu");
      }
    }
  }, [user]);

  // Onay bekleyen siparişleri getiren fonksiyon
  const fetchPendingApprovalOrders = useCallback(async () => {
    if (!user) {
      console.log("🚫 fetchPendingApprovalOrders: User not loaded, skipping fetch.");
      return;
    }
    
    try {
      console.log(`📡 Fetching pending approval orders for restaurant ID: ${user.id}`);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_PENDING_APPROVAL_ORDERS_RESTAURANT(user.id)));
      console.log(`RESPONSE: status = ${response.status}, ok = ${response.ok}`);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Pending approval orders fetched successfully. Data:", JSON.stringify(data, null, 2));
        setPendingApprovalOrders(data.data || []);
      } else if (response.status === 404) {
        console.log("⚠️ No pending approval orders found for this restaurant (404). Setting to empty.");
        setPendingApprovalOrders([]);
      } else {
        const errorText = await response.text();
        console.error(`❌ HTTP error! Status: ${response.status}, Details: ${errorText}`);
        setPendingApprovalOrders([]);
      }
    } catch (err) {
      console.error("❌ Error fetching pending approval orders:", err);
      setPendingApprovalOrders([]);
    }
  }, [user]);

  // Sipariş onaylama fonksiyonu
  const approveOrder = useCallback(async (orderId: number) => {
    if (!user) return;
    
    try {
      console.log(`🔄 Approving order ID: ${orderId}`);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.APPROVE_ORDER), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Approve order error response:", errorText);
        throw new Error(`Sipariş onaylanırken hata oluştu: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("✅ Order approved successfully:", data);

      // Listeleri güncelle
      await Promise.all([fetchOrders(), fetchPendingApprovalOrders()]);
      
      
    } catch (error) {
      console.error("Sipariş onaylama hatası:", error);
      Alert.alert("Hata", "Sipariş onaylanırken bir hata oluştu.");
    }
  }, [user, fetchOrders, fetchPendingApprovalOrders]);
  
  // Hesaplaşma verilerini çeken fonksiyon


  // Ekran odaklandığında verileri yenile
  useFocusEffect(
    useCallback(() => {
      if (isLoaded && user) {
        fetchOrders();
        fetchPendingApprovalOrders();
      }
    }, [isLoaded, user, fetchOrders, fetchPendingApprovalOrders])
  );

  useEffect(() => {
    if (isLoaded && user) {
      fetchOrders();
      fetchPendingApprovalOrders();
    }
  }, [isLoaded, user, fetchOrders, fetchPendingApprovalOrders]);

  // Mahalleler için yeni useEffect - sayfa açıldığında mahalleleri yükle
  useEffect(() => {
    if (isLoaded && user?.id) {
      fetchRestaurantNeighborhoods();
    }
  }, [isLoaded, user]);

  // Otomatik olarak "Bekleniyor" sekmesine geç eğer onay bekleyen sipariş yoksa
  useEffect(() => {
    if (pendingApprovalOrders.length === 0 && activeTab === 'pending') {
      setActiveTab('waiting');
    }
  }, [pendingApprovalOrders.length, activeTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchPendingApprovalOrders()]);
    setRefreshing(false);
  }, [fetchOrders, fetchPendingApprovalOrders]);

  // Restoranın mahallelerini API'den getir
  const fetchRestaurantNeighborhoods = async () => {
    if (!user?.id) return;
    try {
      const url = getFullUrl(API_ENDPOINTS.GET_RESTAURANT_DELIVERY_AREAS());
      const response = await authedFetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error fetching restaurant neighborhoods, non-ok response:', errorText);
        throw new Error(`Mahalle bilgileri alınamadı: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        const neighborhoods = data.data.map((area: any) => ({
          id: area.id,
          name: area.neighborhood_name,
          district: area.neighborhood_name.split(' ')[0], // İlk kelime ilçe
          fullName: area.neighborhood_name,
          courierPrice: parseFloat(area.courier_price || 0), // Kurye fiyatı
          restaurantPrice: parseFloat(area.restaurant_price || 0), // Restoran fiyatı
          minOrderAmount: 0, // Varsayılan değer
          estimatedTime: area.estimated_delivery_time || 30,
          deliveryPriceId: area.id
        }));

        setNeighborhoods(neighborhoods);
        setTotalNeighborhoods(neighborhoods.length);
      } else {
        throw new Error(data.message || 'Mahalle bilgileri alınamadı');
      }
    } catch (error) {
      console.error('Error fetching restaurant neighborhoods:', error);
      Alert.alert('Hata', 'Mahalle bilgileri yüklenirken bir hata oluştu');
    }
  };

  // Modal açıldığında mahalleleri yükle
  const openOrderModal = () => {
    setModalVisible(true);
    setSelectedNeighborhood(null); // Mahalle seçimini sıfırla
    setNeighborhoodModalVisible(false); // Mahalle dropdown'unu kapat
    setImage(null); // Resmi sıfırla
    setSelectedPaymentMethod(null); // Ödeme yöntemini sıfırla
    setEnteredCash("");
    setEnteredBank("");
    setEnteredGift("");
    setSelectedPreparationTime(0);
    // Mahalleler yüklü değilse yeniden yükle (fallback)
    if (neighborhoods.length === 0 && !neighborhoodsLoading) {
      fetchRestaurantNeighborhoods();
    }
  };

  // Mahalle seçim modalını aç
  const openNeighborhoodModal = () => {
    // Mahalleler zaten yüklü olmadığı durumda yeniden yükle
    if (neighborhoods.length === 0 && !neighborhoodsLoading) {
      fetchRestaurantNeighborhoods();
    }
    setNeighborhoodModalVisible(true);
  };

  // Mahalle seçildiğinde
  const selectNeighborhood = (neighborhood: Neighborhood) => {
    setSelectedNeighborhood(neighborhood);
    setNeighborhoodModalVisible(false);
  };

  // Resim seçme/fotoğraf çekme işlemleri
  const handleImagePicker = () => {
    Alert.alert("Resim Seç", "Bir seçenek belirleyin", [
      { text: "Galeriden Seç", onPress: pickImage },
      { text: "Fotoğraf Çek", onPress: takePhoto },
      { text: "İptal", style: "cancel" },
    ]);
  };

  const pickImage = async () => {
    try {
      // Galeri izinlerini kontrol et
      const galleryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (galleryPermission.status !== 'granted') {
        Alert.alert(
          "Galeri İzni Gerekli",
          "Galeriden resim seçebilmek için galeri iznine ihtiyacımız var.",
          [
            { text: "İptal", style: "cancel" },
            { text: "Ayarlara Git", onPress: () => ImagePicker.requestMediaLibraryPermissionsAsync() }
          ]
        );
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.4, // %40 kalite - daha hızlı upload
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage({ uri: result.assets[0].uri });
        // Resim seçildikten sonra modal'ı aşağı kaydır
        setTimeout(() => {
          modalScrollRef.current?.scrollTo({ y: 200, animated: true });
        }, 100);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Hata", "Resim seçilirken bir hata oluştu. Lütfen galeri izinlerini kontrol edin.");
    }
  };

  const takePhoto = async () => {
    try {
      // Kamera izinlerini kontrol et
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      
      if (cameraPermission.status !== 'granted') {
        Alert.alert(
          "Kamera İzni Gerekli",
          "Fotoğraf çekebilmek için kamera iznine ihtiyacımız var.",
          [
            { text: "İptal", style: "cancel" },
            { text: "Ayarlara Git", onPress: () => ImagePicker.requestCameraPermissionsAsync() }
          ]
        );
        return;
      }

      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.4, // %40 kalite - daha hızlı upload
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage({ uri: result.assets[0].uri });
        // Resim seçildikten sonra modal'ı aşağı kaydır
        setTimeout(() => {
          modalScrollRef.current?.scrollTo({ y: 200, animated: true });
        }, 100);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Hata", "Fotoğraf çekilirken bir hata oluştu. Lütfen kamera izinlerini kontrol edin.");
    }
  };

  // Resmi backend API'ye yükleyen fonksiyon
  const uploadImage = async (): Promise<string | null> => {
    if (!image) return null;

    setIsUploadingImage(true);
    const uriParts = image.uri.split(".");
    const fileType = uriParts[uriParts.length - 1];

    const formData = new FormData();
    formData.append("image", {
      uri: image.uri,
      name: `order-${Date.now()}.${fileType}`,
      type: `image/${fileType}`,
    } as any);

    try {
      // Backend API'ye gönder
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.UPLOAD_IMAGE), {
        method: "POST",
        body: formData,
        // FormData ile Content-Type header'ı otomatik ayarlanır
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log("📷 Resim başarıyla yüklendi:", data.imageUrl);
        return data.imageUrl;
      } else {
        console.error("❌ Resim upload hatası:", data.message);
        return null;
      }
    } catch (error) {
      console.error("❌ Upload servis hatası:", error);
      return null;
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Resim URL'sini düzelten helper fonksiyon
  const fixImageUrl = (imageUrl: string | null): string | null => {
    if (!imageUrl) return null;
    
    // Eğer tam URL ise doğrudan kullan
    if (imageUrl.startsWith('http')) {
      // HTTPS URL'lerini HTTP'ye çevir - React Native HTTP resim yükleyemiyor
      if (imageUrl.startsWith('https://red.enucuzal.com')) {
        return imageUrl.replace('https://red.enucuzal.com', 'http://red.enucuzal.com');
      }
      return imageUrl;
    }
    
    // Göreceli yolları API_CONFIG'den base URL ile tam URL'ye çevir
    return `${API_CONFIG.BASE_URL}${imageUrl}`;
  };

  // Hesaplama fonksiyonları
  const getCourierFee = (): number => {
    if (selectedNeighborhood && selectedNeighborhood.courierPrice) {
      return selectedNeighborhood.courierPrice;
    }
    return 0;
  };

  const getTotalAmount = (): number => {
    // Online ödemeler için 0 döndür
    if (selectedPaymentMethod === "online") {
      return 0;
    }
    
    let paymentAmount = 0;
    
    if (selectedPaymentMethod === "nakit") {
      paymentAmount = safeParseFloat(enteredCash);
    } else if (selectedPaymentMethod === "kredi_karti") {
      paymentAmount = safeParseFloat(enteredBank);
    } else if (selectedPaymentMethod === "hediye") {
      paymentAmount = safeParseFloat(enteredGift);
    }
    
    return paymentAmount;
  };

  const getPaymentMethodSummary = (): string => {
    if (selectedPaymentMethod === "nakit") {
      return `Nakit: ${enteredCash || "0"} TL`;
    }
    if (selectedPaymentMethod === "kredi_karti") {
      return `Kredi Kartı: ${enteredBank || "0"} TL`;
    }
    if (selectedPaymentMethod === "hediye") {
      return `Hediye Çeki: ${enteredGift || "0"} TL`;
    }
    if (selectedPaymentMethod === "online") {
      return "Online";
    }
    return "Yok";
  };

  // Sipariş ekleme/düzenleme fonksiyonu
  const saveOrder = async () => {
    if (isSavingOrder) return; // Çift tıklamayı engelle
    
    if (!selectedNeighborhood) {
      Alert.alert("Hata", "Lütfen bir mahalle seçin.");
      return;
    }
    if (!selectedPaymentMethod) {
      Alert.alert("Hata", "Lütfen bir ödeme yöntemi seçin.");
      return;
    }

    setIsSavingOrder(true);

    let nakitTutari = 0, bankaTutari = 0, hediyeTutari = 0;
    if (selectedPaymentMethod === "nakit") {
      nakitTutari = safeParseFloat(enteredCash);
      if (nakitTutari <= 0) {
        Alert.alert("Hata", "Nakit ödeme için tutar girilmelidir ve 0'dan büyük olmalıdır.");
        setIsSavingOrder(false);
        return;
      }
    } else if (selectedPaymentMethod === "kredi_karti") {
      bankaTutari = safeParseFloat(enteredBank);
      if (bankaTutari <= 0) {
        Alert.alert("Hata", "Kredi kartı ödeme için tutar girilmelidir ve 0'dan büyük olmalıdır.");
        setIsSavingOrder(false);
        return;
      }
    } else if (selectedPaymentMethod === "hediye") {
      hediyeTutari = safeParseFloat(enteredGift);
      if (hediyeTutari <= 0) {
        Alert.alert("Hata", "Hediye çeki ödeme için tutar girilmelidir ve 0'dan büyük olmalıdır.");
        setIsSavingOrder(false);
        return;
      }
    } else if (selectedPaymentMethod === "online") {
      // Online ödemede girilen banka tutarını kullan, yoksa 0
      bankaTutari = safeParseFloat(enteredBank);
      // Online ödeme için tutar girme zorunluluğu kaldırıldı
    }

    // Eğer resim seçilmişse önce resmi ayrı servise yükle
    let uploadedImageUrl = null;
    if (image) {
      uploadedImageUrl = await uploadImage();
      if (!uploadedImageUrl) {
        Alert.alert("Hata", "Resim yüklenemedi, lütfen tekrar deneyin.");
        setIsSavingOrder(false);
        return;
      }
    }

    try {
      const orderData = {
        userId: user.id,
        firmaid: user.id, // Backend'in beklediği alan
        resim: uploadedImageUrl, // Upload servisinden dönen URL
        mahalle: selectedNeighborhood.name,
        neighborhoodId: selectedNeighborhood.id,
        deliveryPrice: selectedNeighborhood.courierPrice, // Kurye için ödenen
        restaurantPrice: selectedNeighborhood.restaurantPrice, // Restoranın aldığı
        odemeYontemi: getPaymentMethodSummary(),
        nakitTutari,
        bankaTutari,
        hediyeTutari,
        firmaAdi: user.name || 'Restaurant',
        toplamTutar: getTotalAmount(),
        preparationTime: selectedPreparationTime, // Hazırlık süresi
      };

      console.log("🍕 Gönderilen sipariş verisi:", orderData);
      console.log("🕒 Seçilen hazırlık süresi:", selectedPreparationTime);
      console.log("📷 Yüklenen resim URL:", uploadedImageUrl);

      let response;
      if (editingOrder) {
        response = await authedFetch(getFullUrl(API_ENDPOINTS.UPDATE_ORDER(editingOrder.id)), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      } else {
        console.log("API endpoint:", getFullUrl(API_ENDPOINTS.ADD_ORDER));
        response = await authedFetch(getFullUrl(API_ENDPOINTS.ADD_ORDER), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      }

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Response error text:", errorBody);
        throw new Error("Sipariş kabul edilirken hata oluştu.");
      }

      const responseData = await response.json();
      console.log("Sipariş başarıyla kaydedildi:", responseData);

      // Send real-time notification to couriers via socket (only for new orders, not updates)
      if (!editingOrder && socketRef.current && responseData.data) {
        const newOrder = Array.isArray(responseData.data) ? responseData.data[0] : responseData.data;
        console.log("📡 Broadcasting new order to couriers:", newOrder);
        
        // Broadcast to all connected couriers
        socketRef.current.emit("broadcastNewOrder", {
          order: {
            id: newOrder.id,
            firmaid: user.id,
            mahalle: selectedNeighborhood.name,
            odeme_yontemi: getPaymentMethodSummary(),
            kurye_tutari: getCourierFee(),
            nakit_tutari: nakitTutari,
            banka_tutari: bankaTutari,
            hediye_tutari: hediyeTutari,
            firma_adi: user.name || 'Restaurant',
            resim: uploadedImageUrl, // Upload servisinden dönen resim URL'si
            status: "bekleniyor",
            created_at: newOrder.created_at, // Database'den gelen gerçek created_at kullan
            title: `${user.name || 'Restaurant'} - ${selectedNeighborhood.name}`,
            preparation_time: selectedPreparationTime // Hazırlık süresini ekle
          }
        });
        
        Alert.alert("Başarılı", "Sipariş oluşturuldu ve kuryelere bildirildi! 🚴‍♂️");
      } else if (editingOrder) {
        Alert.alert("Başarılı", "Sipariş başarıyla güncellendi");
      }

      setModalVisible(false);
      setSelectedNeighborhood(null);
      setImage(null);
      setEnteredCash("");
      setEnteredBank("");
      setEnteredGift("");
      setSelectedPaymentMethod(null);
      setEditingOrder(null);
      setSelectedPreparationTime(0); // Reset to Hazır

      fetchOrders();
    } catch (err: any) {
      console.error("Sipariş kaydedilirken hata:", err);
      Alert.alert("Hata", "Sipariş kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsSavingOrder(false);
    }
  };

  // Sipariş silme fonksiyonu
  const deleteOrder = async (orderId: number) => {
    Alert.alert("Onay", "Sipariş silinsin mi?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            // Silmeden önce siparişin kurye bilgisini al
            const orderToDelete = orders.find(order => order.id === orderId);
            const assignedCourierId = orderToDelete?.kuryeid;

            const response = await authedFetch(getFullUrl(API_ENDPOINTS.DELETE_ORDER(orderId)), {
              method: "DELETE",
            });
            if (!response.ok) {
              throw new Error("Silme işlemi başarısız");
            }

            fetchOrders();
            Alert.alert("Başarılı", "Sipariş silindi.");
          } catch (error) {
            console.error("Sipariş silinirken hata:", error);
            alert("Sipariş silinemedi. Lütfen tekrar deneyin.");
          }
        },
      },
    ]);
  };

  // Siparişe tıklandığında detay modalını aç
  const openOrderDetail = (order: Order) => {
    setSelectedOrder(order);
    setOrderDetailModalVisible(true);
  };

  // Uzun basıldığında düzenleme seçeneklerini göster
  const handleLongPress = (order: Order) => {
    const isWaitingOrder = order.status.toLowerCase() === 'bekleniyor';
    
    // Kuryede olan siparişler için sadece silme seçeneği
    if (!isWaitingOrder) {
      Alert.alert("Sipariş İşlemleri", "Ne yapmak istersiniz?", [
        {
          text: "Sil",
          style: "destructive",
          onPress: () => deleteOrder(order.id),
        },
        { text: "İptal", style: "cancel" },
      ]);
      return;
    }
    
    // Bekleniyor durumundaki siparişler için hem silme hem düzenleme seçeneği
    Alert.alert("Sipariş İşlemleri", "Ne yapmak istersiniz?", [
      {
        text: "Sil",
        style: "destructive",
        onPress: () => deleteOrder(order.id),
      },
      {
        text: "Düzenle",
        onPress: () => {
          setEditingOrder(order);
          const selected = neighborhoods.find((n) => n.name === order.mahalle);
          if (selected) {
            setSelectedNeighborhood(selected);
          } else {
            // Eğer mahalle bulunamazsa, mahalleleri tekrar yükle
            fetchRestaurantNeighborhoods().then(() => {
              const retrySelected = neighborhoods.find((n) => n.name === order.mahalle);
              if (retrySelected) {
                setSelectedNeighborhood(retrySelected);
              } else {
                Alert.alert("Uyarı", "Bu siparişin mahallesi artık mevcut değil. Lütfen yeni bir mahalle seçin.");
                setSelectedNeighborhood(null);
              }
            });
          }
          
          // Ödeme yöntemi tespiti
          const paymentMethodText = order.odeme_yontemi.toLowerCase();
          if (paymentMethodText.includes("nakit")) {
            setSelectedPaymentMethod("nakit");
            setEnteredCash(safeParseFloat(order.nakit_tutari).toString());
            setEnteredBank("");
            setEnteredGift("");
          } else if (paymentMethodText.includes("kredi") || paymentMethodText.includes("kart")) {
            setSelectedPaymentMethod("kredi_karti");
            setEnteredBank(safeParseFloat(order.banka_tutari).toString());
            setEnteredCash("");
            setEnteredGift("");
          } else if (paymentMethodText.includes("hediye")) {
            setSelectedPaymentMethod("hediye");
            setEnteredGift(safeParseFloat(order.hediye_tutari).toString());
            setEnteredCash("");
            setEnteredBank("");
          } else if (paymentMethodText.includes("online")) {
            setSelectedPaymentMethod("online");
            setEnteredBank(safeParseFloat(order.banka_tutari).toString());
            setEnteredCash("");
            setEnteredGift("");
          } else {
            setSelectedPaymentMethod(null);
            setEnteredCash("");
            setEnteredBank("");
            setEnteredGift("");
          }
          
          if (order.resim) {
            setImage({ uri: order.resim });
          } else {
            setImage(null);
          }
          
          // Hazırlık süresini set et
          setSelectedPreparationTime(order.preparation_time || 0);
          
          setModalVisible(true);
        },
      },
      { text: "İptal", style: "cancel" },
    ]);
  };

  // Tam ekran resim modalını açan fonksiyon; detay modalı kapansın
  const openFullScreenImage = (uri: string) => {
    console.log("Image pressed, URI:", uri);
    setOrderDetailModalVisible(false);
    setFullScreenImageUri(uri);
    setFullScreenModalVisible(true);
  };

  if (!isLoaded || !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  // Siparişleri durumlarına göre filtrele
  const waitingOrders = orders.filter(order => order.status.toLowerCase() === 'bekleniyor');
  const inDeliveryOrders = orders.filter(order => order.status.toLowerCase() === 'kuryede');
  
  // Aktif sekmeye göre gösterilecek siparişleri belirle
  const getOrdersForActiveTab = () => {
    switch (activeTab) {
      case 'waiting':
        return waitingOrders;
      case 'indelivery':
        return inDeliveryOrders;
      case 'pending':
        return pendingApprovalOrders;
      default:
        return waitingOrders;
    }
  };

  const currentOrders = getOrdersForActiveTab();

  // İlgili orderların sayısını hesaplama fonksiyonları
  const getWaitingOrdersCount = (): number => {
    return orders.filter(order => order.status.toLowerCase() === 'bekleniyor').length;
  };

  const getInDeliveryOrdersCount = (): number => {
    return orders.filter(order => order.status.toLowerCase() === 'kuryede').length;
  };

  const getPendingApprovalOrdersCount = (): number => {
    return pendingApprovalOrders.length;
  };

  return (
    <View style={styles.mainContainer}>
              <StatusBar backgroundColor="#8B5CF6" barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View>
              {user?.name && (
                <Text style={styles.restaurantName}>{user.name}</Text>
              )}
            </View>
            <View style={styles.headerActions}>
              <NotificationButton 
                userType="restaurant" 
                userId={user?.id?.toString() || ''} 
              />
              <TouchableOpacity
                style={styles.newOrderButton}
                onPress={() => {
                  setEditingOrder(null);
                  openOrderModal();
                }}
              >
                <Text style={styles.newOrderButtonText}>+ Yeni Sipariş</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Tab Buttons - 3 sekme: Bekleniyor, Kuryede, Onay Bekleyen */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton, 
            activeTab === 'waiting' ? { backgroundColor: '#3B82F6' } : null
          ]}
          onPress={() => setActiveTab('waiting')}
        >
          <Text style={[
            styles.tabButtonText, 
            activeTab === 'waiting' ? { color: '#FFFFFF', fontWeight: 'bold' } : null
          ]}>
            Bekleyen
          </Text>
          {activeTab !== 'waiting' && <TabBadge count={getWaitingOrdersCount()} color="#3B82F6" />}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.tabButton, 
            activeTab === 'indelivery' ? { backgroundColor: '#10B981' } : null
          ]}
          onPress={() => setActiveTab('indelivery')}
        >
          <Text style={[
            styles.tabButtonText, 
            activeTab === 'indelivery' ? { color: '#FFFFFF', fontWeight: 'bold' } : null
          ]}>
            Kuryede
          </Text>
          {activeTab !== 'indelivery' && <TabBadge count={getInDeliveryOrdersCount()} color="#10B981" />}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.tabButton, 
            activeTab === 'pending' ? { backgroundColor: '#F59E0B' } : null
          ]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[
            styles.tabButtonText, 
            activeTab === 'pending' ? { color: '#FFFFFF', fontWeight: 'bold' } : null
          ]}>
            Onay Bekleyen
          </Text>
          {activeTab !== 'pending' && <TabBadge count={getPendingApprovalOrdersCount()} color="#F59E0B" />}
        </TouchableOpacity>
      </View>

      {/* Content based on active tab */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : currentOrders.length > 0 ? (
          currentOrders.map((order, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => {
                if (activeTab === 'pending') {
                  // Onay bekleyen siparişler için onay modalı
                  Alert.alert(
                    "Sipariş Onayı",
                    `Sipariş #${order.id} onaylansın mı?\n\nToplam: ${calculateTotalAmount(order).toFixed(2)} ₺\nMahalle: ${order.mahalle}\n\nBu işlem geri alınamaz!`,
                    [
                      { text: "Hayır", style: "cancel" },
                      { 
                        text: "Evet, Onayla", 
                        style: "default",
                        onPress: () => {
                          Alert.alert(
                            "Son Onay",
                            "Bu siparişi onayladığınızda kurye ödemesini alacak ve sipariş tamamlanacak. Emin misiniz?",
                            [
                              { text: "Hayır", style: "cancel" },
                              { 
                                text: "Evet, Eminim", 
                                style: "destructive",
                                onPress: () => approveOrder(order.id)
                              }
                            ]
                          );
                        }
                      }
                    ]
                  );
                } else {
                  // Diğer sekmeler için detay modalı
                  openOrderDetail(order);
                }
              }}
              onLongPress={() => {
                if (activeTab !== 'pending') {
                  handleLongPress(order);
                }
              }}
              style={styles.orderCardWrapper}
            >
              <LinearGradient
                colors={
                  activeTab === 'pending'
                    ? ["#F59E0B", "#D97706"]
                    : order.status.toLowerCase() === "kuryede"
                    ? ["#059669", "#10B981"]
                    : ["#4F46E5", "#6366F1"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.orderCard}
              >
                <View style={styles.orderCardContent}>
                  {/* Başlık ve Durum */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardIconBox}>
                        <Icon 
                          name={
                            activeTab === 'pending' ? "schedule" :
                            activeTab === 'indelivery' ? "delivery-dining" :
                            "local-shipping"
                          } 
                          size={18} 
                          color="#FFFFFF" 
                        />
                      </View>
                      <View>
                        <Text style={styles.orderLabel}>Sipariş No</Text>
                        <Text style={styles.orderNumber}>
                          #{order.id}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>
                        {activeTab === 'pending' ? "⏳ Onay Bekliyor" :
                         activeTab === 'indelivery' ? "🛵 Kuryede" :
                         "⌛ Bekleniyor"}
                      </Text>
                    </View>
                  </View>

                  {/* Toplam Tutar Bilgisi */}
                  <View style={styles.firmInfoContainer}>
                    <View style={styles.firmInfoRow}>
                      <View style={styles.firmIconBox}>
                        <Icon name="account-balance-wallet" size={16} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.firmLabel}>
                          {activeTab === 'pending' ? "Toplam Tutar" : "Tahsil Edilecek Toplam Tutar"}
                        </Text>
                        <Text style={styles.firmName}>
                          {calculateTotalAmount(order).toFixed(2)} ₺
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Alt Bilgiler */}
                  <View style={styles.infoGrid}>
                    {/* Mahalle */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridItemContent}>
                        <View style={styles.gridIconBox}>
                          <Icon name="place" size={16} color="#FFFFFF" />
                        </View>
                        <Text style={styles.gridLabel}>Mahalle</Text>
                        <Text style={styles.gridValue} numberOfLines={1}>
                          {order.mahalle}
                        </Text>
                      </View>
                    </View>

                    {/* Kurye Ücreti */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridItemContent}>
                        <View style={styles.gridIconBox}>
                          <Icon name="delivery-dining" size={16} color="#FFFFFF" />
                        </View>
                        <Text style={styles.gridLabel}>Kurye</Text>
                        <Text style={styles.gridValuePrice}>
                          {order.restaurant_price || '0.00'} ₺
                        </Text>
                      </View>
                    </View>

                    {/* Ödeme */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridItemContent}>
                        <View style={styles.gridIconBox}>
                          <Icon name="payment" size={16} color="#FFFFFF" />
                        </View>
                        <Text style={styles.gridLabel}>Ödeme</Text>
                        <Text style={styles.gridValue} numberOfLines={1}>
                          {order.odeme_yontemi}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Teslimat Countdown - sadece bekleniyor ve kuryede sekmelerinde */}
                  {(activeTab === 'waiting' || activeTab === 'indelivery') && (
                    <RestaurantCountdown order={order} />
                  )}

                  {/* Aksiyon Butonu */}
                  <TouchableOpacity 
                    style={[
                      styles.detailButton,
                      activeTab === 'pending' && { backgroundColor: '#059669' }
                    ]}
                    onPress={() => {
                      if (activeTab === 'pending') {
                        Alert.alert(
                          "Sipariş Onayı",
                          `Sipariş #${order.id} onaylansın mı?\n\nToplam: ${calculateTotalAmount(order).toFixed(2)} ₺\nMahalle: ${order.mahalle}\n\nBu işlem geri alınamaz!`,
                          [
                            { text: "Hayır", style: "cancel" },
                            { 
                              text: "Evet, Onayla", 
                              style: "default",
                              onPress: () => approveOrder(order.id)
                            }
                          ]
                        );
                      } else {
                        openOrderDetail(order);
                      }
                    }}
                  >
                    <Text style={styles.detailButtonText}>
                      {activeTab === 'pending' ? 'Siparişi Onayla' : 'Detayları Gör'}
                    </Text>
                    <Icon 
                      name={activeTab === 'pending' ? "check-circle" : "arrow-forward"} 
                      size={16} 
                      color="#FFFFFF" 
                    />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconContainer}>
              <View style={styles.emptyIconBox}>
                <Icon 
                  name={
                    activeTab === 'pending' ? "hourglass-empty" :
                    activeTab === 'indelivery' ? "delivery-dining" :
                    "inbox"
                  } 
                  size={32} 
                  color="#9CA3AF" 
                />
              </View>
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'pending' ? "Onay Bekleyen Sipariş Yok" :
               activeTab === 'indelivery' ? "Kuryede Sipariş Yok" :
               "Bekleyen Sipariş Yok"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'pending' ? 
                "Nakit veya kredi kartı ile ödenen siparişler teslim edildiğinde burada görünecek." :
               activeTab === 'indelivery' ?
                "Kurye tarafından kabul edilen siparişler burada görünecek." :
                "Yeni sipariş eklemek için yukarıdaki butonu kullanabilirsiniz."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sipariş Ekleme/Düzenleme Modalı */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setModalVisible(false);
          setEditingOrder(null);
          setSelectedNeighborhood(null);
          setSelectedPaymentMethod(null);
          setNeighborhoodModalVisible(false);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setModalVisible(false);
          setEditingOrder(null);
          setSelectedNeighborhood(null);
          setSelectedPaymentMethod(null);
          setNeighborhoodModalVisible(false);
        }}>
          <View style={styles.modalContainer}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.modalContent}
              >
                  <ScrollView
                    ref={modalScrollRef}
                    style={styles.modalScrollView}
                    contentContainerStyle={styles.modalInnerContent}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled={true}
                    bounces={true}
                    alwaysBounceVertical={false}
                    scrollEventThrottle={16}
                    nestedScrollEnabled={false}
                    onScrollBeginDrag={() => Keyboard.dismiss()}
                    contentInset={{top: 0, bottom: 20, left: 0, right: 0}}
                    scrollIndicatorInsets={{top: 0, bottom: 20, left: 0, right: 0}}
                    automaticallyAdjustContentInsets={false}
                    directionalLockEnabled={true}
                  >
                    {/* Modal Başlık */}
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>
                        {editingOrder ? "Siparişi Düzenle" : "Yeni Sipariş"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setModalVisible(false);
                          setEditingOrder(null);
                          setSelectedNeighborhood(null);
                          setSelectedPaymentMethod(null);
                          setNeighborhoodModalVisible(false);
                        }}
                        style={styles.modalCloseButton}
                      >
                        <Icon name="close" size={24} color="#374151" />
                      </TouchableOpacity>
                    </View>

                    {/* Resim Seçimi */}
                    <View style={styles.imageSection}>
                      <View style={styles.imageButtonsContainer}>
                        <TouchableOpacity
                          onPress={takePhoto}
                          style={[styles.imagePickerButton, styles.cameraButton]}
                        >
                          <Icon name="photo-camera" size={28} color="#FFFFFF" />
                          <Text style={styles.cameraButtonText}>
                            Fotoğraf Çek
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          onPress={pickImage}
                          style={[styles.imagePickerButton, styles.galleryButton]}
                        >
                          <Icon name="photo-library" size={28} color="#6366F1" />
                          <Text style={styles.galleryButtonText}>
                            Galeriden Seç
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {image && (
                        <Image
                          source={{ uri: image.uri }}
                          style={styles.selectedImage}
                          resizeMode="cover"
                        />
                      )}
                    </View>

                {/* Mahalle Seçimi */}
                <View style={styles.neighborhoodSection}>
                  <Text style={styles.sectionTitle}>
                    Mahalle Seçimi
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setNeighborhoodModalVisible(!neighborhoodModalVisible);
                      if (neighborhoods.length === 0) {
                        fetchRestaurantNeighborhoods();
                      }
                    }}
                    style={styles.neighborhoodSelectButton}
                  >
                    <View style={styles.neighborhoodButtonContent}>
                      <View style={styles.neighborhoodButtonLeft}>
                        <Icon name="location-on" size={24} color="#6366F1" />
                        <View style={{width: 200, minHeight: 40}}>
                          <Text style={[styles.neighborhoodButtonText, {color: '#000000'}]}>
                            {selectedNeighborhood ? selectedNeighborhood.fullName : "Mahalle Seçin"}
                          </Text>
                          {selectedNeighborhood && (
                            <Text style={styles.neighborhoodPriceText}>
                              Restoran Ücreti: {selectedNeighborhood.restaurantPrice} ₺
                            </Text>
                          )}
                        </View>
                      </View>
                      <Icon name={neighborhoodModalVisible ? "expand-less" : "expand-more"} size={24} color="#6366F1" />
                    </View>
                  </TouchableOpacity>
                  
                  {/* Mahalle Listesi - Modal yerine direkt gösteriliyor */}
                  {neighborhoodModalVisible && (
                    <View style={styles.neighborhoodDropdown}>
                      {neighborhoodsLoading ? (
                        <View style={styles.neighborhoodLoadingContainer}>
                          <ActivityIndicator size="small" color="#6366F1" />
                          <Text style={styles.neighborhoodLoadingText}>Mahalleler yükleniyor...</Text>
                        </View>
                      ) : neighborhoods.length === 0 ? (
                        <View style={styles.neighborhoodEmptyContainer}>
                          <Icon name="location-off" size={32} color="#9CA3AF" />
                          <Text style={styles.neighborhoodEmptyTitle}>Mahalle Bulunamadı</Text>
                          <Text style={styles.neighborhoodEmptyText}>
                            Bu restoran için henüz mahalle tanımlanmamış.
                          </Text>
                          <TouchableOpacity
                            onPress={fetchRestaurantNeighborhoods}
                            style={styles.neighborhoodRetryButton}
                          >
                            <Icon name="refresh" size={16} color="#6366F1" />
                            <Text style={styles.neighborhoodRetryText}>Tekrar Dene</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <ScrollView 
                          style={styles.neighborhoodScrollView}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled={true}
                          scrollEnabled={true}
                          bounces={false}
                          keyboardShouldPersistTaps="handled"
                        >
                          {neighborhoods.map((item) => (
                            <TouchableOpacity
                              key={item.id}
                              onPress={() => {
                                setSelectedNeighborhood(item);
                                setNeighborhoodModalVisible(false);
                              }}
                              style={[
                                styles.neighborhoodItem,
                                selectedNeighborhood?.id === item.id && styles.selectedNeighborhoodItem
                              ]}
                            >
                              <View style={styles.neighborhoodItemContent}>
                                <View style={styles.neighborhoodItemLeft}>
                                  <View style={[
                                    styles.neighborhoodItemIcon,
                                    selectedNeighborhood?.id === item.id && styles.selectedNeighborhoodItemIcon
                                  ]}>
                                    <Icon 
                                      name="location-on" 
                                      size={16} 
                                      color={selectedNeighborhood?.id === item.id ? "#FFFFFF" : "#6366F1"} 
                                    />
                                  </View>
                                  <View style={styles.neighborhoodItemTextContainer}>
                                    <Text style={[
                                      styles.neighborhoodItemName,
                                      selectedNeighborhood?.id === item.id && styles.selectedNeighborhoodItemName
                                    ]}>
                                      {item.fullName}
                                    </Text>
                                    <Text style={[
                                      styles.neighborhoodItemDetails,
                                      selectedNeighborhood?.id === item.id && styles.selectedNeighborhoodItemDetails
                                    ]}>
                                      {item.estimatedTime} dk
                                    </Text>
                                  </View>
                                </View>
                                <Text style={[
                                  styles.neighborhoodItemPrice,
                                  selectedNeighborhood?.id === item.id && styles.selectedNeighborhoodItemPrice
                                ]}>
                                  {item.restaurantPrice} ₺
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}
                </View>

                {/* Ödeme Yöntemi */}
                <View style={styles.paymentSection}>
                  <Text style={styles.sectionTitle}>
                    Ödeme Yöntemi
                  </Text>
                  <View style={styles.paymentOptionsContainer}>
                    {["nakit", "kredi_karti", "hediye", "online"].map((method) => (
                      <TouchableOpacity
                        key={method}
                        onPress={() => setSelectedPaymentMethod(method as PaymentMethod)}
                        style={[
                          styles.paymentOption,
                          selectedPaymentMethod === method && styles.selectedPaymentOption
                        ]}
                      >
                        <Text
                          style={[
                            styles.paymentOptionText,
                            selectedPaymentMethod === method && styles.selectedPaymentOptionText
                          ]}
                        >
                          {method === "nakit" ? "Nakit" : 
                           method === "kredi_karti" ? "Kredi Kartı" : 
                           method === "hediye" ? "Hediye Çeki" : 
                           method === "online" ? "Online" : method.charAt(0).toUpperCase() + method.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Tutar Girişi */}
                {selectedPaymentMethod && (
                  <View style={styles.amountSection}>
                    <TextInput
                      style={styles.amountInput}
                      placeholder={`${
                        selectedPaymentMethod.charAt(0).toUpperCase() +
                        selectedPaymentMethod.slice(1)
                      } Tutarı`}
                      value={(() => {
                        if (selectedPaymentMethod === "nakit") return enteredCash;
                        if (selectedPaymentMethod === "kredi_karti") return enteredBank;
                        if (selectedPaymentMethod === "hediye") return enteredGift;
                        if (selectedPaymentMethod === "online") return enteredBank; // Online için de banka tutarını kullan
                        return "";
                      })()}
                      onChangeText={((text) => {
                        if (selectedPaymentMethod === "nakit") setEnteredCash(text);
                        else if (selectedPaymentMethod === "kredi_karti") setEnteredBank(text);
                        else if (selectedPaymentMethod === "hediye") setEnteredGift(text);
                        else if (selectedPaymentMethod === "online") setEnteredBank(text); // Online için de banka tutarını güncelle
                      })}
                      keyboardType="numeric"
                    />
                  </View>
                )}

                {/* Hazırlık Süresi Seçimi */}
                <View style={styles.preparationSection}>
                  <Text style={styles.sectionTitle}>
                    Hazırlık Süresi
                  </Text>
                  <View style={styles.preparationOptionsContainer}>
                    {PREPARATION_TIME_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => setSelectedPreparationTime(option.value)}
                        style={[
                          styles.preparationOption,
                          selectedPreparationTime === option.value && styles.selectedPreparationOption
                        ]}
                      >
                        <Icon 
                          name="schedule" 
                          size={16} 
                          color={selectedPreparationTime === option.value ? "#FFFFFF" : "#6366F1"} 
                        />
                        <Text
                          style={[
                            styles.preparationOptionText,
                            selectedPreparationTime === option.value && styles.selectedPreparationOptionText
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Özet */}
                <View style={styles.summarySection}>
                  <Text style={styles.summaryText}>
                    Kurye Tutarı: {selectedNeighborhood ? selectedNeighborhood.restaurantPrice : 0} ₺
                  </Text>
                  <Text style={styles.summaryText}>
                    Ödeme: {getPaymentMethodSummary()}
                  </Text>
                  <Text style={styles.summaryText}>
                    Toplam Tutar: {getTotalAmount().toFixed(2)} ₺
                  </Text>
                  <Text style={styles.summaryText}>
                    Hazırlık Süresi: {selectedPreparationTime === 0 ? 'Hazır' : `${selectedPreparationTime} dakika`}
                  </Text>
                </View>

                {/* Kaydet Butonu */}
                <TouchableOpacity
                  onPress={saveOrder}
                  style={[
                    styles.saveButton, 
                    (isSavingOrder || isUploadingImage) && styles.saveButtonDisabled
                  ]}
                  disabled={isSavingOrder || isUploadingImage}
                >
                  {(isSavingOrder || isUploadingImage) ? (
                    <View style={styles.saveButtonLoading}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.saveButtonText}>
                        {isUploadingImage ? "Resim yükleniyor..." : "Kaydediliyor..."}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {editingOrder ? "Güncelle" : "Siparişi Kaydet"}
                    </Text>
                  )}
                </TouchableOpacity>
                  </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Sipariş Detay Modalı */}
      <Modal
        visible={orderDetailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setOrderDetailModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOrderDetailModalVisible(false)}>
          <View style={styles.detailModalOverlay}>
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
              <View style={styles.detailModalContent}>
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.detailModalPadding}
                >
                  {selectedOrder && (
                    <>
                      {/* Modal Başlık */}
                      <View style={styles.detailModalHeader}>
                        <View>
                          <Text style={styles.detailModalTitle}>
                            Sipariş #{selectedOrder.id}
                          </Text>
                          <Text style={styles.detailModalSubtitle}>Detaylı Bilgiler</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setOrderDetailModalVisible(false)}
                          style={styles.detailModalCloseButton}
                        >
                          <Icon name="close" size={24} color="#374151" />
                        </TouchableOpacity>
                      </View>

                    {/* Durum Rozeti */}
                    <View style={styles.statusContainer}>
                      <View style={styles.statusRow}>
                        <View style={styles.statusLeft}>
                          <View style={styles.statusIconBox}>
                            <Icon name="local-shipping" size={24} color="#4F46E5" />
                          </View>
                          <View>
                            <Text style={styles.statusLabel}>Durum</Text>
                            <Text style={styles.statusValue}>
                              {selectedOrder.status}
                            </Text>
                            {/* Kurye bilgisi - sadece kuryede veya onay bekliyor durumlarında göster */}
                            {(selectedOrder.status.toLowerCase() === "kuryede" || 
                              selectedOrder.status.toLowerCase() === "onay bekliyor") && 
                             selectedOrder.courier_name && (
                              <Text style={styles.courierInfo}>
                                👤 {selectedOrder.courier_name} {selectedOrder.courier_surname || ''}
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={styles.statusDate}>
                          {new Date(selectedOrder.created_at).toLocaleString("tr-TR")}
                        </Text>
                      </View>
                    </View>

                    {/* Resim Bölümü */}
                    {selectedOrder.resim && (
                      <View style={styles.detailImageSection}>
                        <Text style={styles.detailImageTitle}>
                          Sipariş Görseli
                        </Text>
                        <View style={styles.detailImageContainer}>
                          <Image
                            source={{ uri: fixImageUrl(selectedOrder.resim) || selectedOrder.resim }}
                            style={styles.detailImage}
                            resizeMode="cover"
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => openFullScreenImage(fixImageUrl(selectedOrder.resim) || selectedOrder.resim)}
                          style={styles.detailImageZoomButton}
                        >
                          <Icon name="zoom-in" size={20} color="#6366F1" />
                          <Text style={styles.detailImageZoomText}>Büyüt</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Bilgi Kartları */}
                    <View style={styles.detailCardsContainer}>
                      {/* Toplam Tutar Kartı */}
                      <View style={styles.detailCard}>
                        <View style={styles.detailCardRow}>
                          <View style={[styles.detailCardIconBox, { backgroundColor: '#EEF2FF' }]}>
                            <Icon name="account-balance-wallet" size={24} color="#4F46E5" />
                          </View>
                          <View>
                            <Text style={styles.detailCardLabel}>Toplam Tutar</Text>
                            <Text style={[styles.detailCardValue, styles.detailCardPriceValue]}>
                              {calculateTotalAmount(selectedOrder).toFixed(2)} ₺
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Ücret Kartı */}
                      <View style={styles.detailCard}>
                        <View style={styles.detailCardRow}>
                          <View style={[styles.detailCardIconBox, { backgroundColor: '#ECFDF5' }]}>
                            <Icon name="attach-money" size={24} color="#10B981" />
                          </View>
                          <View>
                            <Text style={styles.detailCardLabel}>Kurye Ücreti</Text>
                            <Text style={[styles.detailCardValue, styles.detailCardPriceValue]}>
                              {selectedOrder.restaurant_price || '0'} ₺
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Mahalle Kartı */}
                      <View style={styles.detailCard}>
                        <View style={styles.detailCardRow}>
                          <View style={[styles.detailCardIconBox, { backgroundColor: '#F0F9FF' }]}>
                            <Icon name="place" size={24} color="#3B82F6" />
                          </View>
                          <View>
                            <Text style={styles.detailCardLabel}>Teslimat Bölgesi</Text>
                            <Text style={styles.detailCardValue}>
                              {selectedOrder.mahalle}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Ödeme Kartı */}
                      <View style={styles.detailCard}>
                        <View style={styles.detailCardRow}>
                          <View style={[styles.detailCardIconBox, { backgroundColor: '#F5F3FF' }]}>
                            <Icon name="payment" size={24} color="#8B5CF6" />
                          </View>
                          <View>
                            <Text style={styles.detailCardLabel}>Ödeme Yöntemi</Text>
                            <Text style={styles.detailCardValue}>
                              {selectedOrder.odeme_yontemi}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Aksiyon Butonları */}
                    <View style={styles.actionButtonsContainer}>
                      {/* Düzenle butonu sadece bekleniyor durumundaki siparişler için göster */}
                      {selectedOrder.status.toLowerCase() === 'bekleniyor' && (
                        <TouchableOpacity
                          onPress={() => {
                            setEditingOrder(selectedOrder);
                            const selected = neighborhoods.find(
                              (n) => n.name === selectedOrder.mahalle
                            );
                            if (selected) {
                              setSelectedNeighborhood(selected);
                            } else {
                              // Eğer mahalle bulunamazsa, mahalleleri tekrar yükle
                              fetchRestaurantNeighborhoods().then(() => {
                                const retrySelected = neighborhoods.find((n) => n.name === selectedOrder.mahalle);
                                if (retrySelected) {
                                  setSelectedNeighborhood(retrySelected);
                                } else {
                                  Alert.alert("Uyarı", "Bu siparişin mahallesi artık mevcut değil. Lütfen yeni bir mahalle seçin.");
                                  setSelectedNeighborhood(null);
                                }
                              });
                            }
                            
                            // Ödeme yöntemi tespiti
                            const paymentMethodText = selectedOrder.odeme_yontemi.toLowerCase();
                            if (paymentMethodText.includes("nakit")) {
                              setSelectedPaymentMethod("nakit");
                              setEnteredCash(safeParseFloat(selectedOrder.nakit_tutari).toString());
                              setEnteredBank("");
                              setEnteredGift("");
                            } else if (paymentMethodText.includes("kredi") || paymentMethodText.includes("kart")) {
                              setSelectedPaymentMethod("kredi_karti");
                              setEnteredBank(safeParseFloat(selectedOrder.banka_tutari).toString());
                              setEnteredCash("");
                              setEnteredGift("");
                            } else if (paymentMethodText.includes("hediye")) {
                              setSelectedPaymentMethod("hediye");
                              setEnteredGift(safeParseFloat(selectedOrder.hediye_tutari).toString());
                              setEnteredCash("");
                              setEnteredBank("");
                            } else if (paymentMethodText.includes("online")) {
                              setSelectedPaymentMethod("online");
                              setEnteredBank(safeParseFloat(selectedOrder.banka_tutari).toString());
                              setEnteredCash("");
                              setEnteredGift("");
                            } else {
                              setSelectedPaymentMethod(null);
                              setEnteredCash("");
                              setEnteredBank("");
                              setEnteredGift("");
                            }
                            
                            if (selectedOrder.resim) {
                              setImage({ uri: fixImageUrl(selectedOrder.resim) || selectedOrder.resim });
                            } else {
                              setImage(null);
                            }
                            setOrderDetailModalVisible(false);
                            setModalVisible(true);
                          }}
                          style={styles.editButton}
                        >
                          <Icon name="edit" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.editButtonText}>
                            Düzenle
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert("Onay", "Sipariş silinsin mi?", [
                            { text: "İptal", style: "cancel" },
                            {
                              text: "Sil",
                              style: "destructive",
                              onPress: () => {
                                deleteOrder(selectedOrder.id);
                                setOrderDetailModalVisible(false);
                              },
                            },
                          ]);
                        }}
                        style={styles.deleteButton}
                      >
                        <Icon name="delete" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.deleteButtonText}>
                          Sil
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
              source={{ uri: fixImageUrl(fullScreenImageUri) || fullScreenImageUri }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // Base container styles
  mainContainer: { 
    flex: 1, 
    backgroundColor: "#F9FAFB" 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    backgroundColor: "#FFFFFF"
  },
  loadingText: { 
    fontSize: 16, 
    fontWeight: "600", 
    color: "#6366F1",
    marginTop: 12
  },
  
  // Header styles
  safeArea: { 
    backgroundColor: "#8B5CF6" 
  },
  headerContainer: { 
    paddingHorizontal: 16, 
    paddingBottom: 16 
  },
  headerContent: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center" 
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center"
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2
  },
  pageTitle: { 
    fontSize: 24, 
    fontWeight: "700", 
    color: "#FFFFFF" 
  },
  newOrderButton: { 
    backgroundColor: "#4F46E5", 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 12 
  },
  newOrderButtonText: { 
    fontSize: 14, 
    fontWeight: "600", 
    color: "#FFFFFF" 
  },
  
  // Scroll view styles
  scrollView: { 
    flex: 1 
  },
  scrollContent: { 
    padding: 16, 
    paddingBottom: 128 
  },
  
  // Error styles
  errorContainer: { 
    padding: 16, 
    backgroundColor: "#FEF2F2", 
    borderRadius: 12, 
    marginBottom: 16 
  },
  errorText: { 
    color: "#EF4444", 
    textAlign: "center", 
    fontSize: 16, 
    fontWeight: "500" 
  },
  
  // Order card styles
  orderCardWrapper: { 
    marginBottom: 8 
  },
  orderCard: { 
    borderRadius: 12, 
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4
  },
  orderCardContent: { 
    padding: 12 
  },
  cardHeaderRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center",
    marginBottom: 8
  },
  cardHeaderLeft: { 
    flexDirection: "row", 
    alignItems: "center",
    gap: 8
  },
  cardIconBox: { 
    backgroundColor: "rgba(255, 255, 255, 0.2)", 
    padding: 6, 
    borderRadius: 6 
  },
  orderLabel: { 
    fontSize: 11, 
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 2
  },
  orderNumber: { 
    fontSize: 14, 
    fontWeight: "700", 
    color: "#FFFFFF" 
  },
  statusBadge: { 
    backgroundColor: "rgba(255, 255, 255, 0.2)", 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 16 
  },
  statusText: { 
    fontSize: 12, 
    fontWeight: "600", 
    color: "#FFFFFF" 
  },
  
  // Firm info styles
  firmInfoContainer: { 
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8
  },
  firmInfoRow: { 
    flexDirection: "row", 
    alignItems: "center",
    gap: 8
  },
  firmIconBox: { 
    backgroundColor: "rgba(255, 255, 255, 0.2)", 
    padding: 6, 
    borderRadius: 6 
  },
  firmLabel: { 
    fontSize: 11, 
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 2
  },
  firmName: { 
    fontSize: 13, 
    fontWeight: "600", 
    color: "#FFFFFF" 
  },
  
  // Info grid styles
  infoGrid: { 
    flexDirection: "row", 
    justifyContent: "space-between",
    gap: 6
  },
  gridItem: { 
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 8,
    borderRadius: 8
  },
  gridItemContent: { 
    alignItems: "center" 
  },
  gridIconBox: { 
    backgroundColor: "rgba(255, 255, 255, 0.2)", 
    padding: 4, 
    borderRadius: 4,
    marginBottom: 4
  },
  gridLabel: { 
    fontSize: 10, 
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 2,
    textAlign: "center"
  },
  gridValue: { 
    fontSize: 11, 
    fontWeight: "600", 
    color: "#FFFFFF",
    textAlign: "center"
  },
  gridValuePrice: { 
    fontSize: 12, 
    fontWeight: "700", 
    color: "#FFFFFF",
    textAlign: "center"
  },
  
  // Detail button styles
  detailButton: { 
    backgroundColor: "rgba(255, 255, 255, 0.1)", 
    marginTop: 8, 
    padding: 8, 
    borderRadius: 8, 
    flexDirection: "row", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  detailButtonText: { 
    fontSize: 12, 
    fontWeight: "500", 
    color: "#FFFFFF", 
    marginRight: 6 
  },
  
  // Empty state styles
  emptyStateContainer: { 
    alignItems: "center", 
    justifyContent: "center", 
    paddingVertical: 64 
  },
  emptyIconContainer: { 
    backgroundColor: "#F3F4F6", 
    padding: 20, 
    borderRadius: 24, 
    marginBottom: 20 
  },
  emptyIconBox: { 
    backgroundColor: "#E5E7EB", 
    padding: 16, 
    borderRadius: 16 
  },
  emptyTitle: { 
    fontSize: 20, 
    fontWeight: "600", 
    color: "#374151", 
    marginBottom: 8 
  },
  emptySubtitle: { 
    fontSize: 16, 
    color: "#6B7280",
    textAlign: "center"
  },
  
  // Modal styles
  modalContainer: { 
    flex: 1, 
    justifyContent: "flex-end", 
    backgroundColor: "rgba(0,0,0,0.5)" 
  },
  modalContentWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    minHeight: '70%',
  },
  modalScrollView: {
    flex: 1,
  },
  modalInnerContent: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
    minHeight: '100%',
    justifyContent: 'flex-start',
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  modalCloseButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  
  // Image section styles
  imageSection: {
    marginBottom: 24,
  },
  imagePickerButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#6366F1",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#EEF2FF",
  },
  imagePickerText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#6366F1",
  },
  selectedImage: {
    width: "100%",
    height: 192,
    borderRadius: 12,
    marginTop: 16,
  },
  
  // Section styles
  neighborhoodSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  neighborhoodSelectButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF", // Beyaz background daha iyi kontrast için
  },
  neighborhoodButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  neighborhoodButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  neighborhoodButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827", // Koyu gri
  },
  neighborhoodPriceText: {
    fontSize: 12,
    color: "#6B7280", // Normal gri
  },
  
  // Payment styles
  paymentSection: {
    marginBottom: 24,
  },
  paymentOptionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  paymentOption: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  selectedPaymentOption: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  paymentOptionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  selectedPaymentOptionText: {
    color: "#6366F1",
  },
  
  // Preparation time styles
  preparationSection: {
    marginBottom: 24,
  },
  preparationOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  preparationOption: {
    flex: 1,
    minWidth: "30%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  selectedPreparationOption: {
    backgroundColor: "#6366F1",
    borderColor: "#4F46E5",
  },
  preparationOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  selectedPreparationOptionText: {
    color: "#FFFFFF",
  },
  
  // Amount styles
  amountSection: {
    marginBottom: 24,
  },
  amountInput: {
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    fontSize: 16,
  },
  
  // Summary styles
  summarySection: {
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  
  // Save button styles
  saveButton: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    backgroundColor: "#9CA3AF",
    opacity: 0.7,
  },
  saveButtonLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 18,
  },
  
  // Detail modal styles
  detailModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  detailModalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  detailModalPadding: {
    padding: 20,
  },

  detailModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  detailModalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  detailModalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  detailModalCloseButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  
  // Status styles
  statusContainer: {
    backgroundColor: "#EEF2FF",
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusIconBox: {
    backgroundColor: "#C7D2FE",
    padding: 8,
    borderRadius: 12,
  },
  statusLabel: {
    fontSize: 12,
    color: "#6366F1",
    marginBottom: 2,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4338CA",
  },
  statusDate: {
    fontSize: 12,
    color: "#6366F1",
  },
  courierInfo: {
    fontSize: 12,
    color: "#059669",
    marginTop: 4,
    fontWeight: "500",
  },
  
  // Detail image styles
  detailImageSection: {
    marginBottom: 24,
  },
  detailImageTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  detailImageContainer: {
    position: "relative",
  },
  detailImage: {
    width: "100%",
    height: 192,
    borderRadius: 16,
  },
  detailImageZoomButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  detailImageZoomText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },
  
  // Detail card styles
  detailCardsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  detailCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  detailCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  detailCardIconBox: {
    padding: 12,
    borderRadius: 12,
  },
  detailCardLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  detailCardValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  detailCardPriceValue: {
    color: "#059669",
  },
  
  // Action button styles
  actionButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  editButton: {
    flex: 1,
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#EF4444",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  
  // Full screen modal styles
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  
  // Legacy styles - keeping for compatibility
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  scrollContentOld: { padding: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, color: "#333" },
  card: {
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: "#fff", marginLeft: 10 },
  cardContent: { marginTop: 10 },
  cardRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  cardText: { fontSize: 14, color: "#fff", marginLeft: 10 },
  noOrdersText: { fontSize: 16, color: "#666", textAlign: "center", marginTop: 20 },
  buttonContainer: { padding: 20, paddingBottom: 130 },
  item: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginVertical: 5,
  },
  selectedItem: { backgroundColor: "#cce5ff" },
  paymentContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
    marginBottom: 20,
  },
  paymentOptionOld: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  selectedPaymentOptionOld: { backgroundColor: "#cce5ff" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginVertical: 10,
  },
  summaryContainer: {
    marginVertical: 10,
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
  },
  summaryTextOld: { fontSize: 16, fontWeight: "bold", textAlign: "center" },
  imagePreview: { width: 200, height: 200, marginVertical: 10, alignSelf: "center" },
  detailModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  detailModalContentOld: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
  },
  detailImageOld: { width: "100%", height: 200, marginBottom: 10 },
  detailLabel: { fontSize: 16, marginBottom: 5 },
  detailButtonContainer: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  neighborhoodModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
  },
  neighborhoodModalContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    maxHeight: "80%",
    marginHorizontal: 20,
  },
  neighborhoodModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  neighborhoodModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  neighborhoodModalCloseButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  neighborhoodLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginTop: 8,
  },
  neighborhoodLoadingText: {
    fontSize: 14,
    color: "#6B7280",
    marginLeft: 8,
  },
  neighborhoodEmptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  neighborhoodEmptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  neighborhoodEmptyText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  neighborhoodRetryButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#6366F1",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  neighborhoodRetryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366F1",
  },
  neighborhoodDropdown: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: "#FFFFFF",
  },
  neighborhoodScrollView: {
    maxHeight: 200,
  },
  neighborhoodItem: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginBottom: 12,
  },
  neighborhoodItemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  neighborhoodItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  neighborhoodItemTextContainer: {
    flexDirection: "column",
  },
  neighborhoodItemIcon: {
    backgroundColor: "#EEF2FF",
    padding: 8,
    borderRadius: 8,
  },
  neighborhoodItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  neighborhoodItemDetails: {
    fontSize: 12,
    color: "#6B7280",
  },
  neighborhoodItemPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
  },
  selectedNeighborhoodItem: {
    backgroundColor: "#EEF2FF",
  },
  selectedNeighborhoodItemIcon: {
    backgroundColor: "#C7D2FE",
  },
  selectedNeighborhoodItemName: {
    color: "#6366F1",
  },
  selectedNeighborhoodItemDetails: {
    color: "#6366F1",
  },
  selectedNeighborhoodItemPrice: {
    color: "#059669",
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  settlementCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  settlementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  settlementIconBox: {
    backgroundColor: "#C7D2FE",
    padding: 8,
    borderRadius: 12,
  },
  settlementTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  settlementGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  settlementItem: {
    flex: 1,
    alignItems: "center",
  },
  settlementLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  settlementValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  settlementNetBalance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  settlementNetLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  settlementNetValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  // Onay bekleyen siparişler style'ları
  pendingSection: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  pendingSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F59E0B",
    marginBottom: 12,
  },
  pendingScrollView: {
    paddingVertical: 4,
  },
  pendingOrderCard: {
    marginRight: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pendingOrderContent: {
    padding: 8,
    width: 120,
    minHeight: 100,
  },
  pendingOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pendingOrderIconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 3,
    borderRadius: 4,
    marginRight: 4,
  },
  pendingOrderId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pendingOrderAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  pendingOrderNeighborhood: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 2,
  },
  pendingOrderPayment: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  // Tab sistemi için stil'ler
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTabButton: {
    backgroundColor: 'transparent', // Change from whatever was set to transparent
    borderBottomWidth: 2,
    borderColor: '#FFFFFF'
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabButtonText: {
    color: '#374151',
  },
  singleTabButton: {
    // Tek tab olduğunda tam genişlik kullan
    flex: 1,
  },
  // Resim seçimi için yeni style'lar
  imageButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  cameraButton: {
    backgroundColor: '#6366F1',
    flex: 2,
  },
  galleryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#6366F1',
    borderWidth: 2,
    flex: 1,
  },
  cameraButtonText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  galleryButtonText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  // Add these new styles for the badges
  tabBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default RestaurantHome;
