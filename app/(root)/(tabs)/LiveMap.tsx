import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Button,
  RefreshControl,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import io from "socket.io-client";
import { useFocusEffect } from "expo-router";
import { useUser } from "@clerk/clerk-expo";

interface CourierLocation {
  courierId: string;
  orderId: string;
  latitude: number;
  longitude: number;
  firmaid?: string;
}

const CourierMapScreen: React.FC = () => {
  const { user, isLoaded } = useUser();
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const socketRef = useRef<any>(null);
  const lastUpdateRef = useRef<number>(0);
  const mapRef = useRef<MapView>(null);

  if (!isLoaded || !user) return <Text>Loading...</Text>;

  const firmId = user.publicMetadata?.firmId || user.id;

  

  // Kullanıcının mevcut konumunu al
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
  
  useFocusEffect(
    useCallback(() => {
      setCourierLocations([]);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      socketRef.current = io("https://red.enucuzal.com", { transports: ["websocket"] });
      socketRef.current.on("connect", () => {
        socketRef.current.emit("requestActiveOrders", { firmId });
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
          }));
          setCourierLocations(locations);
        } else {
          setCourierLocations([]);
        }
      });
      socketRef.current.on("locationUpdate", (data: any) => {
        if (!data || !data.orderId) return;
        if (!data.firmaid || data.firmaid !== firmId) return;
        const now = Date.now();
        if (now - lastUpdateRef.current < 1000) return;
        lastUpdateRef.current = now;
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
              firmaid: data.firmaid,
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
                firmaid: data.firmaid,
              },
            ];
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
      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }, [firmId])
  );

  // Harita, aktif sipariş varsa onun konumuna, yoksa kullanıcının konumuna merkezlensin
  useEffect(() => {
    if (mapRef.current) {
      if (courierLocations.length > 0) {
        // Aktif sipariş varsa, ilk siparişin konumunu merkezle
        const first = courierLocations[0];
        mapRef.current.animateToRegion({
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      } else if (userLocation) {
        // Aktif sipariş yoksa, kullanıcının konumunu merkezle
        mapRef.current.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      }
    }
  }, [courierLocations, userLocation]);

  // Eğer aktif kuryede sipariş yoksa, haritaya erişime izin verme (sadece mesaj göster)
  if (!isLoading && courierLocations.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.header}>Canlı Kurye Takibi</Text>
        </View>
        <View style={styles.loadingOverlay}>
          <Text>Aktif sipariş bulunamadı. Haritaya erişim yok.</Text>
          <Button title="Tekrar Deneyin" onPress={() => fetchOrders()} />
        </View>
      </View>
    );
  }

  // Aktif kuryeleri courierId'ye göre grupla ve baloncuklar oluştur
  const groupedCouriers = courierLocations.reduce((acc: Record<string, { count: number, location: CourierLocation }>, loc) => {
    if (acc[loc.courierId]) {
      acc[loc.courierId].count += 1;
    } else {
      acc[loc.courierId] = { count: 1, location: loc };
    }
    return acc;
  }, {});

  const renderCourierBubbles = () => {
    const bubbles = Object.keys(groupedCouriers).map(courierId => {
      const { count, location } = groupedCouriers[courierId];
      return (
        <TouchableOpacity
          key={courierId}
          style={styles.courierBubble}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }, 1000);
            }
          }}
        >
          <Text style={styles.bubbleText}>{count > 1 ? count : ""}</Text>
        </TouchableOpacity>
      );
    });
    return (
      <View style={styles.bubbleContainer}>
        {bubbles}
      </View>
    );
  };

  // Kullanıcının konumuna merkeze alan buton
  const centerOnUser = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Canlı Kurye Takibi</Text>
      </View>
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text>Socket bağlantısı kuruluyor...</Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
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
                  title={`Kurye ${loc.courierId}`}
                  description={`Sipariş: ${loc.orderId}`}
                />
              );
            }
            return null;
          })}
        </MapView>
      )}
      {/* Courier baloncuk overlay */}
      {Object.keys(groupedCouriers).length > 0 && renderCourierBubbles()}
      {/* Kullanıcının konumuna merkeze alan buton */}
      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Text style={styles.centerButtonText}>Merkez</Text>
      </TouchableOpacity>
    </View>
  );
};

export default CourierMapScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: {
    paddingTop: 50, // Header için üst boşluk
    paddingBottom: 10,
    alignItems: "center",
    backgroundColor: "#f5f5f5",
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
    top: 100, // Header altı
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
  },
  centerButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
    backgroundColor: "#2575fc",
    padding: 10,
    borderRadius: 5,
  },
  centerButtonText: {
    color: "white",
    fontWeight: "bold",
  },
});
