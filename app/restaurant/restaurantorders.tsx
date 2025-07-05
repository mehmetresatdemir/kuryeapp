import React, { useState, useEffect, Fragment, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { API_CONFIG, getFullUrl, API_ENDPOINTS, authedFetch } from "../../constants/api";
import DateTimePicker from '@react-native-community/datetimepicker';
import { io } from "socket.io-client";
import { useFocusEffect } from '@react-navigation/native';

interface DeliveredOrder {
  id: string;
  created_at: string;
  kurye_tutari: number;
  nakit_tutari: number;
  banka_tutari: number;
  hediye_tutari: number;
  title: string;
  odeme_tipi: string;
  kurye_adi: string;
  mahalle: string;
  resim?: string; // Sipariş resmi
  status?: string; // Sipariş durumu
  courier_phone?: string; // Kurye telefonu
  preparation_time?: number; // Hazırlık süresi
}

const RestaurantOrders = () => {
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const socketRef = useRef<any>(null);
  
  // Görünüm modları
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  
  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState<boolean>(false);
  
  // Date picker state'leri
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end'>('start');
  const [tempDate, setTempDate] = useState(new Date());
  
  // Error handling
  const [error, setError] = useState<string | null>(null);
  
  // Modal state'leri
  const [orderDetailModalVisible, setOrderDetailModalVisible] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveredOrder | null>(null);

  // Toplam değerleri hesapla
  const totals = deliveredOrders.reduce((acc, curr) => {
    const odemeTipi = curr.odeme_tipi?.toLowerCase() || '';
    const kuryeTutari = parseFloat(String(curr.kurye_tutari || 0).replace(',', '.')) || 0;
    
    acc.kurye += kuryeTutari;
    acc.totalOrders += 1;

    if (odemeTipi.includes('nakit')) {
      acc.nakit += parseFloat(String(curr.nakit_tutari || 0).replace(',', '.')) || 0;
      acc.nakitCount += 1;
    } else if (odemeTipi.includes('kredi') || odemeTipi.includes('kart') || odemeTipi.includes('banka')) {
      acc.banka += parseFloat(String(curr.banka_tutari || 0).replace(',', '.')) || 0;
      acc.bankaCount += 1;
    } else if (odemeTipi.includes('hediye')) {
      acc.hediye += parseFloat(String(curr.hediye_tutari || 0).replace(',', '.')) || 0;
      acc.hediyeCount += 1;
    } else if (odemeTipi.includes('online')) {
      acc.online += parseFloat(String(curr.banka_tutari || 0).replace(',', '.')) || 0;
      acc.onlineCount += 1;
    }
    
    return acc;
  }, { 
    kurye: 0, 
    nakit: 0, 
    banka: 0, 
    hediye: 0, 
    online: 0,
    totalOrders: 0,
    nakitCount: 0,
    bankaCount: 0,
    hediyeCount: 0,
    onlineCount: 0
  });

  // Hafta hesaplama fonksiyonları
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setUTCDate(diff));
  };

  const getCurrentWeek = (): string => {
    const now = new Date();
    const weekStart = getWeekStart(now);
    return weekStart.toISOString().slice(0, 10);
  };

  // View mode değiştiğinde selectedDate'i uygun şekilde ayarla
  const handleViewModeChange = (newMode: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    if (newMode === 'weekly' && viewMode !== 'weekly') {
      // Haftalık moda geçerken bu haftanın başlangıcını ayarla
      setSelectedDate(getCurrentWeek());
    } else if (newMode === 'daily' && viewMode !== 'daily') {
      // Günlük moda geçerken bugünü ayarla
      setSelectedDate(new Date().toISOString().slice(0, 10));
    } else if (newMode === 'monthly' && viewMode !== 'monthly') {
      // Aylık moda geçerken bu ayın 1'ini ayarla
      const today = new Date();
      setSelectedDate(today.toISOString().slice(0, 7) + '-01');
    }
    setViewMode(newMode);
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      setIsLoading(true);
      
      let endpoint = '';
      if (viewMode === 'daily') {
        endpoint = `?date=${selectedDate}`;
      } else if (viewMode === 'weekly') {
        const currentDate = new Date(selectedDate + 'T00:00:00Z');
        const weekStart = getWeekStart(currentDate);
        const weekStartStr = weekStart.toISOString().slice(0, 10);
        endpoint = `?week=${weekStartStr}`;
      } else if (viewMode === 'monthly') {
        const monthStr = selectedDate.length > 7 ? selectedDate.slice(0, 7) : selectedDate;
        endpoint = `?date=${monthStr}`;
      } else if (viewMode === 'custom' && customStartDate && customEndDate) {
        endpoint = `?start=${customStartDate}&end=${customEndDate}`;
      }
      
      // Teslim edilen siparişleri getir
      const deliveredResponse = await authedFetch(getFullUrl(API_ENDPOINTS.DELIVERED_ORDERS_FIRM(user.id, endpoint)));
      
      if (!deliveredResponse.ok) {
        throw new Error(`Veri alınamadı (${deliveredResponse.status})`);
      }
      
      const deliveredData = await deliveredResponse.json();
      setDeliveredOrders(deliveredData.data || []);
      
    } catch (error) {
      console.error("Error fetching earnings data", error);
      setError(error instanceof Error ? error.message : "Veriler yüklenirken hata oluştu");
      setDeliveredOrders([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user, viewMode, selectedDate, customStartDate, customEndDate]);

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

  useEffect(() => {
    if (isLoaded && user && viewMode !== 'custom') {
      fetchData();
    }
  }, [isLoaded, user, selectedDate, viewMode]);

  // Custom mode için ayrı useEffect
  useEffect(() => {
    if (isLoaded && user && viewMode === 'custom' && customStartDate && customEndDate) {
      fetchData();
    }
  }, [isLoaded, user, viewMode, customStartDate, customEndDate]);

  // Socket connection setup for real-time updates
  useEffect(() => {
    console.log("RestaurantOrders: Socket useEffect triggered, user:", user?.id);
    if (!user) {
      console.log("RestaurantOrders: No user found, skipping socket connection");
      return;
    }

    console.log("RestaurantOrders: Connecting to socket URL:", API_CONFIG.SOCKET_URL);
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

    socket.on("connect", () => {
      console.log("RestaurantOrders: Socket connected successfully");
      // Join restaurant room to receive order updates
      socket.emit("joinRestaurantRoom", { restaurantId: user.id });
    });

    socket.on("connect_error", (err: any) => {
      console.log("RestaurantOrders: Socket connection error:", err);
    });

    socket.on("disconnect", (reason) => {
      console.log("RestaurantOrders: Socket disconnected:", reason);
    });

    socket.on("reconnect", (attemptNumber) => {
      console.log("RestaurantOrders: Socket reconnected after", attemptNumber, "attempts");
      // Rejoin restaurant room after reconnection
      socket.emit("joinRestaurantRoom", { restaurantId: user.id });
    });

    // Listen for order approval confirmations
    socket.on("orderApproved", (data: { orderId: string, order: any }) => {
      console.log("RestaurantOrders: ✅ Order approved event received:", data);
      
      // Refresh delivered orders list to include the newly approved order
      fetchData();
    });

    // Listen for refresh order list requests
    socket.on("refreshOrderList", (data: { orderId: string, action: string, message: string }) => {
      console.log("RestaurantOrders: 🔄 Refresh order list event received:", data);
      
      // Refresh delivered orders if an order was approved
      if (data.action === 'orderApproved') {
        fetchData();
      }
    });

    // Listen for general order status updates
    socket.on("orderStatusUpdate", (data: { orderId: string, status: string }) => {
      console.log("RestaurantOrders: 📡 Order status update received:", data);
      
      // If order becomes 'teslim edildi', refresh the list
      if (data.status === 'teslim edildi') {
        fetchData();
      }
    });

    socketRef.current = socket;

    return () => {
      if (socket) {
        console.log("RestaurantOrders: Cleaning up socket connection");
        socket.removeAllListeners();
        socket.disconnect();
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [user]);

  // Re-initialize socket when component comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log("RestaurantOrders: Component focused, user:", user?.id);
      if (user && socketRef.current) {
        console.log("RestaurantOrders: Ensuring socket is connected and in correct room");
        if (socketRef.current.connected) {
          socketRef.current.emit("joinRestaurantRoom", { restaurantId: user.id });
        }
      }
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Sipariş detayını aç
  const openOrderDetail = (order: DeliveredOrder) => {
    setSelectedOrder(order);
    setOrderDetailModalVisible(true);
  };

  // Günler/haftalar arası geçiş
  const handleDateChange = (direction: number) => {
    const currentDate = new Date(selectedDate + 'T00:00:00Z');
    
    if (viewMode === 'daily') {
      currentDate.setUTCDate(currentDate.getUTCDate() + direction);
      const newDate = currentDate.toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      
      if (direction > 0 && newDate > today) return;
      setSelectedDate(newDate);
    } else if (viewMode === 'weekly') {
      // Haftalık modda 7 gün ekle/çıkar
      currentDate.setUTCDate(currentDate.getUTCDate() + (direction * 7));
      const newDate = currentDate.toISOString().slice(0, 10);
      setSelectedDate(newDate);
    } else if (viewMode === 'monthly') {
      // Aylık modda ay ekle/çıkar
      currentDate.setUTCMonth(currentDate.getUTCMonth() + direction);
      // Ayın ilk günü olarak ayarla
      currentDate.setUTCDate(1);
      const newDate = currentDate.toISOString().slice(0, 10);
      const today = new Date();
      
      // Gelecek aya gitmeyi engelle
      if (direction > 0 && currentDate > today) return;
      setSelectedDate(newDate);
    }
  };

  // Date picker handlers
  const openDatePicker = (mode: 'start' | 'end') => {
    setDatePickerMode(mode);
    let currentDate;
    
    if (mode === 'start') {
      currentDate = customStartDate ? new Date(customStartDate) : new Date();
    } else {
      currentDate = customEndDate 
        ? new Date(customEndDate) 
        : customStartDate 
          ? new Date(customStartDate)
          : new Date();
    }
    
    setTempDate(currentDate);
    setShowDatePicker(true);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const isAndroid = Platform.OS === 'android';
    
    if (selectedDate) {
      setTempDate(selectedDate);
      
      if (event.type !== 'dismissed') {
        const dateString = selectedDate.toISOString().slice(0, 10);
        
        if (datePickerMode === 'start') {
          setCustomStartDate(dateString);
          if (customEndDate && dateString > customEndDate) {
            setCustomEndDate('');
          }
        } else {
          setCustomEndDate(dateString);
        }
        
        setShowDatePicker(false);
      }
    }
    
    if (isAndroid || event.type === 'dismissed') {
      setShowDatePicker(false);
    }
  };

  const getDateDisplayText = () => {
    switch (viewMode) {
      case 'daily':
        return new Date(selectedDate).toLocaleDateString('tr-TR', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric',
          timeZone: 'UTC'
        });
      case 'weekly':
        const currentDate = new Date(selectedDate + 'T00:00:00Z');
        const weekStart = getWeekStart(currentDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        
        return `${weekStart.toLocaleDateString('tr-TR', { 
          day: 'numeric', 
          month: 'short',
          timeZone: 'UTC'
        })} - ${weekEnd.toLocaleDateString('tr-TR', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric',
          timeZone: 'UTC'
        })}`;
      case 'monthly':
        const monthStr = selectedDate.length > 7 ? selectedDate.slice(0, 7) : selectedDate;
        return new Date(monthStr + '-01').toLocaleDateString('tr-TR', { 
          month: 'long', 
          year: 'numeric'
        });
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('tr-TR')} - ${new Date(customEndDate).toLocaleDateString('tr-TR')}`;
        }
        return 'Tarih Aralığı Seç';
      default:
        return '';
    }
  };

  const renderDeliveredItem = ({ item }: { item: DeliveredOrder }) => {
    const orderDate = new Date(item.created_at);
    const formattedDate = orderDate.toLocaleDateString("tr-TR", { 
      day: "numeric", 
      month: "long", 
      hour: "2-digit", 
      minute: "2-digit",
      timeZone: 'UTC'
    });

    // Ödeme tipi ikonları ve renkleri
    const getPaymentTypeInfo = (paymentType: string) => {
      const lowerType = paymentType?.toLowerCase() || '';
      
      if (lowerType.includes('nakit')) {
        return { label: 'Nakit' };
      } else if (lowerType.includes('kredi') || lowerType.includes('kart')) {
        return { label: 'Kredi Kartı' };
      } else if (lowerType.includes('banka')) {
        return { label: 'Banka' };
      } else if (lowerType.includes('hediye')) {
        return { label: 'Hediye' };
      } else if (lowerType.includes('online')) {
        return { label: 'Online' };
      } else {
        return { label: 'Bilinmiyor' };
      }
    };

    const paymentInfo = getPaymentTypeInfo(item.odeme_tipi);

    return (
      <TouchableOpacity onPress={() => openOrderDetail(item)}>
        <View style={styles.orderItem}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderTitle}>{item.title}</Text>
            <Text style={styles.orderDate}>{formattedDate}</Text>
          </View>
          <View style={styles.orderDetails}>
            <Text style={styles.orderAddress}>{item.mahalle}</Text>
            <Text style={styles.courierNameText}>Kurye: {item.kurye_adi || 'Atanmamış'}</Text>
          </View>
          <View style={styles.orderFooter}>
            <Text style={styles.paymentType}>{paymentInfo.label}</Text>
            <Text style={styles.courierPrice}>{(parseFloat(String(item.kurye_tutari || 0).replace(',', '.')) || 0).toFixed(2)} ₺</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!isLoaded || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <StatusBar backgroundColor="#8B5CF6" barStyle="light-content" />
      
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Kazanç Raporu</Text>
        </View>

        {/* View Mode Selector */}
        <View style={styles.viewModeContainer}>
                  <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'daily' && styles.activeViewMode]}
          onPress={() => handleViewModeChange('daily')}
        >
          <Text style={[styles.viewModeText, viewMode === 'daily' && styles.activeViewModeText]}>Günlük</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'weekly' && styles.activeViewMode]}
          onPress={() => handleViewModeChange('weekly')}
        >
          <Text style={[styles.viewModeText, viewMode === 'weekly' && styles.activeViewModeText]}>Haftalık</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'monthly' && styles.activeViewMode]}
          onPress={() => handleViewModeChange('monthly')}
        >
          <Text style={[styles.viewModeText, viewMode === 'monthly' && styles.activeViewModeText]}>Aylık</Text>
        </TouchableOpacity>
                  <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'custom' && styles.activeViewMode]}
          onPress={() => {
            handleViewModeChange('custom');
            setShowCustomDatePicker(true);
          }}
        >
          <Text style={[styles.viewModeText, viewMode === 'custom' && styles.activeViewModeText]}>Özel</Text>
        </TouchableOpacity>
        </View>

        {/* Date Display */}
        {viewMode === 'daily' || viewMode === 'weekly' || viewMode === 'monthly' ? (
          <View style={styles.dailyDateSelector}>
            <TouchableOpacity onPress={() => handleDateChange(-1)} style={styles.dateArrow}>
              <Ionicons name="chevron-back" size={24} color="#4B5563" />
            </TouchableOpacity>
            <Text style={styles.dateText}>{getDateDisplayText()}</Text>
            <TouchableOpacity 
              onPress={() => handleDateChange(1)} 
              style={styles.dateArrow}
              disabled={
                (viewMode === 'daily' && selectedDate >= new Date().toISOString().slice(0, 10)) ||
                (viewMode === 'monthly' && new Date(selectedDate).getMonth() >= new Date().getMonth() && new Date(selectedDate).getFullYear() >= new Date().getFullYear())
              }
            >
              <Ionicons 
                name="chevron-forward" 
                size={24} 
                color={
                  (viewMode === 'daily' && selectedDate >= new Date().toISOString().slice(0, 10)) ||
                  (viewMode === 'monthly' && new Date(selectedDate).getMonth() >= new Date().getMonth() && new Date(selectedDate).getFullYear() >= new Date().getFullYear())
                    ? '#D1D5DB' 
                    : '#4B5563'
                } 
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.dateDisplay}>
            <Text style={styles.dateText}>{getDateDisplayText()}</Text>
          </View>
        )}

        {/* Main Content */}
        <ScrollView 
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#8B5CF6']}
              tintColor='#8B5CF6'
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="warning-outline" size={24} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
                <Text style={styles.retryButtonText}>Tekrar Dene</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Ödeme Türlerine Göre Toplam */}
              <View style={styles.summaryContainer}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Nakit Tahsilat</Text>
                  <Text style={styles.summaryValue}>{totals.nakit.toFixed(2)} ₺</Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Kredi Kartı</Text>
                  <Text style={styles.summaryValue}>{totals.banka.toFixed(2)} ₺</Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Hediye Çeki</Text>
                  <Text style={styles.summaryValue}>{totals.hediye.toFixed(2)} ₺</Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Online</Text>
                  <Text style={styles.summaryValue}>{totals.online.toFixed(2)} ₺</Text>
                </View>
                
                <View style={styles.summaryRow}>
                  <Text style={styles.orderCountLabel}>Toplam Sipariş Sayısı</Text>
                  <Text style={styles.orderCountValue}>{totals.totalOrders} adet</Text>
                </View>
                
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Toplam</Text>
                  <Text style={styles.totalValue}>{(totals.nakit + totals.banka + totals.hediye + totals.online).toFixed(2)} ₺</Text>
                </View>
                
                <View style={[styles.summaryRow, styles.courierRow]}>
                  <Text style={styles.courierLabel}>Kurye Gideri</Text>
                  <Text style={styles.courierValue}>{totals.kurye.toFixed(2)} ₺</Text>
                </View>
              </View>

              {/* Geçmiş Siparişler */}
              <View style={styles.ordersContainer}>
                <Text style={[styles.sectionTitle, styles.deliveredTitle]}>Geçmiş Siparişler ({deliveredOrders.length})</Text>
                {deliveredOrders.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyTitle}>Veri Bulunamadı</Text>
                    <Text style={styles.emptySubtitle}>Seçili dönem için sipariş bulunmuyor.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={deliveredOrders}
                    keyExtractor={(item) => item.id}
                    renderItem={renderDeliveredItem}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    style={styles.ordersList}
                    scrollEnabled={false}
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Custom Date Range Modal */}
        <Modal
          visible={showCustomDatePicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowCustomDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tarih Aralığı Seç</Text>
                <TouchableOpacity onPress={() => {
                    setShowCustomDatePicker(false);
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.dateInputContainer}>
                <View style={styles.dateInputWrapper}>
                  <Text style={styles.dateInputLabel}>Başlangıç Tarihi</Text>
                  <View style={styles.dateInputButton}>
                    {showDatePicker && datePickerMode === 'start' ? (
                      <View style={styles.embeddedPickerContainer}>
                        <DateTimePicker
                          value={tempDate}
                          mode="date"
                          display="default"
                          onChange={onDateChange}
                          maximumDate={new Date()}
                        />
                      </View>
                    ) : (
                      <>
                        <Text style={styles.dateInputValue}>
                          {customStartDate ? new Date(customStartDate).toLocaleDateString('tr-TR') : 'Seçin'}
                        </Text>
                        <TouchableOpacity 
                          style={styles.overlayButton}
                          onPress={() => openDatePicker('start')}
                        />
                      </>
                    )}
                  </View>
                </View>
                
                <View style={styles.dateInputWrapper}>
                  <Text style={[styles.dateInputLabel, !customStartDate && { color: '#9CA3AF' }]}>Bitiş Tarihi</Text>
                  <View style={styles.dateInputButton}>
                    {showDatePicker && datePickerMode === 'end' ? (
                      <View style={styles.embeddedPickerContainer}>
                        <DateTimePicker
                          value={tempDate}
                          mode="date"
                          display="default"
                          onChange={onDateChange}
                          maximumDate={new Date()}
                          minimumDate={customStartDate ? new Date(customStartDate) : undefined}
                        />
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.dateInputValue, !customStartDate && { color: '#9CA3AF' }]}>
                          {customEndDate ? new Date(customEndDate).toLocaleDateString('tr-TR') : 'Seçin'}
                        </Text>
                        <TouchableOpacity 
                          style={styles.overlayButton}
                          onPress={() => openDatePicker('end')}
                          disabled={!customStartDate}
                        />
                      </>
                    )}
                  </View>
                </View>

                {/* Seçilen Tarih Aralığı Gösterimi */}
                {(customStartDate || customEndDate) && (
                  <View style={styles.selectedDateRange}>
                    <Text style={styles.selectedDateLabel}>Seçilen Tarih Aralığı:</Text>
                    <Text style={styles.selectedDateText}>
                      {customStartDate ? new Date(customStartDate).toLocaleDateString('tr-TR') : '---'} 
                      {' - '}
                      {customEndDate ? new Date(customEndDate).toLocaleDateString('tr-TR') : '---'}
                    </Text>
                    <TouchableOpacity 
                      style={styles.clearButton}
                      onPress={() => {
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                    >
                      <Text style={styles.clearButtonText}>Temizle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowCustomDatePicker(false);
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>İptal</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.applyButton, 
                    (!customStartDate || !customEndDate) && styles.disabledButton
                  ]}
                  disabled={!customStartDate || !customEndDate}
                  onPress={() => {
                    setViewMode('custom');
                    setShowCustomDatePicker(false);
                  }}
                >
                  <Text style={styles.applyButtonText}>Uygula</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Sipariş Detay Modalı */}
        <Modal
          visible={orderDetailModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setOrderDetailModalVisible(false)}
        >
          <View style={styles.detailModalOverlay}>
            <View style={styles.detailModalContent}>
              <View style={styles.detailModalPadding}>
                {selectedOrder && (
                  <>
                    <View style={styles.detailModalHeader}>
                      <View>
                        <Text style={styles.detailModalTitle}>Sipariş #{selectedOrder.id}</Text>
                        <Text style={styles.detailModalSubtitle}>
                          {new Date(selectedOrder.created_at).toLocaleDateString("tr-TR", { 
                            day: "numeric", 
                            month: "long", 
                            year: "numeric",
                            hour: "2-digit", 
                            minute: "2-digit",
                            timeZone: 'UTC'
                          })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setOrderDetailModalVisible(false)}
                        style={styles.detailModalCloseButton}
                      >
                        <Ionicons name="close" size={24} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    {/* Sipariş Durumu */}
                    <View style={styles.statusContainer}>
                      <Text style={styles.statusText}>Teslim Edildi</Text>
                    </View>

                    {/* Sipariş Detayları */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Sipariş Bilgileri</Text>
                      
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Başlık:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.title}</Text>
                      </View>
                      
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Mahalle:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.mahalle}</Text>
                      </View>
                      
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Kurye:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.kurye_adi || 'Atanmamış'}</Text>
                      </View>
                      
                      {selectedOrder.courier_phone && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Kurye Tel:</Text>
                          <Text style={styles.detailValue}>{selectedOrder.courier_phone}</Text>
                        </View>
                      )}
                    </View>

                    {/* Ödeme Bilgileri */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Ödeme Bilgileri</Text>
                      
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Ödeme Türü:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.odeme_tipi}</Text>
                      </View>
                      
                      {selectedOrder.nakit_tutari > 0 && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Nakit:</Text>
                          <Text style={styles.detailValue}>{parseFloat(String(selectedOrder.nakit_tutari).replace(',', '.')).toFixed(2)} ₺</Text>
                        </View>
                      )}
                      
                      {selectedOrder.banka_tutari > 0 && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Kredi Kartı:</Text>
                          <Text style={styles.detailValue}>{parseFloat(String(selectedOrder.banka_tutari).replace(',', '.')).toFixed(2)} ₺</Text>
                        </View>
                      )}
                      
                      {selectedOrder.hediye_tutari > 0 && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Hediye Çeki:</Text>
                          <Text style={styles.detailValue}>{parseFloat(String(selectedOrder.hediye_tutari).replace(',', '.')).toFixed(2)} ₺</Text>
                        </View>
                      )}
                      

                      
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Kurye Ücreti:</Text>
                        <Text style={styles.courierFeeValue}>{parseFloat(String(selectedOrder.kurye_tutari).replace(',', '.')).toFixed(2)} ₺</Text>
                      </View>
                    </View>

                    {/* Sipariş Resmi */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Sipariş Resmi</Text>
                      {selectedOrder.resim ? (
                        <Image 
                          source={{ uri: selectedOrder.resim }} 
                          style={styles.orderImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.noImageContainer}>
                          <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                          <Text style={styles.noImageText}>Resim bulunmuyor</Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  viewModeContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viewModeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeViewMode: {
    backgroundColor: '#8B5CF6',
  },
  viewModeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeViewModeText: {
    color: '#FFFFFF',
  },
  dailyDateSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dateDisplay: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: 'bold',
  },

  courierRow: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    borderBottomWidth: 0,
  },
  courierLabel: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  courierValue: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  orderCountLabel: {
    fontSize: 18,
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  orderCountValue: {
    fontSize: 18,
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  ordersContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  deliveredTitle: {
    color: '#047857',
  },
  orderItem: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#065F46',
    flex: 1,
  },
  orderDate: {
    fontSize: 14,
    color: '#047857',
  },
  orderDetails: {
    marginBottom: 6,
  },
  orderAddress: {
    fontSize: 12,
    color: '#059669',
  },
  courierNameText: {
    fontSize: 12,
    color: '#059669',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentType: {
    fontSize: 12,
    color: '#065F46',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  courierPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  ordersList: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginVertical: 10,
  },
  retryButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  dateInputContainer: {
    marginBottom: 20,
  },
  dateInputWrapper: {
    marginBottom: 16,
  },
  dateInputLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  dateInputButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
    position: 'relative',
  },
  dateInputValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'left',
    width: '100%',
  },
  embeddedPickerContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
  },
  overlayButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
  },
  selectedDateRange: {
    backgroundColor: '#EDE9FE',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    marginTop: 12,
  },
  selectedDateLabel: {
    fontSize: 14,
    color: '#6B46C1',
    marginBottom: 4,
    fontWeight: '600',
  },
  selectedDateText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '600',
    marginBottom: 8,
  },
  clearButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  applyButton: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
  },
  // Detay modal styles
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
  statusContainer: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginBottom: 24,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#059669",
  },
  detailSection: {
    marginBottom: 24,
  },
  detailSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  detailLabel: {
    fontSize: 14,
    color: "#6B7280",
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    flex: 2,
    textAlign: "right",
  },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: "#E5E7EB",
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#059669",
  },
  courierFeeValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#DC2626",
  },
  orderImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginTop: 8,
  },
  noImageContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  noImageText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 8,
  },
});

export default RestaurantOrders;
