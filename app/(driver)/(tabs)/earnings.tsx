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
      // İki endpoint'ten verileri paralel çekelim
      const [monthlyRes, deliveredRes] = await Promise.all([
        fetch(`https://red.enucuzal.com/api/earnings/monthly/${user.id}`),
        fetch(`https://red.enucuzal.com/api/earnings/delivered/${user.id}`),
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

  const renderMonthlyItem = ({ item }: { item: MonthlyEarnings }) => {
    // Tarih değerini kullanıcı dostu bir formata çeviriyoruz.
    const monthDate = new Date(item.month);
    const monthStr = monthDate.toLocaleDateString("tr-TR", {
      month: "long",
      year: "numeric",
    });
    return (
      <View style={styles.card}>
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
            <Text style={styles.label}>Hediye Çeki</Text>
            <Text style={styles.value}>{item.total_hediye} TL</Text>
          </View>
        </View>
      </View>
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
        <Text>Hediye Çeki: {item.hediye_tutari} TL</Text>
      </View>
    );
  };

  if (!isLoaded || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Aylık Kazançlar</Text>
      <FlatList
        data={monthlyData}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderMonthlyItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.emptyText}>Veri bulunamadı.</Text>}
      />
      <Text style={[styles.header, { marginTop: 20 }]}>Teslim Edilen Siparişler</Text>
      <FlatList
        data={deliveredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderDeliveredItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.emptyText}>Teslim edilen sipariş bulunamadı.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  row: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  column: { flexBasis: "48%", alignItems: "center", marginVertical: 8 },
  label: { fontSize: 14, color: "#888", marginBottom: 4 },
  value: { fontSize: 16, fontWeight: "bold" },
  orderItem: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  orderTitle: { fontSize: 16, fontWeight: "bold" },
  emptyText: { textAlign: "center", marginTop: 20 },
});

export default EarningsScreen;
