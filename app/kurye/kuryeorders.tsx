/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  Platform,
  Modal,
  ScrollView,
  Alert,
  Linking,
  SafeAreaView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";

import io from "socket.io-client";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { API_CONFIG, getFullUrl, API_ENDPOINTS, authedFetch } from "../../constants/api";
import { calculateDeliveryCountdown as calculateDeliveryCountdownUtil } from "../../lib/timeUtils";
import AsyncStorage from '@react-native-async-storage/async-storage';


interface Order {
  firmaid: string;
  id: string;
  created_at: string;
  accepted_at?: string;
  title: string;
  kurye_tutari: number;
  status: string;
  mahalle: string;
  odeme_yontemi: string;
  firma_adi: string;
  resim?: string;
  courier_price: number;
  nakit_tutari: number;
  banka_tutari: number;
  delivery_time_minutes?: number;
  hediye_tutari: number;
}

interface CourierLocation {
  courierId: string;
  orderId: string;
  latitude: number;
  longitude: number;
}

interface AutoCourierTrackingProps {
  courierId: string;
  orders: Order[];
}

const AutoCourierTracking: React.FC<AutoCourierTrackingProps> = ({ courierId, orders }) => {
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!orders || orders.length === 0) return;

    socketRef.current = io(API_CONFIG.SOCKET_URL, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      console.log(`🔌 Socket bağlandı - Kurye: ${courierId}`);
      
      // Kurye odasına katıl
      socketRef.current.emit("joinCourierRoom", { courierId });
      
      // Her sipariş için oda katılımı
      orders.forEach(order => {
        if (!order || !order.id) {
          console.error("AutoCourierTracking: Invalid order object:", order);
          return;
        }
        socketRef.current.emit("joinOrder", { orderId: order.id });
        console.log(`📦 Sipariş odasına katıldı - OrderID: ${order.id}`);
      });
    });

    socketRef.current.on("connect_error", (err: any) => {
      console.error("AutoTracking socket error:", err);
    });

    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.error("Konum izni reddedildi.");
        return;
      }
      subscription = await Location.watchPositionAsync(
        { 
          accuracy: Location.Accuracy.Highest, 
          timeInterval: 3000, // 3 saniyede bir güncelle (canlı takip için)
          distanceInterval: 5 // 5 metre hareket ettiğinde güncelle
        },
        (loc) => {
          const timestamp = new Date().toISOString();
          orders.forEach(order => {
            if (!order || !order.id) {
              console.error("AutoCourierTracking: Invalid order object in location update:", order);
              return;
            }
            const locationData = {
              courierId,
              orderId: order.id,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              firmaid: order.firmaid, // siparişin firmaid'si
              accuracy: loc.coords.accuracy,
              timestamp: timestamp,
              speed: loc.coords.speed || 0,
              heading: loc.coords.heading || 0
            };
            
            socketRef.current.emit("locationUpdate", locationData);
            console.log(`📍 Konum gönderildi - Kurye: ${courierId}, Sipariş: ${order.id}, Koordinat: ${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
          });
        }
      );
    })();

    return () => {
      if (subscription) subscription.remove();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [orders, courierId]);

  return null;
};

interface CustomAlertProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({ visible, onCancel, onConfirm }) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
      }}>
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 20,
          width: '100%',
          maxWidth: 320
        }}>
          <Text style={{
            fontSize: 16,
            color: '#1F2937',
            textAlign: 'center',
            fontWeight: '500',
            marginBottom: 16
          }}>
            Siparişi iptal etmek istediğinizden emin misiniz?
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{
                flex: 1,
                backgroundColor: '#F3F4F6',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#4B5563', fontWeight: '600' }}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flex: 1,
                backgroundColor: '#EF4444',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>İptal Et</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Helper function to calculate countdown for delivery - Doğrudan timestamp karşılaştırması
const calculateDeliveryCountdown = (acceptedTime: Date): { hours: number, minutes: number, seconds: number, isExpired: boolean } => {
  // Backend text timestamp döndürüyor, doğrudan karşılaştır
  const now = new Date();
  const deliveryDeadline = new Date(acceptedTime.getTime() + 3600000); // 1 saat sonra
  const diff = deliveryDeadline.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { hours, minutes, seconds, isExpired: false };
};

// Custom hook for delivery countdown
const useDeliveryCountdown = (acceptedTimeString: string | null, orderId: string) => {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, isExpired: false });
  
  useEffect(() => {
    if (!acceptedTimeString) return;
    
    // Backend Turkey time timestamp kullanıyor
    const acceptedTime = new Date(acceptedTimeString);
    if (isNaN(acceptedTime.getTime())) return;
    
    // İlk hesaplamayı hemen yap
    const updateCountdown = () => {
      const newCountdown = calculateDeliveryCountdown(acceptedTime);
      setCountdown(newCountdown);
      return newCountdown.isExpired;
    };
    
    // İlk güncelleme
    const isExpired = updateCountdown();
    if (isExpired) return;
    
    // Interval başlat
    const interval = setInterval(() => {
      const isExpired = updateCountdown();
      if (isExpired) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [acceptedTimeString]); // acceptedTimeString değişimini takip et
  
  return countdown;
};

// Delivery countdown component for active orders - Stateless
const DeliveryCountdown: React.FC<{ order: Order }> = ({ order }) => {
  const [tick, setTick] = useState(0); // Re-render için state
  
  useEffect(() => {
    // Her saniye re-render için interval
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Stateless hesaplamalar
  const acceptedTimeStr = order.accepted_at || order.created_at;
  const deliveryCountdown = calculateDeliveryCountdownUtil(acceptedTimeStr);
  
  // Display için date nesnesine çevir
  const displayTime = new Date(acceptedTimeStr);
  const finalDisplayTime = isNaN(displayTime.getTime()) ? 
    new Date(order.created_at) : displayTime;
  
  
  if (deliveryCountdown.isExpired) {
    return (
      <View style={styles.deliveryCountdownContainer}>
        <View style={[styles.deliveryCountdownCard, { backgroundColor: '#EF4444' }]}>
          <View style={styles.deliveryCountdownHeader}>
            <Ionicons name="warning" size={16} color="#FFFFFF" />
            <Text style={styles.deliveryCountdownTitle}>SÜRE AŞILDI!</Text>
          </View>
          <Text style={styles.deliveryCountdownSubtext}>
            Lütfen en kısa sürede teslim edin
          </Text>
        </View>
      </View>
    );
  }
  
  // NaN kontrolü ile güvenli string oluşturma
  const safeHours = isNaN(deliveryCountdown.hours) ? 0 : deliveryCountdown.hours;
  const safeMinutes = isNaN(deliveryCountdown.minutes) ? 0 : deliveryCountdown.minutes;
  const safeSeconds = isNaN(deliveryCountdown.seconds) ? 0 : deliveryCountdown.seconds;
  
  const timeLeft = safeHours > 0 
    ? `${safeHours}s ${safeMinutes}dk ${safeSeconds}s`
    : `${safeMinutes}dk ${safeSeconds}s`;
    
  const isUrgent = safeHours === 0 && safeMinutes < 15;
  const isModerate = safeHours === 0 && safeMinutes < 30;
  
  const backgroundColor = isUrgent ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';
  const statusText = isUrgent ? 'ACİL TESLİMAT!' : isModerate ? 'HIZLI TESLİMAT' : 'TESLİMAT SÜRESİ';
  
  return (
    <View style={styles.deliveryCountdownContainer}>
      <View style={[styles.deliveryCountdownCard, { backgroundColor }]}>
        <View style={styles.deliveryCountdownHeader}>
          <Ionicons name="timer" size={16} color="#FFFFFF" />
          <Text style={styles.deliveryCountdownTitle}>{statusText}</Text>
        </View>
        <Text style={styles.deliveryCountdownTime}>
          {timeLeft} kaldı
        </Text>
      </View>
    </View>
  );
};

// Resim URL'sini düzelten helper fonksiyon
const fixImageUrl = (imageUrl: string | null): string | null => {
  if (!imageUrl) return null;
  
  // Eğer tam URL ise doğrudan kullan
  if (imageUrl.startsWith('http')) {
    // HTTPS URL'lerini HTTP'ye çevir - React Native HTTP resim yükleyemiyor
          const DOMAIN = process.env.EXPO_PUBLIC_API_BASE_URL || 'kuryex.enucuzal.com';
      if (imageUrl.startsWith(`https://${DOMAIN}`)) {
        return imageUrl.replace(`https://${DOMAIN}`, `https://${DOMAIN}`);
    }
    return imageUrl;
  }
  
  // Göreceli yolları tam URL'ye çevir
  const baseUrl = 'https://kuryex.enucuzal.com';
  return `${baseUrl}${imageUrl}`;
};

const KuryeOrders = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Tüm hook'ları en üste taşıyorum
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [pendingApprovalOrders, setPendingApprovalOrders] = useState<Order[]>([]);
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const socketRef = useRef<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'pending'>('active');

  // Tüm fonksiyonları useCallback ile sarmalayıp hook'lardan önce tanımlıyorum
  const fetchActiveOrders = useCallback(async () => {
    if (!user) {
      console.log("fetchActiveOrders: User not available, returning.");
      return;
    }
    console.log("fetchActiveOrders: Fetching active orders for user.id:", user.id);
    console.log("API URL:", getFullUrl(API_ENDPOINTS.GET_ACTIVE_ORDERS(user.id)));
    try {
      setIsLoading(true);
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_ACTIVE_ORDERS(user.id)));
      if (response.status === 404) {
        console.log("fetchActiveOrders: No active orders found (404). Setting activeOrders to empty array.");
        setActiveOrders([]);
        setError(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchActiveOrders: API'den dönen raw data:", JSON.stringify(data, null, 2));
      console.log("fetchActiveOrders: data.success:", data.success);
      console.log("fetchActiveOrders: data.data:", data.data);
      console.log("fetchActiveOrders: data.data type:", typeof data.data);
      console.log("fetchActiveOrders: data.data isArray:", Array.isArray(data.data));
      
      // Backend'den gelen response'u kontrol et - bazen data.success olmayabilir
      const ordersArray = data.data || data || [];
      if (Array.isArray(ordersArray)) {
        console.log("fetchActiveOrders: Setting activeOrders with", ordersArray.length, "items.");
        // Log each order's status for debugging
        ordersArray.forEach((order: any, index: number) => {
          console.log(`fetchActiveOrders: Order ${index}: id=${order?.id}, status=${order?.status}, firmaid=${order?.firmaid}`);
        });
        // Filter out any null or undefined orders and ensure they have required properties
        // Also convert id to string if it's a number
        const validOrders = ordersArray.filter((order: any) => order && order.id).map((order: any) => ({
          ...order,
          id: order.id.toString() // Convert to string for consistency
        }));
        console.log("fetchActiveOrders: Filtered to", validOrders.length, "valid orders.");
        // Log valid orders statuses
        validOrders.forEach((order: any, index: number) => {
          console.log(`fetchActiveOrders: Valid Order ${index}: id=${order.id}, status=${order.status}`);
        });
        setActiveOrders(validOrders);
      } else {
        console.warn("fetchActiveOrders: API'den dönen veri beklenildiği gibi array değil:", JSON.stringify(data, null, 2));
        setActiveOrders([]);
      }
      setError(null);
    } catch (err) {
      console.error("fetchActiveOrders: Error fetching active orders:", err);
      setError("Aktif siparişler alınırken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchPendingApprovalOrders = useCallback(async () => {
    if (!user) {
      console.log("fetchPendingApprovalOrders: User not available, returning.");
      return;
    }
    console.log("fetchPendingApprovalOrders: Fetching pending approval orders for user.id:", user.id);
    console.log("fetchPendingApprovalOrders: API URL:", getFullUrl(API_ENDPOINTS.GET_PENDING_APPROVAL_ORDERS_COURIER(user.id)));
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_PENDING_APPROVAL_ORDERS_COURIER(user.id)));
      console.log("fetchPendingApprovalOrders: Response status:", response.status);
      if (response.status === 404) {
        console.log("fetchPendingApprovalOrders: No pending approval orders found (404). Setting to empty array.");
        setPendingApprovalOrders([]);
        return;
      }
      if (!response.ok) {
        const errorText = await response.text();
        console.error("fetchPendingApprovalOrders: HTTP error response:", errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchPendingApprovalOrders: API'den dönen raw data:", JSON.stringify(data, null, 2));
      // Backend'den gelen response'u kontrol et
      const pendingOrdersArray = data.data || data || [];
      if (Array.isArray(pendingOrdersArray)) {
        console.log("fetchPendingApprovalOrders: Setting pendingApprovalOrders with", pendingOrdersArray.length, "items.");
        // Log each pending order's status for debugging
        pendingOrdersArray.forEach((order: any, index: number) => {
          console.log(`fetchPendingApprovalOrders: Order ${index}: id=${order?.id}, status=${order?.status}, firmaid=${order?.firmaid}`);
        });
        // Filter out any null or undefined orders and ensure they have required properties
        // Also convert id to string if it's a number
        const validPendingOrders = pendingOrdersArray.filter((order: any) => order && order.id).map((order: any) => ({
          ...order,
          id: order.id.toString() // Convert to string for consistency
        }));
        console.log("fetchPendingApprovalOrders: Filtered to", validPendingOrders.length, "valid orders.");
        setPendingApprovalOrders(validPendingOrders);
        
        // Eğer onay bekleyen tab'dayken siparişler biterse, aktif tab'a geç
        if (activeTab === 'pending' && validPendingOrders.length === 0) {
          setActiveTab('active');
        }
      } else {
        console.warn("fetchPendingApprovalOrders: API'den dönen veri beklenildiği gibi array değil:", JSON.stringify(data, null, 2));
        setPendingApprovalOrders([]);
        // Onay bekleyen tab'dayken hata olursa da aktif tab'a geç
        if (activeTab === 'pending') {
          setActiveTab('active');
        }
      }
    } catch (err) {
      console.error("fetchPendingApprovalOrders: Error fetching pending approval orders:", err);
      setPendingApprovalOrders([]);
    }
  }, [user]);

  // Order room'larına join olma fonksiyonu
  const joinOrderRooms = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) return;
    
    console.log("📦 KuryeOrders: Joining order rooms");
    
    // Her aktif sipariş için oda katılımı yap
    activeOrders.forEach(order => {
      socketRef.current.emit("joinOrder", { orderId: order.id });
      console.log(`📦 KuryeOrders: Joined order room for active order ${order.id}`);
    });
    
    // Her onay bekleyen sipariş için de oda katılımı yap
    pendingApprovalOrders.forEach(order => {
      socketRef.current.emit("joinOrder", { orderId: order.id });
      console.log(`📦 KuryeOrders: Joined order room for pending order ${order.id}`);
    });
  }, [activeOrders, pendingApprovalOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchActiveOrders(), fetchPendingApprovalOrders()]);
    setRefreshing(false);
  }, [fetchActiveOrders, fetchPendingApprovalOrders]);

  const deliverOrder = useCallback(async () => {
    if (!selectedOrder || !user) return;
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.DELIVER_ORDER), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          courierId: user.id,
          newStatus: "teslim edildi",
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Deliver order error response:", errorText);
        throw new Error(`Sipariş teslim edilirken hata oluştu: ${response.status} - ${errorText}`);
      }
      
      // Send real-time notification to restaurant that order was delivered
      if (socketRef.current) {
        console.log(`📦 Kurye ${user.id} sipariş ${selectedOrder.id} teslim etti - restaurant'a bildiriliyor`);
        socketRef.current.emit("orderDelivered", {
          orderId: selectedOrder.id,
          courierId: user.id,
          firmaid: selectedOrder.firmaid,
          message: `Sipariş #${selectedOrder.id} başarıyla teslim edildi`,
          orderDetails: {
            firma_adi: selectedOrder.firma_adi,
            mahalle: selectedOrder.mahalle,
            courier_price: selectedOrder.courier_price
          }
        });
      }
      
      await fetchActiveOrders();
      setSelectedOrder(null);
      
      // Sipariş teslim edildikten sonra başka aktif sipariş yoksa anasayfaya yönlendir
      const remainingOrders = activeOrders.filter(order => order.id !== selectedOrder.id);
      if (remainingOrders.length === 0) {
        Alert.alert(
          "Başarılı", 
          "Sipariş teslim edildi! Aktif siparişiniz kalmadı, anasayfaya yönlendiriliyorsunuz.", 
          [
            {
              text: "Tamam",
              onPress: () => router.push('/kurye/kuryehome')
            }
          ]
        );
      } else {
        Alert.alert("Başarılı", "Sipariş teslim edildi ve restoran bilgilendirildi! 📦");
      }
    } catch {
      console.error("Sipariş teslim hatası:", error);
      Alert.alert("Hata", "Sipariş teslim edilirken bir hata oluştu.");
    }
  }, [selectedOrder, user, fetchActiveOrders, activeOrders, router]);

  const cancelOrder = useCallback(async () => {
    if (!selectedOrder || !user) return;
    try {
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.CANCEL_ORDER), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          courierId: user.id,
          newStatus: "bekleniyor",
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Cancel order error response:", errorText);
        throw new Error(`Sipariş iptal edilirken hata oluştu: ${response.status} - ${errorText}`);
      }
      
      // Send real-time notification to restaurants that order was cancelled
      if (socketRef.current) {
        console.log(`📋 Kurye ${user.id} sipariş ${selectedOrder.id} iptal etti - restaurant'lara bildiriliyor`);
        socketRef.current.emit("orderStatusUpdate", {
          orderId: selectedOrder.id,
          status: "bekleniyor",
          courierId: user.id,
          message: "Sipariş kurye tarafından iptal edildi ve tekrar beklemede"
        });
      }
      
      fetchActiveOrders();
      setSelectedOrder(null);
      
      Alert.alert("Başarılı", "Sipariş iptal edildi ve restoran bilgilendirildi. 📋");
    } catch {
      console.error("Sipariş iptal hatası:", error);
      Alert.alert("Hata", "Sipariş iptal edilirken bir hata oluştu.");
    }
  }, [selectedOrder, user, fetchActiveOrders]);

  const handleOrderPress = useCallback((order: Order) => {
    setSelectedOrder(order);
    setModalVisible(true);
    if (order.resim) {
      setSelectedImage(order.resim);
    }
  }, []);

  const handleDeliverOrder = useCallback(() => {
    Alert.alert(
      "Onay",
      "Siparişi teslim etmek istediğinize emin misiniz?",
      [
        {
          text: "İptal",
          style: "cancel"
        },
        {
          text: "Evet",
          onPress: () => {
            deliverOrder();
            setModalVisible(false);
          }
        }
      ],
      { cancelable: true }
    );
  }, [deliverOrder]);

  const handleCancelOrder = useCallback(() => {
    Alert.alert(
      "",
      "Siparişi iptal etmek istediğinizden emin misiniz?",
      [
        {
          text: "Vazgeç",
          style: "cancel",
          onPress: () => {},
        },
        {
          text: "İptal Et",
          style: "destructive",
          onPress: () => {
            cancelOrder();
            setModalVisible(false);
          }
        }
      ],
      {
        cancelable: true
      }
    );
  }, [cancelOrder]);

  const handleCancelOrderFromCard = useCallback(async (order: Order) => {
    Alert.alert(
      "",
      "Siparişi iptal etmek istediğinizden emin misiniz?",
      [
        {
          text: "Vazgeç",
          style: "cancel",
          onPress: () => {},
        },
        {
          text: "İptal Et",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await authedFetch(getFullUrl(API_ENDPOINTS.CANCEL_ORDER), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: order.id,
                  courierId: user.id,
                  newStatus: "bekleniyor",
                }),
              });
              if (!response.ok) {
                const errorText = await response.text();
                console.error("Cancel order from card error response:", errorText);
                throw new Error(`Sipariş iptal edilirken hata oluştu: ${response.status} - ${errorText}`);
              }
              
              // Send real-time notification to restaurants that order was cancelled
              if (socketRef.current) {
                console.log(`📋 Kurye ${user.id} sipariş ${order.id} iptal etti - restaurant'lara bildiriliyor`);
                socketRef.current.emit("orderStatusUpdate", {
                  orderId: order.id,
                  status: "bekleniyor",
                  courierId: user.id,
                  message: "Sipariş kurye tarafından iptal edildi ve tekrar beklemede"
                });
              }
              
              fetchActiveOrders();
              
              Alert.alert("Başarılı", "Sipariş iptal edildi ve restoran bilgilendirildi. 📋");
            } catch {
              console.error("Sipariş iptal hatası:", error);
              Alert.alert("Hata", "Sipariş iptal edilirken bir hata oluştu.");
            }
          }
        }
      ],
      {
        cancelable: true
      }
    );
  }, [user, fetchActiveOrders]);

    const handleNavigateToRestaurant = useCallback(async (order: Order) => {
    try {
      // Restoran koordinatlarını restaurants endpoint'inden çek
      const response = await authedFetch(getFullUrl(API_ENDPOINTS.GET_RESTAURANT(order.firmaid)));
      
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
      
    } catch {
      console.error('Navigasyon hatası:', error);
      Alert.alert(
        "🚫 Navigasyon Hatası",
        "Restoran konum bilgileri alınamadı. Lütfen daha sonra tekrar deneyin.",
        [{ text: "Tamam", style: "default" }]
      );
    }
  }, []);

  const handleDeliverOrderFromCard = useCallback(async (order: Order) => {
    Alert.alert(
      "Onay",
      "Siparişi teslim etmek istediğinize emin misiniz?",
      [
        {
          text: "İptal",
          style: "cancel"
        },
        {
          text: "Evet",
          onPress: async () => {
            try {
              const response = await authedFetch(getFullUrl(API_ENDPOINTS.DELIVER_ORDER), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: order.id,
                  courierId: user.id,
                  newStatus: "teslim edildi",
                }),
              });
              if (!response.ok) {
                const errorText = await response.text();
                console.error("Deliver order from card error response:", errorText);
                throw new Error(`Sipariş teslim edilirken hata oluştu: ${response.status} - ${errorText}`);
              }
              
              // Send real-time notification to restaurant that order was delivered
              if (socketRef.current) {
                console.log(`📦 Kurye ${user.id} sipariş ${order.id} teslim etti - restaurant'a bildiriliyor`);
                socketRef.current.emit("orderDelivered", {
                  orderId: order.id,
                  courierId: user.id,
                  firmaid: order.firmaid,
                  message: `Sipariş #${order.id} başarıyla teslim edildi`,
                  orderDetails: {
                    firma_adi: order.firma_adi,
                    mahalle: order.mahalle,
                    courier_price: order.courier_price
                  }
                });
              }
              
              await fetchActiveOrders();
              
              // Sipariş teslim edildikten sonra başka aktif sipariş yoksa anasayfaya yönlendir
              const remainingOrders = activeOrders.filter(activeOrder => activeOrder.id !== order.id);
              if (remainingOrders.length === 0) {
                Alert.alert(
                  "Başarılı", 
                  "Sipariş teslim edildi! Aktif siparişiniz kalmadı, anasayfaya yönlendiriliyorsunuz.", 
                  [
                    {
                      text: "Tamam",
                      onPress: () => router.push('/kurye/kuryehome')
                    }
                  ]
                );
              } else {
                Alert.alert("Başarılı", "Sipariş teslim edildi ve restoran bilgilendirildi! 📦");
              }
            } catch {
              console.error("Sipariş teslim hatası:", error);
              Alert.alert("Hata", "Sipariş teslim edilirken bir hata oluştu.");
            }
          }
        }
      ],
      { cancelable: true }
    );
  }, [user, fetchActiveOrders, activeOrders, router]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          console.log("Loaded user data from AsyncStorage:", parsedUser);
          setUser(parsedUser);
        }
        setIsLoaded(true);
      } catch {
        console.error('Error loading user data from AsyncStorage:', error);
        setIsLoaded(true);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      console.log("User object changed, fetching active and pending approval orders.");
      console.log("Calling fetchActiveOrders and fetchPendingApprovalOrders with user.id:", user.id);
      fetchActiveOrders();
      fetchPendingApprovalOrders();
    } else {
      console.log("User object is null, not fetching orders.");
    }
  }, [user, fetchActiveOrders, fetchPendingApprovalOrders]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        console.log("KuryeOrders screen focused, checking socket connection.");
        // Only refresh if socket is not connected (prevents duplicate refresh)
        if (!socketRef.current?.connected) {
          fetchActiveOrders();
          fetchPendingApprovalOrders();
          console.log("🔄 Screen focused: Data refreshed (socket disconnected)");
        } else {
          console.log("🔄 Screen focused: Skipping refresh (socket connected)");
        }
      }
    }, [user, fetchActiveOrders, fetchPendingApprovalOrders])
  );

  // Socket bağlantısı: aktif siparişlerin konumları için
  useEffect(() => {
    if (!user) {
      console.log("Socket effect: User not available, skipping socket connection.");
      return;
    }
    
    console.log("Socket effect: Connecting to socket for user:", user.id);
    socketRef.current = io(API_CONFIG.SOCKET_URL, { transports: ["websocket"] });
    
    const joinBasicRooms = async () => {
      console.log(`🚚 KuryeOrders: Joining basic rooms for courier ${user.id}`);
      
      // Get user token for session management
      const token = await AsyncStorage.getItem('userToken');
      
      // Kurye kendi odasına katılsın
      socketRef.current.emit("joinCourierRoom", { courierId: user.id, token });
      console.log(`🚚 KuryeOrders: Joined courier room: courier_${user.id}`);
      
      // Genel kuryeler odasına katıl
      socketRef.current.emit("joinRoom", { room: "couriers" });
      console.log(`🚚 KuryeOrders: Joined general couriers room`);
    };

    socketRef.current.on("connect", () => {
      console.log("Socket connected. Joining courier room:", user.id);
      joinBasicRooms();
    });

    socketRef.current.on("reconnect", () => {
      console.log("Socket reconnected. Rejoining rooms:", user.id);
      joinBasicRooms();
    });

    // Listen for new orders for instant refresh
    socketRef.current.on("newOrderAdded", (data: { orderId: string, neighborhood: string, restaurantId: number, message: string }) => {
      console.log("🆕 KuryeOrders: New order added event received:", data);
      
      // No need to refresh here since this page shows active orders, not available ones
      console.log("🔄 KuryeOrders: Skipping refresh (this page shows active orders only)");
    });
    socketRef.current.on("locationUpdate", (data: any) => {
      if (!data || !data.orderId) return;
      // Ekstra kontrol: payload'da firmaid varsa ve bizim firmId'mizle eşleşmiyorsa atla.
      const firmId = user.publicMetadata?.firmId || user.id;
      if (data.firmaid && data.firmaid !== firmId) {
        console.warn("Received location update for different firm:", data.firmaid);
        return;
      }
      setCourierLocations((prevLocations) => {
        const index = prevLocations.findIndex(
          (loc) => loc.courierId === data.courierId && loc.orderId === data.orderId
        );
        if (index !== -1) {
          const newLocations = [...prevLocations];
          newLocations[index] = {
            courierId: data.courierId,
            orderId: data.orderId,
            latitude: data.latitude,
            longitude: data.longitude,
          };
          return newLocations;
        } else {
          return [
            ...prevLocations,
            {
              courierId: data.courierId,
              orderId: data.orderId,
              latitude: data.latitude,
              longitude: data.longitude,
            },
          ];
        }
      });
    });

    // --- Ekstra: Sipariş anlık güncelleme için event dinleme ---
    socketRef.current.on("orderAccepted", (data: any) => {
      console.log("Socket: orderAccepted event received. Refreshing active orders.", data);
      // Sipariş kurye tarafından kabul edildiğinde listeyi güncelle
      fetchActiveOrders();
    });

    // Backup bildirim sistemi - eğer normal socket event gelmezse
    socketRef.current.on("newOrderBroadcast", (order: any) => {
      console.log("📥 KuryeOrders: newOrderBroadcast event alındı:", {
        orderId: order.id,
        targetCourierId: order.targetCourierId,
        myId: user.id
      });
      
      // Sadece bize özel olan bildirimleri işle
      if (order.targetCourierId && order.targetCourierId.toString() === user.id.toString()) {
        console.log("📥 KuryeOrders: Broadcast event bize özel, siparişler yenileniyor");
        fetchActiveOrders();
        fetchPendingApprovalOrders();
      }
    });
    
    socketRef.current.on("orderStatusUpdate", (data: { orderId: string, status: string, courierId?: string, courierName?: string, message?: string }) => {
      console.log("📡 KuryeOrders: orderStatusUpdate event received:", data);
      
      // If order status changed to "kuryede" and it's not our order, no need to do anything here
      // This page only shows orders assigned to current courier
      
      // If order status changed and it affects our lists, refresh
      if (data.status === "teslim edildi" || data.status === "onay bekliyor") {
        // These status changes might affect our active or pending lists
        // Background refresh to ensure consistency (without loading state change)
        setTimeout(() => {
          fetchActiveOrders();
          fetchPendingApprovalOrders();
        }, 100);
        console.log("🔄 KuryeOrders: Order status change detected, scheduling background refresh");
      }
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
    
    socketRef.current.on("orderApproved", (data: any) => {
      console.log("✅ KuryeOrders: orderApproved event received:", data);
      
      // Önce state'i hemen güncelle (immediate update)
      if (data.orderId) {
        console.log(`✅ KuryeOrders: Removing order ${data.orderId} from pending approval list`);
        setPendingApprovalOrders(prevOrders => {
          const newOrders = prevOrders.filter(order => order.id.toString() !== data.orderId.toString());
          console.log(`✅ KuryeOrders: Pending orders count: ${prevOrders.length} -> ${newOrders.length}`);
          return newOrders;
        });
      }
      
      // Socket event sadece state güncellemesi için kullanılır
      // Push notification backend'den gönderilir
      console.log('✅ KuryeOrders: orderApproved - sadece state güncelleniyor, push notification backend tarafından gönderildi');
      
      // Sonra da API'den güncel verileri al
      fetchActiveOrders();
      fetchPendingApprovalOrders();
    });

    // Listen for order updates (when restaurants update order details)
    socketRef.current.on("orderUpdated", (data: { orderId: string, orderDetails: any, message: string }) => {
      console.log("🔄 KuryeOrders: Order updated event received:", data);
      
      // Refresh orders to show updated information
      fetchActiveOrders();
      fetchPendingApprovalOrders();
    });

    // Listen for order deletion events
    socketRef.current.on("orderDeleted", (data: { orderId: string | number, message: string, showAlert?: boolean }) => {
      console.log("🗑️ KuryeOrders: Order deleted event received:", data);
      
      // Check if this order was in our active or pending lists (meaning it was assigned to us)
      const wasInActiveOrders = activeOrders.some(o => o.id.toString() === data.orderId.toString());
      const wasInPendingOrders = pendingApprovalOrders.some(o => o.id.toString() === data.orderId.toString());
      
      // Close modal if the deleted order is currently being viewed
      if (selectedOrder && selectedOrder.id.toString() === data.orderId.toString()) {
        setModalVisible(false);
        setSelectedOrder(null);
      }
      
      // Immediate state updates for instant UI response
      setActiveOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId.toString()));
      setPendingApprovalOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId.toString()));
      
      // Background refresh to ensure data consistency (without loading state change)
      setTimeout(() => {
        fetchActiveOrders();
        fetchPendingApprovalOrders();
      }, 100);
      
      // Only show alert if this was our order (was assigned to us)
      if (data.showAlert !== false && (wasInActiveOrders || wasInPendingOrders)) {
        Alert.alert(
          "🗑️ Sipariş İptal Edildi",
          `Sipariş #${data.orderId} restoran tarafından silindi.`,
          [{ text: "Tamam", style: "default" }]
        );
      }
    });

    // Listen for order cancellation events
    socketRef.current.on("orderCancelled", (data: { orderId: string | number, message: string, cancelledBy?: string }) => {
      console.log("❌ KuryeOrders: Order cancelled event received:", data);
      
      // Remove cancelled order from both lists
      setActiveOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId.toString()));
      setPendingApprovalOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId.toString()));
      
      // Refresh orders to ensure consistency
      fetchActiveOrders();
      fetchPendingApprovalOrders();
      
      // Show notification
      Alert.alert(
        "❌ Sipariş İptal Edildi",
        data.message || `Sipariş #${data.orderId} iptal edildi.`,
        [{ text: "Tamam", style: "default" }]
      );
    });

    // Listen for order delivery confirmations
    socketRef.current.on("orderDelivered", (data: { orderId: string, courierId: string, message: string }) => {
      console.log("📦 KuryeOrders: Order delivered event received:", data);
      
      // Remove delivered order from active orders list
      setActiveOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId));
      
      // Refresh orders to ensure consistency
      fetchActiveOrders();
      fetchPendingApprovalOrders();
    });

    // Listen for notifications when restaurant deletes an order you have accepted
    socketRef.current.on("orderDeletedByCourierNotification", (data: { 
      orderId: string, 
      message: string, 
      restaurantName: string,
      courierTip: string,
      neighborhood: string,
      timestamp: string 
    }) => {
      console.log("🗑️ KuryeOrders: Courier received order deletion by restaurant:", data);
      
      // Close modal if the deleted order is currently being viewed
      if (selectedOrder && selectedOrder.id.toString() === data.orderId.toString()) {
        setModalVisible(false);
        setSelectedOrder(null);
      }
      
      // Immediate state updates for instant UI response
      setActiveOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId));
      setPendingApprovalOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId));
      
      // Background refresh to ensure data consistency (without loading state change)
      setTimeout(() => {
        fetchActiveOrders();
        fetchPendingApprovalOrders();
      }, 100);
    });

    // Listen for delivery overdue warnings
    socketRef.current.on("deliveryOverdue", (data: { orderId: string, message: string, orderDetails: any }) => {
      console.log("⚠️ KuryeOrders: Delivery overdue event received:", data);
      
      // Kurye'ye teslimat süresi aşımı uyarısı
      Alert.alert(
        "⚠️ Teslimat Süresi Aşıldı!",
        `${data.message}\n\nLütfen en kısa sürede teslim edin.`,
        [
          { text: "Tamam", style: "default" },
          { 
            text: "Teslim Et", 
            onPress: () => {
              // Find the order and deliver it
              const order = activeOrders.find(o => o.id.toString() === data.orderId);
              if (order) {
                handleDeliverOrderFromCard(order);
              }
            }
          }
        ]
      );
    });

    // Listen for order auto deletion
    socketRef.current.on("orderAutoDeleted", (data: { orderId: string, message: string }) => {
      console.log("⏰ KuryeOrders: Order auto deleted event received:", data);
      
      // Remove deleted order from both lists
      setActiveOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId));
      setPendingApprovalOrders(prevOrders => prevOrders.filter(o => o.id.toString() !== data.orderId));
      
      // Refresh orders to ensure consistency
      fetchActiveOrders();
      fetchPendingApprovalOrders();
      
      // Kullanıcıya bildir
      Alert.alert(
        "⏰ Sipariş Zaman Aşımı",
        `Sipariş #${data.orderId} 1 saat içinde alınmadığı için otomatik silindi.`,
        [{ text: "Tamam", style: "default" }]
      );
    });

    // Listen for notifications when your assigned order is cancelled by another courier
    socketRef.current.on("yourOrderCancelled", (data: { orderId: string, message: string, cancelledBy: string }) => {
      console.log("⚠️ KuryeOrders: Your order cancelled event received:", data);
      
      // Refresh orders and accepted orders to update the lists
      fetchActiveOrders();
      fetchPendingApprovalOrders();
      
      // Show alert to notify the courier
      Alert.alert(
        "⚠️ Siparişiniz İptal Edildi",
        `${data.message}\n\nSipariş başka bir kurye tarafından iptal edildi ve tekrar bekleme listesine alındı.`,
        [{ 
          text: "Tamam", 
          style: "default",
          onPress: () => {
            // Additional refresh to ensure UI is updated
            setTimeout(() => {
              fetchActiveOrders();
              fetchPendingApprovalOrders();
            }, 500);
          }
        }]
      );
    });

    // Listen for refresh order list requests
    socketRef.current.on("refreshOrderList", (data: { orderId: string, action: string, message: string }) => {
      console.log("🔄 KuryeOrders: Refresh order list event received:", data);
      
      // Önce state'i hemen güncelle (immediate update)
      if (data.action === 'orderApproved' && data.orderId) {
        console.log(`🔄 KuryeOrders: Immediately removing order ${data.orderId} due to approval`);
        setPendingApprovalOrders(prevOrders => {
          const newOrders = prevOrders.filter(order => order.id.toString() !== data.orderId.toString());
          console.log(`🔄 KuryeOrders: Pending orders updated: ${prevOrders.length} -> ${newOrders.length}`);
          return newOrders;
        });
      }
      
      // Sipariş listelerini yenile
      fetchActiveOrders();
      fetchPendingApprovalOrders();
      
      console.log("🔄 KuryeOrders: Order lists refreshed due to:", data.action);
    });

    // Listen for admin notifications
    socketRef.current.on("adminNotification", (data: { title: string, message: string, priority: string, withSound: boolean, timestamp: string, type: string, sender: string }) => {
      console.log("📢 KuryeOrders: Admin notification received:", data);
      
      // Bildirim sistemi kaldırıldı
      
      // Bildirim sistemi kaldırıldı

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

    // Listen for bundle test notifications
    // Bildirim sistemi kaldırıldı
    // ----------------------------------------------------------

    return () => {
      if (socketRef.current) {
        console.log("Socket disconnected on cleanup.");
        socketRef.current.disconnect();
      }
    };
  }, [user, fetchActiveOrders]);

  // Orders değiştiğinde order room'larına join ol
  useEffect(() => {
    if (user && socketRef.current && socketRef.current.connected) {
      // 500ms bekle ki socket stabilize olsun
      const timer = setTimeout(() => {
        joinOrderRooms();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [activeOrders, pendingApprovalOrders, joinOrderRooms, user]);

  // useFocusEffect - sayfa focus olduğunda socket yeniden bağlan ve data fetch et
  useFocusEffect(
    useCallback(() => {
      console.log("🔄 KuryeOrders: Page focused, refreshing data and reconnecting socket");
      
      // Sayfa focus olduğunda data'yı yenile
      if (user) {
        fetchActiveOrders();
        fetchPendingApprovalOrders();
        
        // Socket varsa temel room'lara join ol
        if (socketRef.current && socketRef.current.connected) {
          console.log("🔌 KuryeOrders: Rejoining basic rooms on focus");
          // Kurye kendi odasına katılsın
          socketRef.current.emit("joinCourierRoom", { courierId: user.id });
          // Genel kuryeler odasına katıl  
          socketRef.current.emit("joinRoom", { room: "couriers" });
          // Order room'ları ayrı useEffect'te join oluyor
        }
      }
    }, [user, fetchActiveOrders, fetchPendingApprovalOrders])
  );

  // Koşullu return, tüm hook'lardan sonra
  if (!isLoaded || !user) {
    console.log("Rendering: Loading screen (isLoaded:", isLoaded, ", user:", user, ")");
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  console.log("Rendering: activeOrders count for FlatList:", activeOrders.length);
  const courierId = user.id;
  // Firma ID'sini doğru belirleyin: eğer user.publicMetadata.firmId varsa onu kullanın, yoksa user.id
  const firmId = user.publicMetadata?.firmId || user.id;

  // Debug logs (reduced for performance)
  console.log("Rendering: activeOrders count:", activeOrders.length, "| pendingApprovalOrders count:", pendingApprovalOrders.length);
  
  const kuryedeOrders = activeOrders.filter(order => order && order.id && order.status === "kuryede");

  if (isLoading) {
    console.log("Rendering: isLoading is true. Showing loader.");
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

    return (
    <LinearGradient
      colors={["#8B5CF6", "#6366F1", "#4F46E5"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fullScreenGradient}
    >
            <SafeAreaView style={styles.container}>
        {/* Modern Header with Gradient */}
        <View style={styles.headerContainer}>
          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <View style={styles.statIconBox}>
                <Ionicons name="bicycle" size={12} color="#8B5CF6" />
              </View>
              <View style={styles.statTextContainer}>
                <Text style={styles.statNumber}>{activeOrders.length}</Text>
                <Text style={styles.statLabel}>Aktif</Text>
              </View>
            </View>
            
            <View style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="time" size={12} color="#F59E0B" />
              </View>
              <View style={styles.statTextContainer}>
                <Text style={styles.statNumber}>{pendingApprovalOrders.length}</Text>
                <Text style={styles.statLabel}>Onay Bekliyor</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            {pendingApprovalOrders.length > 0 && (
              <TouchableOpacity 
                style={[
                  styles.headerActionButton,
                  { backgroundColor: '#F59E0B' }
                ]}
                onPress={() => setActiveTab('pending')}
              >
                <Ionicons 
                  name="time" 
                  size={12} 
                  color="#FFFFFF" 
                />
                <Text style={styles.headerActionButtonText}>
                  Onay Bekleyen ({pendingApprovalOrders.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Tab Buttons */}
          {/* Tab Butonları - Onay bekleyen sipariş varsa iki tab, yoksa sadece aktif tab */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton, 
                activeTab === 'active' && styles.activeTabButton,
                pendingApprovalOrders.length === 0 && styles.singleTabButton
              ]}
              onPress={() => setActiveTab('active')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'active' && styles.activeTabButtonText]}>
                {pendingApprovalOrders.length === 0 ? `Siparişler (${activeOrders.length})` : `Aktif (${activeOrders.length})`}
              </Text>
            </TouchableOpacity>
            {pendingApprovalOrders.length > 0 && (
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'pending' && styles.activeTabButton]}
                onPress={() => setActiveTab('pending')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'pending' && styles.activeTabButtonText]}>
                  Onay Bekleyen ({pendingApprovalOrders.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>

      <FlatList
        data={activeTab === 'active' ? activeOrders : pendingApprovalOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          return (
            <TouchableOpacity
              onPress={() => handleOrderPress(item)}
              activeOpacity={0.9}
              className="mb-2"
            >
              <LinearGradient
                colors={
                  selectedOrder?.id === item.id 
                    ? ["#059669", "#10B981"]
                    : ["#4F46E5", "#6366F1"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.orderItem}
              >
                <View style={styles.orderContent}>
                  {/* Firma ve Sipariş No */}
                  <View style={styles.headerRow}>
                    <View style={styles.headerLeft}>
                      <View style={styles.iconBox}>
                        <Ionicons name="business" size={16} color="#FFFFFF" />
                      </View>
                      <View style={styles.headerInfo}>
                        <Text style={styles.firmName} numberOfLines={1}>{item.firma_adi}</Text>
                        <Text style={styles.orderId}>#{item.id}</Text>
                      </View>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>
                        {item.status === 'onay bekliyor' ? '⏳ Onay Bekliyor' : '🛵 Kuryede'}
                      </Text>
                    </View>
                  </View>

                  {/* Alt Bilgiler Grid */}
                  <View style={styles.gridContainer}>
                    {/* Mahalle */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridIconBox}>
                        <Ionicons name="location" size={14} color="#FFFFFF" />
                      </View>
                      <Text style={styles.gridValue} numberOfLines={1}>
                        {item.mahalle}
                      </Text>
                    </View>

                    {/* Ücret */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridIconBox}>
                        <Ionicons name="bicycle" size={14} color="#FFFFFF" />
                      </View>
                      <Text style={styles.gridValue}>{item.courier_price} ₺</Text>
                    </View>

                    {/* Ödeme */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridIconBox}>
                        <Ionicons name="card" size={14} color="#FFFFFF" />
                      </View>
                      <Text style={styles.gridValue} numberOfLines={1}>
                        {item.odeme_yontemi}
                      </Text>
                    </View>

                    {/* Teslimat Süresi */}
                    <View style={styles.gridItem}>
                      <View style={styles.gridIconBox}>
                        <Ionicons name="time" size={14} color="#FFFFFF" />
                      </View>
                      <Text style={styles.gridValue} numberOfLines={1}>
                        {item.delivery_time_minutes && item.delivery_time_minutes > 0 
                          ? `${Math.round(item.delivery_time_minutes)} dk`
                          : item.status === 'teslim edildi' ? 'Hesaplanamadı' : '-'
                        }
                      </Text>
                    </View>
                  </View>

                  {/* Teslimat Countdown - Sadece aktif siparişlerde */}
                  {item.status !== 'onay bekliyor' && <DeliveryCountdown order={item} />}

                  {/* Resim ve Detay */}
                  <View style={styles.bottomRow}>
                    {item.resim && (
                      <View style={styles.imageIndicator}>
                        <Ionicons name="image" size={14} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.navigationButton]}
                        onPress={() => handleNavigateToRestaurant(item)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="navigate" size={14} color="#FFFFFF" />
                        <Text style={styles.actionButtonText}>Yol Tarifi</Text>
                      </TouchableOpacity>
                      {item.status !== 'onay bekliyor' && (
                        <>
                          <TouchableOpacity
                            style={[styles.actionButton, styles.cancelButton]}
                            onPress={() => handleCancelOrderFromCard(item)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="close-circle" size={14} color="#FFFFFF" />
                            <Text style={styles.actionButtonText}>İptal Et</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleDeliverOrderFromCard(item)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                            <Text style={styles.actionButtonText}>Teslim Et</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={["#8B5CF6"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <View style={styles.emptyIconInner}>
                <Ionicons name="bicycle" size={32} color="#FFFFFF" />
              </View>
            </View>
            {activeTab === 'active' && activeOrders.length === 0 && pendingApprovalOrders.length > 0 ? (
              <>
                <Text style={styles.emptyTitle}>Onay Bekleyen Siparişleriniz Var!</Text>
                <Text style={styles.emptyText}>
                  Aktif siparişiniz bulunmuyor.{'\n'}Ancak onay bekleyen {pendingApprovalOrders.length} siparişiniz var.{'\n'}Onaylanan siparişler burada görünecek.
                </Text>
                <TouchableOpacity 
                  style={styles.pendingNotificationButton}
                  onPress={() => setActiveTab('pending')}
                >
                  <Ionicons name="time" size={16} color="#FFFFFF" />
                  <Text style={styles.pendingNotificationText}>
                    Onay Bekleyen Siparişleri Gör
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'active' ? 'Aktif Sipariş Yok' : 'Onay Bekleyen Sipariş Yok'}
                </Text>
                <Text style={styles.emptyText}>
                  {activeTab === 'active' 
                    ? 'Şu anda aktif siparişiniz bulunmuyor.\nYeni siparişler için ana sayfayı kontrol edin.'
                    : 'Şu anda onay bekleyen siparişiniz yok.\nOnaylanan siparişler aktif sekmesinde görünecek.'
                  }
                </Text>
              </>
            )}
          </View>
        }
      />

      {kuryedeOrders.length > 0 && (
        <AutoCourierTracking courierId={courierId} orders={kuryedeOrders} />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          setSelectedImage(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sipariş Detayları</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSelectedImage(null);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Content */}
            <ScrollView 
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {selectedOrder && (
                <View style={styles.detailsContainer}>
                  {/* Firma Bilgileri */}
                  <View style={styles.detailSection}>
                    <View style={styles.detailHeader}>
                      <Ionicons name="business" size={20} color="#8B5CF6" />
                      <Text style={styles.detailTitle}>Firma Bilgileri</Text>
                    </View>
                    <Text style={styles.detailText}>{selectedOrder.firma_adi}</Text>
                  </View>

                  {/* Sipariş Bilgileri */}
                  <View style={styles.detailSection}>
                    <View style={styles.detailHeader}>
                      <Ionicons name="document-text" size={20} color="#8B5CF6" />
                      <Text style={styles.detailTitle}>Sipariş Bilgileri</Text>
                    </View>
                    <Text style={styles.detailText}>Sipariş No: #{selectedOrder.id}</Text>
                    <Text style={styles.detailText}>Durum: {selectedOrder.status}</Text>
                    <Text style={styles.detailText}>Ücret: {selectedOrder.courier_price || selectedOrder.kurye_tutari} ₺</Text>
                  </View>

                  {/* Teslimat Bilgileri */}
                  <View style={styles.detailSection}>
                    <View style={styles.detailHeader}>
                      <Ionicons name="location" size={20} color="#8B5CF6" />
                      <Text style={styles.detailTitle}>Teslimat Bilgileri</Text>
                    </View>
                    <Text style={styles.detailText}>Mahalle: {selectedOrder.mahalle}</Text>
                    <Text style={styles.detailText}>Ödeme: {selectedOrder.odeme_yontemi}</Text>
                  </View>

                  {/* Resim */}
                  {selectedImage && (
                    <View style={styles.detailSection}>
                      <View style={styles.detailHeader}>
                        <Ionicons name="image" size={20} color="#8B5CF6" />
                        <Text style={styles.detailTitle}>Sipariş Resmi</Text>
                      </View>
                      <Image
                        source={{ uri: fixImageUrl(selectedImage) || '' }}
                        style={styles.modalImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Fixed Action Buttons */}
            {selectedOrder && selectedOrder.status !== 'onay bekliyor' && (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.modalCancelButton]}
                  onPress={handleCancelOrder}
                >
                  <Ionicons name="close-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.modalActionText}>İptal Et</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={handleDeliverOrder}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.modalActionText}>Teslim Et</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fullScreenGradient: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  contentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 0,
  },
  // Modern Header Styles
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 8,
    borderRadius: 12,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 8,
    borderRadius: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statIconBox: {
    backgroundColor: '#EDE9FE',
    padding: 4,
    borderRadius: 6,
  },
  statTextContainer: {
    flex: 1,
  },
  statNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  actionButtonsContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  headerActionButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  // Legacy header styles (keeping for compatibility)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    paddingBottom: 10,
    backgroundColor: '#8B5CF6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  orderItem: {
    borderRadius: 12,
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
  headerInfo: {
    flex: 1,
  },
  iconBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 8,
  },
  firmName: {
    fontSize: 14,
    fontWeight: '600',
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imageIndicator: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 4,
    borderRadius: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  navigationButton: {
    backgroundColor: 'rgba(34, 197, 94, 0.4)',
  },
  cancelButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
  listContainer: {
    padding: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    flex: 1,
    paddingBottom: 100, // Butonlar için alan bırak (20px bottom + 80px buton alanı)
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 40, // Butonların üstünde kalması için ekstra alan
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  closeButton: {
    padding: 8,
  },
  modalScroll: {
    flex: 1,
  },
  detailsContainer: {
    gap: 20,
  },
  detailSection: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  detailText: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 28,
  },
  modalImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    bottom: 25,
    left: 0,
    right: 0,
  },
  modalActionButton: {
    flex: 1,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalCancelButton: {
    backgroundColor: '#EF4444',
  },
  modalActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  deliveryCountdownContainer: {
    marginVertical: 8,
  },
  deliveryCountdownCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
  },
  deliveryCountdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  deliveryCountdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  deliveryCountdownTime: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  deliveryCountdownSubtext: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 8,
  },
  priceItem: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceItemWithBorder: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 1,
  },
  priceValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    margin: 10,
    marginTop: 12,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabButtonText: {
    color: '#4F46E5',
  },
  singleTabButton: {
    // Tek tab olduğunda tam genişlik kullan
    flex: 1,
  },
  pendingNotificationButton: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingNotificationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default KuryeOrders;
