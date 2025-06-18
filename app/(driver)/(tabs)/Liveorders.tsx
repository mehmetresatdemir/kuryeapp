
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import io from "socket.io-client";
import MapView, { Marker } from "react-native-maps";

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

    socketRef.current = io("https://red.enucuzal.com", { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      orders.forEach(order => {
        socketRef.current.emit("joinOrder", { orderId: order.id });
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
        { accuracy: Location.Accuracy.Highest, timeInterval: 5000, distanceInterval: 1 },
        (loc) => {
          orders.forEach(order => {
            socketRef.current.emit("locationUpdate", {
              courierId,
              orderId: order.id,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              // Driver uygulamasında gönderilen firmaid de eklenmeli:
              firmaid: order.firmaid, // siparişin firmaid'si, veritabanındaki değeri
            });
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

const ActiveOrdersScreen = () => {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  if (!isLoaded || !user) return <Text>Loading...</Text>;

  const courierId = user.id;
  // Firma ID'sini doğru belirleyin: eğer user.publicMetadata.firmId varsa onu kullanın, yoksa user.id
  const firmId = user.publicMetadata?.firmId || user.id;

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const socketRef = useRef<any>(null);

  const fetchActiveOrders = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`https://red.enucuzal.com/api/neworders/active/${courierId}`);
      if (response.status === 404) {
        setActiveOrders([]);
        setError(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setActiveOrders(data.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching active orders:", err);
      setError("Aktif siparişler alınırken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (courierId) fetchActiveOrders();
  }, [courierId]);

  useFocusEffect(
    React.useCallback(() => {
      fetchActiveOrders();
    }, [courierId])
  );

  // Socket bağlantısı: aktif siparişlerin konumları için
  useEffect(() => {
    socketRef.current = io("https://red.enucuzal.com", { transports: ["websocket"] });
    socketRef.current.on("connect", () => {});
    socketRef.current.on("locationUpdate", (data: any) => {
      if (!data || !data.orderId) return;
      // Ekstra kontrol: payload'da firmaid varsa ve bizim firmId'mizle eşleşmiyorsa atla.
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
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [firmId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchActiveOrders();
    setRefreshing(false);
  };

  const deliverOrder = async () => {
    if (!selectedOrder) return;
    try {
      const response = await fetch("https://red.enucuzal.com/api/neworders/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          courierId,
          newStatus: "teslim edildi",
        }),
      });
      if (!response.ok) throw new Error("Sipariş teslim edilirken hata oluştu.");
      fetchActiveOrders();
      setSelectedOrder(null);
    } catch (error) {
      // Hata mesajı gösterilebilir
    }
  };

  const cancelOrder = async () => {
    if (!selectedOrder) return;
    try {
      const response = await fetch("https://red.enucuzal.com/api/neworders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          courierId,
          newStatus: "bekleniyor",
        }),
      });
      if (!response.ok) throw new Error("Sipariş iptal edilirken hata oluştu.");
      fetchActiveOrders();
      setSelectedOrder(null);
    } catch (error) {
      // Hata mesajı gösterilebilir
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const isSelected = selectedOrder?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.orderItem, isSelected && styles.selectedOrderItem]}
        onPress={() => setSelectedOrder(item)}
      >
        <Text style={styles.orderTitle}>Sipariş #{item.id}</Text>
        <Text>{item.title}</Text>
        <Text>Kurye Tutarı: {item.kurye_tutari} TL</Text>
        <Text>Mahalle: {item.mahalle}</Text>
        <Text>Ödeme Yöntemi: {item.odeme_yontemi}</Text>
        <Text>Firma Adı: {item.firma_adi}</Text>
        <Text>Status: {item.status}</Text>
        {item.resim && (
          <Image source={{ uri: item.resim }} style={styles.orderImage} />
        )}
      </TouchableOpacity>
    );
  };

  // Sadece "kuryede" olan siparişleri ayrı olarak takip ediyoruz
  const kuryedeOrders = activeOrders.filter(order => order.status === "kuryede");

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Aktif Siparişler</Text>
      <FlatList
        data={activeOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>Aktif sipariş bulunamadı.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      {selectedOrder && (
        <>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={deliverOrder}>
              <Text style={styles.buttonText}>Siparişi Teslim Et</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={cancelOrder}>
              <Text style={styles.buttonText}>Siparişi İptal Et</Text>
            </TouchableOpacity>
          </View>
          {selectedOrder.status === "kuryede" && (
            <Text style={{ textAlign: "center", marginVertical: 8 }}>
              Seçilen siparişin konum takibi aktif.
            </Text>
          )}
        </>
      )}

      {kuryedeOrders.length > 0 && (
        <AutoCourierTracking courierId={courierId} orders={kuryedeOrders} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f5f5f5" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "red", fontSize: 16 },
  listContainer: { paddingBottom: 20 },
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
  buttonContainer: { flexDirection: "row", justifyContent: "space-around", marginVertical: 16 },
  button: { backgroundColor: "#4CAF50", padding: 12, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#f44336" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  map: { flex: 1, height: 300, marginTop: 16 },
});

export default ActiveOrdersScreen;
