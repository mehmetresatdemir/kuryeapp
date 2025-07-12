import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Linking,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import io from "socket.io-client";
import { useFocusEffect } from "expo-router";
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

const RestaurantLiveMap = () => {
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [expandedBubble, setExpandedBubble] = useState<string | null>(null);
  const socketRef = useRef<any>(null);
  const lastUpdateRef = useRef<number>(0);
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

  // Set up socket connection and subscribe to active orders and location updates.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      const firmId = user.publicMetadata?.firmId || user.id;
      
      setCourierLocations([]);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      socketRef.current = io(API_CONFIG.SOCKET_URL, { transports: ["websocket"] });
      socketRef.current.on("connect", () => {
        console.log(`🔌 Restoran socket bağlandı - FirmID: ${firmId}`);
        
        // Otomatik olarak aktif siparişleri iste
        socketRef.current.emit("requestActiveOrders", { firmId });
        
        // Restoran odasına katıl
        socketRef.current.emit("joinRestaurantRoom", { restaurantId: firmId });
        
        setIsLoading(false);
      });
      socketRef.current.on("connect_error", (err: any) => {
        console.error("Socket connection error:", err);
        Alert.alert("Hata", "Socket bağlantısı kurulamadı.");
        setIsLoading(false);
      });
      socketRef.current.on("activeOrders", (data: any) => {
        if (data && data.length > 0) {
          const locations = data.map((order: any) => ({
            courierId: order.kuryeid,
            orderId: order.id,
            latitude: order.latitude,
            longitude: order.longitude,
            firmaid: order.firmaid,
            phone: order.phone,
            courier_name: order.courier_name,
            courier_phone: order.courier_phone,
          }));
          setCourierLocations(locations);
        } else {
          setCourierLocations([]);
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
          
          if (index !== -1) {
            const newLocations = [...prevLocations];
            newLocations[index] = updatedLocation;
            return newLocations;
          } else {
            return [...prevLocations, updatedLocation];
          }
        });
      });
      socketRef.current.on("trackingEnded", (data: any) => {
        if (data && data.orderId) {
          setCourierLocations((prevLocations) =>
            prevLocations.filter((loc) => loc.orderId !== data.orderId)
          );
        }
      });

      // Sipariş durumu değişikliklerini dinle
      socketRef.current.on("orderStatusUpdate", (data: any) => {
        console.log(`📋 Sipariş durumu güncellendi:`, data);
        // Sipariş durumu değiştiğinde aktif siparişleri tekrar al
        socketRef.current.emit("requestActiveOrders", { firmId });
      });

      socketRef.current.on("orderAccepted", (data: any) => {
        console.log(`✅ Sipariş kabul edildi:`, data);
        // Yeni sipariş kabul edildiğinde aktif siparişleri güncelle
        socketRef.current.emit("requestActiveOrders", { firmId });
      });

      socketRef.current.on("orderDelivered", (data: any) => {
        console.log(`📦 Sipariş teslim edildi:`, data);
        // Sipariş teslim edildiğinde aktif siparişleri güncelle
        socketRef.current.emit("requestActiveOrders", { firmId });
      });

      // Periyodik güncelleme - 30 saniyede bir aktif siparişleri kontrol et
      const intervalId = setInterval(() => {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("requestActiveOrders", { firmId });
        }
      }, 30000);

      return () => {
        clearInterval(intervalId);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }, [user])
  );

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
          edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
          animated: true,
        });
      }
    } else if (mapRef.current && userLocation) {
      // Kurye yoksa restoran konumunu göster
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
  }, [courierLocations, userLocation]);

  // Kurye konumları değiştiğinde otomatik fit yap
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fitAllCouriers();
    }, 500); // 500ms bekle, ardından fit yap
    
    return () => clearTimeout(timeoutId);
  }, [courierLocations, fitAllCouriers]);

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
            <Text style={styles.headerTitle}>
              Canlı Kurye Takibi
            </Text>
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
              <Text style={styles.fitAllButtonText}>Tümünü Göster</Text>
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
            initialRegion={{
              latitude: userLocation ? userLocation.latitude : 37.06622,
              longitude: userLocation ? userLocation.longitude : 37.38332,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
          >
            {courierLocations.map((loc) => {
              if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
                return (
                  <Marker
                    key={`${loc.orderId}-${loc.courierId}`}
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
              const bubbleKey = `${loc.courierId}-${loc.orderId}`;
              const isExpanded = expandedBubble === bubbleKey;
              
              return (
                <TouchableOpacity
                  key={`${bubbleKey}-${index}`}
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
                        {loc.timestamp && (
                          <Text style={styles.timestampText}>
                            Son güncelleme: {new Date(loc.timestamp).toLocaleTimeString('tr-TR')}
                          </Text>
                        )}
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

          {/* Konuma Git Butonu */}
          <TouchableOpacity
            style={styles.locationButton}
            onPress={centerOnUser}
          >
                          <Ionicons name="locate" size={24} color="#8B5CF6" />
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
    top: 96,
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
});
