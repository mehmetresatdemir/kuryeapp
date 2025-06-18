import React, { useState, useEffect, useCallback } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "react-native-vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useUser } from "@clerk/clerk-expo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

// Mahalle verileri için tip tanımı
interface Neighborhood {
  id: string;
  name: string;
  fee: string;
}

// Resim verisi için basit tip tanımı
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
}

// Ödeme yöntemi için tip tanımı
type PaymentMethod = "nakit" | "banka" | "hediye";

export default function HomeScreen() {
  const { user, isLoaded } = useUser();
  const navigation = useNavigation();

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Sipariş ekleme/düzenleme modalı (yeni veya düzenleme için)
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<Neighborhood | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [image, setImage] = useState<ImageAsset | null>(null);
  const [enteredCash, setEnteredCash] = useState<string>("");
  const [enteredBank, setEnteredBank] = useState<string>("");
  const [enteredGift, setEnteredGift] = useState<string>("");

  // Eğer editingOrder null ise yeni sipariş, dolu ise düzenleme modunda
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Sipariş detay modalı için state
  const [orderDetailModalVisible, setOrderDetailModalVisible] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Tam ekran resim modalı için state
  const [fullScreenModalVisible, setFullScreenModalVisible] = useState(false);
  const [fullScreenImageUri, setFullScreenImageUri] = useState<string | null>(null);

  const userId = user?.id;
  const firmaAdi = user?.fullName;

  // Siparişleri getiren fonksiyon
  const fetchOrders = async () => {
    try {
      const response = await fetch(`https://red.enucuzal.com/api/neworders/${userId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setOrders([]);
          setError(null);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const sortedOrders = data.data.sort(
          (a: Order, b: Order) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setOrders(sortedOrders);
        setError(null);
      } else {
        setOrders([]);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Sipariş bilgileri alınırken bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  };

  // Ekran odaklandığında verileri yenile
  useFocusEffect(
    useCallback(() => {
      if (isLoaded && user) {
        fetchOrders();
      }
    }, [isLoaded, user])
  );

  useEffect(() => {
    if (isLoaded && user) {
      fetchOrders();
    }
  }, [isLoaded, user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, []);

  // Örnek mahalle verileri
  const neighborhoods: Neighborhood[] = [
    { id: "1", name: "Merkez Mah", fee: "+100 TL" },
    { id: "2", name: "Atatürk Mah", fee: "+120 TL" },
  ];

  const renderNeighborhood = ({ item }: { item: Neighborhood }) => (
    <TouchableOpacity
      style={[
        styles.item,
        selectedNeighborhood?.id === item.id && styles.selectedItem,
      ]}
      onPress={() => setSelectedNeighborhood(item)}
    >
      <Text>{item.name} {item.fee}</Text>
    </TouchableOpacity>
  );

  // Resim seçme/fotoğraf çekme işlemleri
  const handleImagePicker = () => {
    Alert.alert("Resim Seç", "Bir seçenek belirleyin", [
      { text: "Galeriden Seç", onPress: pickImage },
      { text: "Fotoğraf Çek", onPress: takePhoto },
      { text: "İptal", style: "cancel" },
    ]);
  };

  const pickImage = async (): Promise<void> => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0]);
    }
  };

  const takePhoto = async (): Promise<void> => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0]);
    }
  };

  // Hesaplama fonksiyonları
  const getCourierFee = (): number => {
    if (selectedNeighborhood && selectedNeighborhood.fee) {
      const match = selectedNeighborhood.fee.match(/\+(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }
    return 0;
  };

  const getPaymentMethodSummary = (): string => {
    if (selectedPaymentMethod === "nakit") {
      return `Nakit: ${enteredCash || "0"} TL`;
    }
    if (selectedPaymentMethod === "banka") {
      return `Banka: ${enteredBank || "0"} TL`;
    }
    if (selectedPaymentMethod === "hediye") {
      return `Hediye Çeki: ${enteredGift || "0"} TL`;
    }
    return "Yok";
  };

  // Sipariş ekleme/düzenleme fonksiyonu
  const saveOrder = async (): Promise<void> => {
    if (!selectedNeighborhood) {
      alert("Lütfen bir mahalle seçin.");
      return;
    }
    if (!selectedPaymentMethod) {
      alert("Lütfen bir ödeme yöntemi seçin.");
      return;
    }

    let nakitTutari = 0, bankaTutari = 0, hediyeTutari = 0;
    if (selectedPaymentMethod === "nakit") {
      nakitTutari = enteredCash ? parseFloat(enteredCash) : 0;
    } else if (selectedPaymentMethod === "banka") {
      bankaTutari = enteredBank ? parseFloat(enteredBank) : 0;
    } else if (selectedPaymentMethod === "hediye") {
      hediyeTutari = enteredGift ? parseFloat(enteredGift) : 0;
    }

    const orderData = {
      userId,
      resim: image ? image.uri : null,
      mahalle: selectedNeighborhood.name,
      odemeYontemi: getPaymentMethodSummary(),
      kuryeTutari: getCourierFee(),
      nakitTutari,
      bankaTutari,
      hediyeTutari,
      firmaAdi,
    };

    try {
      let response;
      if (editingOrder) {
        response = await fetch(`https://red.enucuzal.com/api/neworders/update/${editingOrder.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      } else {
        response = await fetch("https://red.enucuzal.com/api/neworders/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      }
      if (!response.ok) {
        throw new Error("Sipariş verileri kaydedilemedi");
      }
      const responseData = await response.json();
      console.log("Sipariş başarıyla kaydedildi:", responseData);

      if (editingOrder) {
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

      fetchOrders();
    } catch (err: any) {
      console.error("Sipariş kaydedilirken hata:", err);
      alert("Sipariş kaydedilemedi. Lütfen tekrar deneyin.");
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
            const response = await fetch(`https://red.enucuzal.com/api/neworders/${orderId}`, {
              method: "DELETE",
            });
            if (!response.ok) {
              throw new Error("Silme işlemi başarısız");
            }
            fetchOrders();
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
          setSelectedNeighborhood(selected || { id: "0", name: order.mahalle, fee: "+0 TL" });
          if (order.odeme_yontemi.toLowerCase().includes("nakit")) {
            setSelectedPaymentMethod("nakit");
            setEnteredCash(order.nakit_tutari);
          } else if (order.odeme_yontemi.toLowerCase().includes("banka")) {
            setSelectedPaymentMethod("banka");
            setEnteredBank(order.banka_tutari);
          } else if (order.odeme_yontemi.toLowerCase().includes("hediye")) {
            setSelectedPaymentMethod("hediye");
            setEnteredGift(order.hediye_tutari);
          } else {
            setSelectedPaymentMethod(null);
          }
          if (order.resim) {
            setImage({ uri: order.resim });
          } else {
            setImage(null);
          }
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

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6a11cb" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>Siparişlerim</Text>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : orders.length > 0 ? (
          orders.map((order, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => openOrderDetail(order)}
              onLongPress={() => handleLongPress(order)}
            >
              <LinearGradient
                colors={["#6a11cb", "#2575fc"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <Icon name="local-shipping" size={24} color="#fff" />
                  <Text style={styles.cardTitle}>
                    {order.firma_adi}  #{order.id}
                  </Text>
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.cardRow}>
                    <Icon name="place" size={18} color="#fff" />
                    <Text style={styles.cardText}>{order.mahalle}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Icon name="attach-money" size={18} color="#fff" />
                    <Text style={styles.cardText}>
                      Kurye Ödemesi {order.kurye_tutari} TL
                    </Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Icon name="place" size={18} color="#fff" />
                    <Text style={styles.cardText}>{order.odeme_yontemi}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Icon name="pending" size={18} color="#fff" />
                    <Text style={styles.cardText}>{order.status}</Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noOrdersText}>Henüz siparişiniz bulunmamaktadır.</Text>
        )}
      </ScrollView>

      <View style={styles.buttonContainer}>
        <Button
          title="Sipariş Ekle"
          onPress={() => {
            setEditingOrder(null);
            setModalVisible(true);
          }}
        />
      </View>

      {/* Sipariş ekleme/düzenleme modalı */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Button title="Resim Seç / Çek" onPress={handleImagePicker} />
              {image && (
                // Resme tıklandığında tam ekran moduna geçiş için TouchableOpacity
                <TouchableOpacity onPress={() => openFullScreenImage(image.uri)}>
                  <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                </TouchableOpacity>
              )}

              <Text style={styles.sectionTitle}>Mahalle Seçimi</Text>
              <FlatList
                data={neighborhoods}
                keyExtractor={(item) => item.id}
                renderItem={renderNeighborhood}
                extraData={selectedNeighborhood}
              />

              <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
              <View style={styles.paymentContainer}>
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    selectedPaymentMethod === "nakit" && styles.selectedPaymentOption,
                  ]}
                  onPress={() => setSelectedPaymentMethod("nakit")}
                >
                  <Text>Nakit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    selectedPaymentMethod === "banka" && styles.selectedPaymentOption,
                  ]}
                  onPress={() => setSelectedPaymentMethod("banka")}
                >
                  <Text>Banka</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    selectedPaymentMethod === "hediye" && styles.selectedPaymentOption,
                  ]}
                  onPress={() => setSelectedPaymentMethod("hediye")}
                >
                  <Text>Hediye Çeki</Text>
                </TouchableOpacity>
              </View>

              {selectedPaymentMethod === "nakit" && (
                <TextInput
                  style={styles.input}
                  placeholder="Nakit Tutarı"
                  value={enteredCash}
                  onChangeText={setEnteredCash}
                  keyboardType="numeric"
                />
              )}
              {selectedPaymentMethod === "banka" && (
                <TextInput
                  style={styles.input}
                  placeholder="Banka Tutarı"
                  value={enteredBank}
                  onChangeText={setEnteredBank}
                  keyboardType="numeric"
                />
              )}
              {selectedPaymentMethod === "hediye" && (
                <TextInput
                  style={styles.input}
                  placeholder="Hediye Çeki Tutarı"
                  value={enteredGift}
                  onChangeText={setEnteredGift}
                  keyboardType="numeric"
                />
              )}

              <View style={styles.summaryContainer}>
                <Text style={styles.summaryText}>
                  Kurye Tutarı: {selectedNeighborhood ? getCourierFee() : 0} TL
                </Text>
                <Text style={styles.summaryText}>
                  Ödeme Yöntemi: {getPaymentMethodSummary()}
                </Text>
                <Text style={styles.summaryText}>
                  Firma Adı: {firmaAdi}
                </Text>
              </View>

              <Button title={editingOrder ? "Güncelle" : "Siparişi Kaydet"} onPress={saveOrder} />
              <Button title="Kapat" onPress={() => {
                setModalVisible(false);
                setEditingOrder(null);
              }} />
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Sipariş detay modalı */}
      <Modal
        visible={orderDetailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setOrderDetailModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOrderDetailModalVisible(false)}>
          <View style={styles.detailModalContainer}>
            <TouchableWithoutFeedback>
              <View style={styles.detailModalContent}>
                {selectedOrder && (
                  <>
                    {selectedOrder.resim ? (
                      <TouchableOpacity onPress={() => openFullScreenImage(selectedOrder.resim)}>
                        <Image source={{ uri: selectedOrder.resim }} style={styles.detailImage} />
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.detailLabel}>Resim Yok</Text>
                    )}
                    <Text style={styles.detailLabel}>Firma: {selectedOrder.firma_adi}</Text>
                    <Text style={styles.detailLabel}>Mahalle: {selectedOrder.mahalle}</Text>
                    <Text style={styles.detailLabel}>Ödeme Yöntemi: {selectedOrder.odeme_yontemi}</Text>
                    <Text style={styles.detailLabel}>Status: {selectedOrder.status}</Text>
                    <View style={styles.detailButtonContainer}>
                      <Button title="Düzenle" onPress={() => {
                        setEditingOrder(selectedOrder);
                        const selected = neighborhoods.find((n) => n.name === selectedOrder.mahalle);
                        setSelectedNeighborhood(selected || { id: "0", name: selectedOrder.mahalle, fee: "+0 TL" });
                        if (selectedOrder.odeme_yontemi.toLowerCase().includes("nakit")) {
                          setSelectedPaymentMethod("nakit");
                          setEnteredCash(selectedOrder.nakit_tutari);
                        } else if (selectedOrder.odeme_yontemi.toLowerCase().includes("banka")) {
                          setSelectedPaymentMethod("banka");
                          setEnteredBank(selectedOrder.banka_tutari);
                        } else if (selectedOrder.odeme_yontemi.toLowerCase().includes("hediye")) {
                          setSelectedPaymentMethod("hediye");
                          setEnteredGift(selectedOrder.hediye_tutari);
                        } else {
                          setSelectedPaymentMethod(null);
                        }
                        if (selectedOrder.resim) {
                          setImage({ uri: selectedOrder.resim });
                        } else {
                          setImage(null);
                        }
                        setOrderDetailModalVisible(false);
                        setModalVisible(true);
                      }} />
                      <Button title="Sil" color="red" onPress={() => {
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
                      }} />
                      {selectedOrder.status.toLowerCase() === "kuryede" && (
                        <Button title="Haritayı Aç" onPress={() => {
                          setOrderDetailModalVisible(false);
                          (navigation as any).navigate("LiveMap");
                        }} />
                      )}
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Tam ekran resim modalı */}
      <Modal
        visible={fullScreenModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullScreenModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFullScreenModalVisible(false)}>
          <View style={styles.fullScreenContainer}>
            {fullScreenImageUri && (
              <Image source={{ uri: fullScreenImageUri }} style={styles.fullScreenImage} />
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  scrollContent: { padding: 20, paddingTop: 40 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  errorText: { fontSize: 16, color: "red", textAlign: "center", marginTop: 20 },
  buttonContainer: { padding: 20, paddingBottom: 130 },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  sectionTitle: { marginTop: 20, fontWeight: "bold", fontSize: 16 },
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
  paymentOption: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  selectedPaymentOption: { backgroundColor: "#cce5ff" },
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
  summaryText: { fontSize: 16, fontWeight: "bold", textAlign: "center" },
  imagePreview: { width: 200, height: 200, marginVertical: 10, alignSelf: "center" },
  detailModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  detailModalContent: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
  },
  detailImage: { width: "100%", height: 200, marginBottom: 10 },
  detailLabel: { fontSize: 16, marginBottom: 5 },
  detailButtonContainer: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-around",
  },
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
});

