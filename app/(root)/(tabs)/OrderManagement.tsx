import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "react-native-vector-icons/MaterialIcons";

interface MonthlyEarnings {
  month: string; // ISO formatında tarih
  total_kurye: number;
  total_nakit: number;
  total_banka: number;
  total_hediye: number;
}

interface DeliveredOrder {
  id: string;
  created_at: string;
  kurye_tutari: number;
  nakit_tutari: number;
  banka_tutari: number;
  hediye_tutari: number;
  title: string;
}

const EarningsScreen = () => {
  const { user, isLoaded } = useUser();
  const [monthlyData, setMonthlyData] = useState<MonthlyEarnings[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchData = async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const [monthlyRes, deliveredRes] = await Promise.all([
        fetch(`https://red.enucuzal.com/api/earnings/firmmonthly/${user.id}`),
        fetch(`https://red.enucuzal.com/api/earnings/firmdelivered/${user.id}`),
      ]);
      if (!monthlyRes.ok || !deliveredRes.ok) {
        throw new Error("Hata oluştu");
      }
      const monthlyDataJson = await monthlyRes.json();
      const deliveredDataJson = await deliveredRes.json();
      setMonthlyData(monthlyDataJson.data);
      setDeliveredOrders(deliveredDataJson.data);
    } catch (error) {
      console.error("Error fetching earnings data", error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isLoaded && user) {
      fetchData();
    }
  }, [isLoaded, user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Aylık veriler için kart özetleri
  const renderMonthlyItem = ({ item }: { item: MonthlyEarnings }) => {
    const monthDate = new Date(item.month);
    const monthStr = monthDate.toLocaleDateString("tr-TR", {
      month: "long",
      year: "numeric",
    });
    return (
      <LinearGradient
        colors={["#6a11cb", "#2575fc"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <Text style={styles.monthTitle}>{monthStr}</Text>
        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>Kurye</Text>
            <Text style={styles.value}>{item.total_kurye} TL</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Nakit</Text>
            <Text style={styles.value}>{item.total_nakit} TL</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Banka</Text>
            <Text style={styles.value}>{item.total_banka} TL</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Hediye</Text>
            <Text style={styles.value}>{item.total_hediye} TL</Text>
          </View>
        </View>
      </LinearGradient>
    );
  };

  const renderDeliveredItem = ({ item }: { item: DeliveredOrder }) => {
    return (
      <View style={styles.orderItem}>
        <Text style={styles.orderTitle}>Sipariş #{item.id}</Text>
        <Text>{item.title}</Text>
        <Text>Tarih: {new Date(item.created_at).toLocaleString("tr-TR")}</Text>
        <Text>Kurye: {item.kurye_tutari} TL</Text>
        <Text>Nakit: {item.nakit_tutari} TL</Text>
        <Text>Banka: {item.banka_tutari} TL</Text>
        <Text>Hediye: {item.hediye_tutari} TL</Text>
      </View>
    );
  };

  if (!isLoaded || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2575fc" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Üst kısım: Satış özetleri */}
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Satışlar</Text>
        <Text style={styles.subHeader}>Aylık Kazanç Özetiniz</Text>
      </View>
      <FlatList
        data={monthlyData}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderMonthlyItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>Veri bulunamadı.</Text>}
      />
      {/* Alt kısım: Teslim edilen siparişler */}
      <Text style={[styles.header, { marginTop: 20 }]}>Teslim Edilen Siparişler</Text>
      <FlatList
        data={deliveredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderDeliveredItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>Teslim edilen sipariş bulunamadı.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  headerContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  subHeader: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  monthTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
    color: "#fff",
  },
  row: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  column: { flexBasis: "48%", alignItems: "center", marginVertical: 8 },
  label: { fontSize: 14, color: "#ddd", marginBottom: 4 },
  value: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  orderItem: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  orderTitle: { fontSize: 16, fontWeight: "bold" },
  emptyText: { textAlign: "center", marginTop: 20, fontSize: 16, color: "#666" },
});

export default EarningsScreen;
