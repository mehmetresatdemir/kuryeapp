import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, getFullUrl } from '../../constants/api';
import { router } from 'expo-router';

interface WalletData {
  id: number;
  balance: string;
  total_earned: string;
  total_withdrawn: string;
  user_type: string;
}

interface Transaction {
  id: number;
  transaction_type: string;
  amount: string;
  description: string;
  created_at: string;
  status: string;
}

interface WithdrawalRequest {
  id: number;
  amount: string;
  status: string;
  requested_at: string;
  bank_name: string;
  account_holder: string;
}

const WalletScreen = () => {
  const [user, setUser] = useState<any>(null);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [iban, setIban] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchWalletData();
    }
  }, [user]);

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const fetchWalletData = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(getFullUrl(API_ENDPOINTS.WALLET(user.id)));
      if (response.ok) {
        const data = await response.json();
        setWalletData(data.data.wallet);
        setTransactions(data.data.recent_transactions);
        setWithdrawalRequests(data.data.withdrawal_requests);
      }
    } catch (error) {
      console.error('Wallet fetch error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchWalletData();
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !bankName || !accountNumber || !accountHolder || !iban) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun');
      return;
    }

    if (parseFloat(withdrawAmount) <= 0) {
      Alert.alert('Hata', 'Geçerli bir tutar girin');
      return;
    }

    if (parseFloat(withdrawAmount) > parseFloat(walletData?.balance || '0')) {
      Alert.alert('Hata', 'Yetersiz bakiye');
      return;
    }

    try {
      const response = await fetch(getFullUrl(API_ENDPOINTS.WALLET_WITHDRAW(user.id)), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: withdrawAmount,
          bank_name: bankName,
          account_number: accountNumber,
          account_holder: accountHolder,
          iban: iban,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        Alert.alert('Başarılı', 'Para çekim talebi oluşturuldu');
        setShowWithdrawModal(false);
        resetWithdrawForm();
        fetchWalletData();
      } else {
        Alert.alert('Hata', data.message);
      }
    } catch (error) {
      Alert.alert('Hata', 'Para çekim talebi oluşturulamadı');
    }
  };

  const resetWithdrawForm = () => {
    setWithdrawAmount('');
    setBankName('');
    setAccountNumber('');
    setAccountHolder('');
    setIban('');
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'income':
        return { name: 'arrow-down', color: '#16A34A' };
      case 'expense':
        return { name: 'arrow-up', color: '#DC2626' };
      case 'withdrawal':
        return { name: 'card', color: '#2563EB' };
      default:
        return { name: 'swap-horizontal', color: '#6B7280' };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#16A34A';
      case 'pending':
        return '#F59E0B';
      case 'rejected':
        return '#DC2626';
      default:
        return '#6B7280';
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const icon = getTransactionIcon(item.transaction_type);
    const date = new Date(item.created_at).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={styles.transactionItem}>
        <View style={styles.transactionLeft}>
          <View style={[styles.transactionIcon, { backgroundColor: `${icon.color}20` }]}>
            <Ionicons name={icon.name as any} size={20} color={icon.color} />
          </View>
          <View>
            <Text style={styles.transactionDescription}>{item.description}</Text>
            <Text style={styles.transactionDate}>{date}</Text>
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[
            styles.transactionAmount,
            { color: item.transaction_type === 'income' ? '#16A34A' : '#DC2626' }
          ]}>
            {item.transaction_type === 'income' ? '+' : '-'}{item.amount} ₺
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderWithdrawalRequest = ({ item }: { item: WithdrawalRequest }) => {
    const date = new Date(item.requested_at).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return (
      <View style={styles.withdrawalItem}>
        <View style={styles.withdrawalHeader}>
          <Text style={styles.withdrawalAmount}>{item.amount} ₺</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.withdrawalBank}>{item.bank_name}</Text>
        <Text style={styles.withdrawalHolder}>{item.account_holder}</Text>
        <Text style={styles.withdrawalDate}>{date}</Text>
      </View>
    );
  };

  if (!walletData) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#8B5CF6" barStyle="light-content" />
      
      {/* Header */}
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kasa Yönetimi</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Ionicons name="refresh" size={24} color="#1F2937" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Wallet Balance Card */}
      <LinearGradient
        colors={['#3B82F6', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Mevcut Bakiye</Text>
          <Ionicons name="wallet" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.balanceAmount}>{parseFloat(walletData.balance).toFixed(2)} ₺</Text>
        
        <View style={styles.balanceStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Toplam Kazanç</Text>
            <Text style={styles.statValue}>{parseFloat(walletData.total_earned).toFixed(2)} ₺</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Toplam Çekim</Text>
            <Text style={styles.statValue}>{parseFloat(walletData.total_withdrawn).toFixed(2)} ₺</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.withdrawButton}
          onPress={() => setShowWithdrawModal(true)}
        >
          <Ionicons name="card" size={16} color="#3B82F6" />
          <Text style={styles.withdrawButtonText}>Para Çek</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Text style={styles.sectionTitle}>Son İşlemler</Text>
      </View>

      {/* Transactions List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTransaction}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>Henüz işlem bulunmuyor</Text>
          </View>
        }
        style={styles.transactionsList}
      />

      {/* Withdrawal Requests */}
      {withdrawalRequests.length > 0 && (
        <View style={styles.withdrawalSection}>
          <Text style={styles.sectionTitle}>Para Çekim Talepleri</Text>
          <FlatList
            data={withdrawalRequests}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderWithdrawalRequest}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.withdrawalList}
          />
        </View>
      )}

      {/* Withdrawal Modal */}
      <Modal
        visible={showWithdrawModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Para Çekim Talebi</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Çekim Tutarı</Text>
                <TextInput
                  style={styles.input}
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  placeholder="0.00"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Banka Adı</Text>
                <TextInput
                  style={styles.input}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="Örn: Ziraat Bankası"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hesap Sahibi</Text>
                <TextInput
                  style={styles.input}
                  value={accountHolder}
                  onChangeText={setAccountHolder}
                  placeholder="Ad Soyad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hesap Numarası</Text>
                <TextInput
                  style={styles.input}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="1234567890"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>IBAN</Text>
                <TextInput
                  style={styles.input}
                  value={iban}
                  onChangeText={setIban}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                />
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleWithdraw}>
                <Text style={styles.submitButtonText}>Talep Oluştur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#8B5CF6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  balanceCard: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  balanceStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  withdrawButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  tabContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  transactionsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  withdrawalSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  withdrawalList: {
    marginTop: 12,
  },
  withdrawalItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    width: 200,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  withdrawalAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  withdrawalBank: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  withdrawalHolder: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  withdrawalDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default WalletScreen; 