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
} from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import io from "socket.io-client";

interface Order {
  firmaid: string;
  id: string;
  created_at: string;
  title: string;
  kurye_tutari: number;
  status: string;
  mahalle: string;
  odeme_yontemi: string;
  firma_adi: string;
  resim?: string;
}

export default function WaitingOrdersScreen() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  if (!isLoaded || !user) return <Text>Loading...</Text>;

  const courierId = user.id;
  // Firma ID'sini, eğer varsa user.publicMetadata.firmId, yoksa user.id kullanın.
  const firmId = user.publicMetadata?.firmId || user.id;

  const [orders, setOrders] = useState<Order[]>([]);
  const [acceptedOrders, setAcceptedOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [trackingStarted, setTrackingStarted] = useState(false);

  // Tek bir socket bağlantısı için ref (ekran süresince açık kalsın)
  const socketRef = useRef<any>(null);
  // Konum takibi aboneliği ref
  const trackingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  // Accepted orders poll (aktif siparişler) – her 5 saniyede bir
  const fetchAcceptedOrders = async () => {
    try {
      const response = await fetch(`https://red.enucuzal.com/api/neworders/active/${courierId}`);
      if (response.ok) {
        const data = await response.json();
        setAcceptedOrders(data.data);
      } else {
        setAcceptedOrders([]);
      }
    } catch (error) {
      setAcceptedOrders([]);
    }
  };

  // Bekleyen siparişleri çek (status "bekleniyor")
  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("https://red.enucuzal.com/api/neworders/status");
      if (response.status === 404) {
        setOrders([]);
        setError(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const waitingOrders = data.data.filter((order: Order) => order.status === "bekleniyor");
      waitingOrders.sort(
        (a: Order, b: Order) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(waitingOrders);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Siparişler çekilirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (courierId) fetchOrders();
  }, [courierId]);

  useFocusEffect(
    useCallback(() => {
      if (isLoaded && user) {
        fetchOrders();
      }
    }, [isLoaded, user])
  );

  // Tek bir socket bağlantısı oluşturun – ekran açıldığında
  useEffect(() => {
    socketRef.current = io("https://red.enucuzal.com", { transports: ["websocket"] });
    socketRef.current.on("connect_error", (err: any) => {
      console.error("Socket connection error:", err);
    });
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Poll accepted orders every 5 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchAcceptedOrders();
    }, 5000);
    return () => clearInterval(intervalId);
  }, [courierId]);

  // Start or stop location tracking based on acceptedOrders
  useEffect(() => {
    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Konum izni reddedildi");
        return;
      }
      trackingSubscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 1 },
        (loc) => {
          // Her konum güncellemesinde, tüm aktif siparişler için locationUpdate event'i gönder
          acceptedOrders.forEach((order) => {
            if (socketRef.current) {
              socketRef.current.emit("locationUpdate", {
                courierId,
                orderId: order.id,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                // Siparişin firmaid'si varsa onu, yoksa firmId kullanıyoruz
                firmaid: order.firmaid || firmId,
              });
            }
          });
        }
      );
      setTrackingStarted(true);
    };

    const stopTracking = () => {
      if (trackingSubscriptionRef.current) {
        trackingSubscriptionRef.current.remove();
        trackingSubscriptionRef.current = null;
      }
      setTrackingStarted(false);
    };

    if (acceptedOrders.length > 0 && !trackingStarted) {
      startTracking();
    }
    if (acceptedOrders.length === 0 && trackingStarted) {
      stopTracking();
    }
  }, [acceptedOrders, trackingStarted, courierId, firmId]);

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const acceptSelectedOrders = async () => {
    if (selectedOrders.length === 0) {
      Alert.alert("Lütfen en az bir sipariş seçin.");
      return;
    }
    try {
      const response = await fetch("https://red.enucuzal.com/api/neworders/accept", {
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
        console.error("Server error:", errorBody);
        throw new Error("Sipariş kabul edilirken hata oluştu.");
      }
      Alert.alert("Siparişler başarıyla kabul edildi.");
      fetchOrders();
      setSelectedOrders([]);
    } catch (error) {
      console.error(error);
      Alert.alert("Sipariş kabul edilirken hata oluştu.");
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const isSelected = selectedOrders.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.orderItem, isSelected && styles.selectedOrderItem]}
        onPress={() => toggleSelectOrder(item.id)}
      >
        <Text style={styles.orderTitle}>Sipariş #{item.id}</Text>
        <Text>{item.title}</Text>
        <Text>Kurye Tutarı: {item.kurye_tutari} TL</Text>
        <Text>Mahalle: {item.mahalle}</Text>
        <Text>Ödeme Yöntemi: {item.odeme_yontemi}</Text>
        <Text>Firma Adı: {item.firma_adi}</Text>
        <Text>Durum: {item.status}</Text>
        {item.resim && (
          <Image source={{ uri: item.resim }} style={styles.orderImage} />
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>Bekleyen sipariş bulunmamaktadır.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          fetchOrders().then(() => setRefreshing(false));
        }} />}
      />
      {selectedOrders.length > 0 && (
        <View style={styles.bottomContainer}>
          <Text style={styles.selectedIdsText}>
            Seçilen Sipariş ID'leri: {selectedOrders.join(", ")}
          </Text>
          <TouchableOpacity style={styles.acceptAllButton} onPress={acceptSelectedOrders}>
            <Text style={styles.acceptAllButtonText}>Seçilen Siparişleri Kabul Et</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  listContainer: { padding: 16 },
  orderItem: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  selectedOrderItem: { borderColor: "#4CAF50", backgroundColor: "#e8f5e9" },
  orderTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  emptyText: { textAlign: "center", marginTop: 20, fontSize: 16 },
  orderImage: { width: 100, height: 100, marginTop: 10 },
  bottomContainer: { padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#ddd" },
  selectedIdsText: { fontSize: 16, marginBottom: 8, textAlign: "center" },
  acceptAllButton: { backgroundColor: "#4CAF50", padding: 16, borderRadius: 8, alignItems: "center" },
  acceptAllButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "red", fontSize: 16 },
});

