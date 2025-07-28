import React, { useState, useEffect, Fragment, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Modal,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from "@expo/vector-icons";
import { getFullUrl, API_ENDPOINTS, authedFetch, API_CONFIG } from "../../constants/api";
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCurrentDate, getCurrentWeek, getCurrentMonth, getWeekStart, getCurrentDateTime } from "../../lib/timeUtils";
import io from "socket.io-client";
import { useFocusEffect } from "expo-router";


interface DeliveredOrder {
  id: string;
  created_at: string;
  delivered_at?: string;
  approved_at?: string;
  actual_completion_time?: string;
  courier_price: string;
  nakit_tutari: string;
  banka_tutari: string;
  hediye_tutari: string;
  title: string;
  odeme_tipi: string;
  firma_adi: string;
  mahalle: string;
  resim: string;
}

const KuryeEarnings = () => {
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  
  // Socket ref for real-time updates
  const socketRef = useRef<any>(null);
  
  // Görünüm modları
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDate());
  
  // Özel tarih aralığı için state'ler
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState<boolean>(false);

  // Date picker state'leri
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end'>('start');
  const [tempDate, setTempDate] = useState(new Date());
  
  // Order detail modal
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveredOrder | null>(null);
  


  // Error handling
  const [error, setError] = useState<string | null>(null);

  // Toplam değerleri hesapla
  const totals = deliveredOrders.reduce((acc, curr) => {
    const odemeTipi = curr.odeme_tipi?.toLowerCase() || '';
    const courierPrice = parseFloat(String(curr.courier_price || 0).replace(',', '.')) || 0;

    acc.kurye += courierPrice;
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



  // View mode değiştiğinde selectedDate'i uygun şekilde ayarla
  const handleViewModeChange = (newMode: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    console.log(`🔄 KuryeEarnings: View mode changing from ${viewMode} to ${newMode}`);
    
    if (newMode === 'weekly' && viewMode !== 'weekly') {
      // Haftalık moda geçerken bu haftanın başlangıcını ayarla (Turkey timezone)
      const weekStart = getCurrentWeek();
      console.log(`📅 Setting weekly date to: ${weekStart}`);
      setSelectedDate(weekStart);
    } else if (newMode === 'daily' && viewMode !== 'daily') {
      // Günlük moda geçerken bugünü ayarla (Turkey timezone)
      const today = getCurrentDate();
      console.log(`📅 Setting daily date to: ${today}`);
      setSelectedDate(today);
    } else if (newMode === 'monthly' && viewMode !== 'monthly') {
      // Aylık moda geçerken bu ayın 1'ini ayarla (Turkey timezone)
      const monthStart = getCurrentMonth();
      console.log(`📅 Setting monthly date to: ${monthStart}`);
      setSelectedDate(monthStart);
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
        const weekStartStr = getWeekStart(selectedDate);
        endpoint = `?week=${weekStartStr}`;
      } else if (viewMode === 'monthly') {
        const monthStr = selectedDate.length > 7 ? selectedDate.slice(0, 7) : selectedDate;
        endpoint = `?date=${monthStr}`;
      } else if (viewMode === 'custom' && customStartDate && customEndDate) {
        endpoint = `?start=${customStartDate}&end=${customEndDate}`;
      }
      
      // Teslim edilen siparişleri getir
      const deliveredResponse = await authedFetch(getFullUrl(API_ENDPOINTS.DELIVERED_ORDERS_COURIER(user.id, endpoint)));
      
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
  }, [user, selectedDate, viewMode, customStartDate, customEndDate]);

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
  }, [isLoaded, user, selectedDate, viewMode, fetchData]);

  // Custom mode için ayrı useEffect
  useEffect(() => {
    if (isLoaded && user && viewMode === 'custom' && customStartDate && customEndDate) {
      fetchData();
    }
  }, [isLoaded, user, viewMode, customStartDate, customEndDate, fetchData]);

  // Socket bağlantısı ve real-time güncellenme
  useEffect(() => {
    if (!user) return;

    console.log("🔌 KuryeEarnings: Socket bağlantısı kuruluyor");
    socketRef.current = io(API_CONFIG.SOCKET_URL, { 
      transports: ["websocket", "polling"],
      forceNew: true,
      timeout: 45000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    socketRef.current.on("connect", async () => {
      console.log("🔌 KuryeEarnings: Socket bağlandı - Kurye ID:", user.id);
      
      // Get user token for session management
      const token = await AsyncStorage.getItem('userToken');
      
      // Join courier room to receive real-time updates
      socketRef.current.emit("joinCourierRoom", { courierId: user.id, token });
      console.log(`📡 KuryeEarnings: Kurye odasına katıldı: courier_${user.id}`);
    });

    // Listen for order approval confirmations - refresh earnings when order is approved
    socketRef.current.on("orderApproved", (data: { orderId: string, restaurantId: string, message: string, orderDetails: any }) => {
      console.log("✅ KuryeEarnings: Order approved event received:", data);
      
      // Refresh earnings data when an order is approved (completed)
      fetchData();
    });

    // Listen for order delivery confirmations - refresh earnings when order is delivered
    socketRef.current.on("orderDelivered", (data: { orderId: string, courierId: string, message: string }) => {
      console.log("📦 KuryeEarnings: Order delivered event received:", data);
      
      // Refresh earnings data when an order is delivered
      if (data.courierId.toString() === user.id.toString()) {
        fetchData();
      }
    });

    // Listen for order status updates that might affect earnings
    socketRef.current.on("orderStatusUpdate", (data: { orderId: string, status: string, courierId?: string }) => {
      console.log("📡 KuryeEarnings: Order status update received:", data);
      
      // Refresh earnings if order status changes to 'teslim edildi' for this courier
      if (data.status === "teslim edildi" && data.courierId?.toString() === user.id.toString()) {
        fetchData();
      }
    });

    socketRef.current.on("connect_error", (err: any) => {
      console.error("KuryeEarnings Socket connection error:", err);
    });

    socketRef.current.on("disconnect", (reason: string) => {
      console.log("KuryeEarnings Socket disconnected:", reason);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log("🔌 KuryeEarnings: Socket bağlantısı kapatıldı");
      }
    };
  }, [user, fetchData]);

  // Screen focus/blur events
  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log("KuryeEarnings: Screen focused, refreshing data");
        fetchData();
      }
    }, [user, fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Günler/haftalar arası geçiş
  const handleDateChange = (direction: number) => {
    if (viewMode === 'daily') {
      const currentDate = new Date(selectedDate + 'T12:00:00Z'); // Gün ortası kullan
      currentDate.setUTCDate(currentDate.getUTCDate() + direction);
      const newDate = currentDate.toISOString().slice(0, 10);
      const today = getCurrentDate();
      
      if (direction > 0 && newDate > today) return;
      setSelectedDate(newDate);
    } else if (viewMode === 'weekly') {
      // Haftalık modda 7 gün ekle/çıkar
      const currentDate = new Date(selectedDate + 'T12:00:00Z');
      currentDate.setUTCDate(currentDate.getUTCDate() + (direction * 7));
      const newDate = currentDate.toISOString().slice(0, 10);
      setSelectedDate(newDate);
    } else if (viewMode === 'monthly') {
      // Aylık modda ay ekle/çıkar - tarih parse problemini çöz
      const dateParts = selectedDate.split('-');
      if (dateParts.length >= 2) {
        let year = parseInt(dateParts[0]);
        let month = parseInt(dateParts[1]);
        
        month += direction;
        
        // Ay sınırlarını kontrol et
        if (month > 12) {
          year += Math.floor((month - 1) / 12);
          month = ((month - 1) % 12) + 1;
        } else if (month < 1) {
          year += Math.floor((month - 12) / 12);
          month = ((month - 1) % 12) + 12;
        }
        
        const newDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const today = getCurrentDateTime();
        const newDateObj = new Date(newDate + 'T12:00:00Z');
        
        // Gelecek aya gitmeyi engelle
        if (direction > 0 && newDateObj > today) return;
        setSelectedDate(newDate);
      }
    }
  };

  // Date picker handlers
  const openDatePicker = (mode: 'start' | 'end') => {
    setDatePickerMode(mode);
    let currentDate;
    
    if (mode === 'start') {
      // Başlangıç için: Eğer daha önce seçilmişse o tarihi, yoksa bugünü göster
      currentDate = customStartDate ? new Date(customStartDate) : new Date();
    } else {
      // Bitiş için: Eğer daha önce seçilmişse o tarihi, yoksa başlangıç tarihini göster
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
      // Temp date'i hemen güncelle (picker'da görünsün diye)
      setTempDate(selectedDate);
      
      if (event.type !== 'dismissed') {
        const dateString = selectedDate.toISOString().slice(0, 10);
        
        if (datePickerMode === 'start') {
          setCustomStartDate(dateString);
          // Eğer bitiş tarihi başlangıçtan önce ise sıfırla
          if (customEndDate && dateString > customEndDate) {
            setCustomEndDate('');
          }
        } else {
          setCustomEndDate(dateString);
        }
        
        // Tarih seçildikten sonra picker'ı kapat
        setShowDatePicker(false);
      }
    }
    
    // Android'de picker otomatik kapanır veya dismissed durumunda
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
        const weekStartStr = getWeekStart(selectedDate);
        const weekStart = new Date(weekStartStr + 'T12:00:00');
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        return `${weekStart.toLocaleDateString('tr-TR', { 
          day: 'numeric', 
          month: 'short'
        })} - ${weekEnd.toLocaleDateString('tr-TR', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric'
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
                (viewMode === 'daily' && selectedDate >= getCurrentDate()) ||
                (viewMode === 'monthly' && new Date(selectedDate).getMonth() >= new Date().getMonth() && new Date(selectedDate).getFullYear() >= new Date().getFullYear())
              }
            >
              <Ionicons 
                name="chevron-forward" 
                size={24} 
                color={
                  (viewMode === 'daily' && selectedDate >= getCurrentDate()) ||
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
      <View style={styles.content}>
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={24} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
              <Text style={styles.retryButtonText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={deliveredOrders}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.orderItem}
                onPress={() => {
                  setSelectedOrder(item);
                  setShowOrderDetail(true);
                }}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderTitle}>{item.firma_adi}</Text>
                  <Text style={styles.orderDate}>
                    {item.actual_completion_time 
                      ? new Date(item.actual_completion_time).toLocaleDateString('tr-TR')
                      : new Date(item.created_at).toLocaleDateString('tr-TR')
                    }
                  </Text>
                </View>
                <View style={styles.orderDetails}>
                  <Text style={styles.orderIdText}>Sipariş ID: {item.id}</Text>
                  <Text style={styles.orderAddress}>{item.mahalle}</Text>
                </View>
                <View style={styles.orderFooter}>
                  <Text style={styles.paymentType}>{item.odeme_tipi}</Text>
                  <Text style={styles.courierPrice}>{item.courier_price} ₺</Text>
                </View>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            style={styles.ordersList}
            ListHeaderComponent={
              <Fragment>
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
                    <Text style={styles.courierLabel}>Toplam Kurye Kazancı</Text>
                    <Text style={styles.courierValue}>{totals.kurye.toFixed(2)} ₺</Text>
                  </View>
                </View>



                {/* Geçmiş Siparişler */}
                <View style={[styles.ordersContainer, { padding: 0, shadowColor: 'transparent', elevation: 0 }]}>
                  <Text style={[styles.sectionTitle, styles.deliveredTitle]}>Geçmiş Siparişler ({deliveredOrders.length})</Text>
                  {deliveredOrders.length === 0 && (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
                      <Text style={styles.emptyTitle}>Veri Bulunamadı</Text>
                      <Text style={styles.emptySubtitle}>Seçili dönem için sipariş bulunmuyor.</Text>
                    </View>
                  )}
                </View>
              </Fragment>
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#8B5CF6"]}
                tintColor="#8B5CF6"
              />
            }
          />
        )}
      </View>

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
              <TouchableOpacity                 onPress={() => {
                  setShowCustomDatePicker(false);
                  // Seçilen tarihleri sıfırla
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
                  // Seçilen tarihleri sıfırla
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

      {/* Order Detail Modal */}
      <Modal
        visible={showOrderDetail}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowOrderDetail(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.orderDetailModal}>
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Sipariş Detayları</Text>
                <TouchableOpacity onPress={() => setShowOrderDetail(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

              {selectedOrder && (
                <View style={styles.orderDetailContent}>
                {/* Order Image */}
                {selectedOrder.resim && (
                  <View style={styles.orderImageContainer}>
                    <Text style={styles.orderDetailLabel}>Sipariş Resmi:</Text>
                    <View style={styles.orderImageWrapper}>
                      <Text style={styles.orderImagePlaceholder}>📷 Resim Mevcut</Text>
                </View>
                  </View>
                )}
                
                {/* Order Info */}
                <View style={styles.orderDetailRow}>
                  <Text style={styles.orderDetailLabel}>Sipariş:</Text>
                  <Text style={styles.orderDetailValue}>{selectedOrder.title}</Text>
                  </View>
                
                <View style={styles.orderDetailRow}>
                  <Text style={styles.orderDetailLabel}>Restoran:</Text>
                  <Text style={styles.orderDetailValue}>{selectedOrder.firma_adi}</Text>
              </View>

                <View style={styles.orderDetailRow}>
                  <Text style={styles.orderDetailLabel}>Adres:</Text>
                  <Text style={styles.orderDetailValue}>{selectedOrder.mahalle}</Text>
                  </View>
                  
                <View style={styles.orderDetailRow}>
                  <Text style={styles.orderDetailLabel}>Sipariş Tarihi:</Text>
                  <Text style={styles.orderDetailValue}>
                    {new Date(selectedOrder.created_at).toLocaleDateString('tr-TR')} - {new Date(selectedOrder.created_at).toLocaleTimeString('tr-TR')}
                  </Text>
                </View>

                <View style={styles.orderDetailRow}>
                  <Text style={styles.orderDetailLabel}>Teslim Saati:</Text>
                  <Text style={styles.orderDetailValue}>
                    {selectedOrder.actual_completion_time 
                      ? new Date(selectedOrder.actual_completion_time).toLocaleDateString('tr-TR') + ' - ' + new Date(selectedOrder.actual_completion_time).toLocaleTimeString('tr-TR')
                      : 'Henüz teslim edilmemiş'
                    }
                  </Text>
                </View>
                    
                <View style={styles.orderDetailRow}>
                  <Text style={styles.orderDetailLabel}>Ödeme Tipi:</Text>
                  <Text style={styles.paymentTypeBadge}>{selectedOrder.odeme_tipi}</Text>
                    </View>
                    
                {/* Payment Details */}
                <View style={styles.paymentDetailsContainer}>
                  <Text style={styles.paymentDetailsTitle}>Ödeme Detayları</Text>
                  
                  {selectedOrder.nakit_tutari && parseFloat(selectedOrder.nakit_tutari) > 0 && (
                    <View style={styles.paymentDetailRow}>
                      <Text style={styles.paymentDetailLabel}>Nakit Tutarı:</Text>
                      <Text style={styles.paymentDetailValue}>{selectedOrder.nakit_tutari} ₺</Text>
                    </View>
                  )}
                  
                  {selectedOrder.banka_tutari && parseFloat(selectedOrder.banka_tutari) > 0 && (
                    <View style={styles.paymentDetailRow}>
                      <Text style={styles.paymentDetailLabel}>Banka/Kart Tutarı:</Text>
                      <Text style={styles.paymentDetailValue}>{selectedOrder.banka_tutari} ₺</Text>
                    </View>
                  )}
                  
                  {selectedOrder.hediye_tutari && parseFloat(selectedOrder.hediye_tutari) > 0 && (
                    <View style={styles.paymentDetailRow}>
                      <Text style={styles.paymentDetailLabel}>Hediye Çeki:</Text>
                      <Text style={styles.paymentDetailValue}>{selectedOrder.hediye_tutari} ₺</Text>
                </View>
              )}

                  <View style={[styles.paymentDetailRow, styles.courierEarningRow]}>
                    <Text style={styles.courierEarningLabel}>Kurye Kazancı:</Text>
                    <Text style={styles.courierEarningValue}>{selectedOrder.courier_price} ₺</Text>
                  </View>
                </View>
              </View>
            )}
            </ScrollView>
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
  totalCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },

  totalSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  detailsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
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
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailTitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  detailCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B5CF6',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
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
  dateInputLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  dateInputValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'left',
    width: '100%',
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
  quickSelectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  quickSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  quickSelectItem: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: '48%',
    alignItems: 'center',
  },
  quickSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  manualDateContainer: {
    marginBottom: 20,
  },
  datePickerContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  dateInputWrapper: {
    marginBottom: 16,
  },
  inlinePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  embeddedPickerContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
  },
  dateValueButton: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'stretch',
    borderRadius: 8,
  },
  overlayButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
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
  totalRow: {
    borderBottomWidth: 2,
    borderBottomColor: '#8B5CF6',
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    color: '#8B5CF6',
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 18,
    color: '#8B5CF6',
    fontWeight: 'bold',
  },
  courierRow: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    borderBottomWidth: 0,
  },
  courierLabel: {
    fontSize: 16,
    color: '#059669',
    fontWeight: 'bold',
  },
  courierValue: {
    fontSize: 16,
    color: '#059669',
    fontWeight: 'bold',
  },
  pendingContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
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
  orderRestaurant: {
    fontSize: 14,
    color: '#047857',
    fontWeight: '500',
  },
  orderAddress: {
    fontSize: 12,
    color: '#059669',
  },
  orderIdText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 2,
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
    color: '#059669',
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
  ordersList: {
    flex: 1,
  },
  orderDetailModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: 400,
    width: '100%',
  },
  modalScrollContent: {
    padding: 20,
  },
  orderDetailContent: {
    flex: 1,
    paddingBottom: 20,
  },
  orderImageContainer: {
    marginBottom: 16,
  },
  orderImageWrapper: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  orderImagePlaceholder: {
    fontSize: 16,
    color: '#6B7280',
  },
  orderDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  orderDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },
  orderDetailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  paymentTypeBadge: {
    fontSize: 12,
    color: '#8B5CF6',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    textAlign: 'center',
  },
  paymentDetailsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  paymentDetailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  paymentDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  paymentDetailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  courierEarningRow: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  courierEarningLabel: {
    fontSize: 14,
    color: '#059669',
    fontWeight: 'bold',
  },
  courierEarningValue: {
    fontSize: 14,
    color: '#059669',
    fontWeight: 'bold',
  },
  deliveredTitle: {
    color: '#047857',
  },
});

export default KuryeEarnings;

