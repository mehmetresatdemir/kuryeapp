import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_CONFIG, authedFetch } from '../constants/api';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
  data?: any;
}

interface NotificationButtonProps {
  userType: 'restaurant' | 'courier';
  userId: string;
}

const NotificationButton: React.FC<NotificationButtonProps> = ({ userType, userId }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Bildirimleri yükle
  const loadNotifications = async (pageNum = 1, showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      
      const response = await authedFetch(`${API_CONFIG.BASE_URL}/api/admin/notifications/${userType}/${userId}?page=${pageNum}&limit=20`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error in loadNotifications:', parseError);
        console.error('Response text:', responseText);
        throw new Error('Server returned invalid JSON response');
      }
      
      if (data.success) {
        if (pageNum === 1) {
          setNotifications(data.data.notifications);
        } else {
          setNotifications(prev => [...prev, ...data.data.notifications]);
        }
        
        setUnreadCount(data.data.unreadCount);
        setHasMore(pageNum < data.data.pagination.totalPages);
      } else {
        throw new Error(data.message || 'Bildirimler yüklenemedi');
      }
    } catch (error) {
      console.error('Bildirimler yüklenirken hata:', error);
      Alert.alert('Hata', 'Bildirimler yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Okunmamış bildirim sayısını yükle
  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await authedFetch(`${API_CONFIG.BASE_URL}/api/admin/notifications/${userType}/${userId}/unread-count`);
      
      if (!response.ok) {
        console.error(`HTTP error in loadUnreadCount! status: ${response.status}`);
        return;
      }
      
      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error in loadUnreadCount:', parseError);
        console.error('Response text:', responseText);
        return;
      }
      
      if (data.success) {
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error('Okunmamış bildirim sayısı yüklenirken hata:', error);
    }
  }, [userType, userId]);

  // Bildirimleri okundu olarak işaretle
  const markAsRead = async (notificationIds?: number[]) => {
    try {
      const response = await authedFetch(`${API_CONFIG.BASE_URL}/api/admin/notifications/${userType}/${userId}/mark-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error in markAsRead:', parseError);
        console.error('Response text:', responseText);
        return; // Silently fail for mark as read operations
      }
      
      if (data.success) {
        if (notificationIds) {
          // Belirli bildirimleri okundu olarak işaretle
          setNotifications(prev => 
            prev.map(notif => 
              notificationIds.includes(notif.id) 
                ? { ...notif, is_read: true }
                : notif
            )
          );
          setUnreadCount(prev => Math.max(0, prev - notificationIds.length));
        } else {
          // Tüm bildirimleri okundu olarak işaretle
          setNotifications(prev => 
            prev.map(notif => ({ ...notif, is_read: true }))
          );
          setUnreadCount(0);
        }
      }
    } catch (error) {
      console.error('Bildirimler okundu olarak işaretlenirken hata:', error);
    }
  };

  // Tüm bildirimleri temizle
  const clearAllNotifications = async () => {
    Alert.alert(
      "Tüm Bildirimleri Temizle",
      "Tüm bildirimleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      [
        {
          text: "İptal",
          style: "cancel"
        },
        {
          text: "Temizle",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await authedFetch(`${API_CONFIG.BASE_URL}/api/admin/notifications/${userType}/${userId}/clear-all`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
              });
              
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              
              const responseText = await response.text();
              let data;
              
              try {
                data = JSON.parse(responseText);
              } catch (parseError) {
                console.error('JSON parse error:', parseError);
                console.error('Response text:', responseText);
                throw new Error('Server returned invalid JSON response');
              }
              
              if (data.success) {
                setNotifications([]);
                setUnreadCount(0);
                Alert.alert('Başarılı', 'Tüm bildirimler temizlendi');
              } else {
                throw new Error(data.message || 'Bildirimler temizlenemedi');
              }
            } catch (error) {
              console.error('Bildirimler temizlenirken hata:', error);
              Alert.alert('Hata', 'Bildirimler temizlenirken bir hata oluştu');
            }
          }
        }
      ]
    );
  };

  // Modal açıldığında bildirimleri yükle
  const openModal = () => {
    setModalVisible(true);
    setPage(1);
    loadNotifications(1);
  };

  // Sayfa yüklendiğinde okunmamış sayıyı yükle
  useEffect(() => {
    loadUnreadCount();
    
    // Her 30 saniyede bir okunmamış sayıyı güncelle
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  // Yenile
  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadNotifications(1, false);
  };

  // Daha fazla yükle
  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadNotifications(nextPage, false);
    }
  };

  // Bildirim tipine göre ikon
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'warning': return 'warning';
      case 'error': return 'alert-circle';
      default: return 'information-circle';
    }
  };

  // Bildirim tipine göre renk
  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'error': return '#EF4444';
      default: return '#3B82F6';
    }
  };

  // Tarih formatla
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Şimdi';
    if (minutes < 60) return `${minutes} dakika önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Bildirim öğesi render et
  const renderNotificationItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.is_read && styles.unreadNotification
      ]}
      onPress={() => markAsRead([item.id])}
    >
      <View style={styles.notificationHeader}>
        <View style={styles.notificationIconContainer}>
          <Ionicons
            name={getNotificationIcon(item.type)}
            size={20}
            color={getNotificationColor(item.type)}
          />
        </View>
        <View style={styles.notificationContent}>
          <Text style={[
            styles.notificationTitle,
            !item.is_read && styles.unreadText
          ]}>
            {item.title}
          </Text>
          <Text style={styles.notificationTime}>
            {formatDate(item.created_at)}
          </Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
      <Text style={styles.notificationMessage}>
        {item.message}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity style={styles.notificationButton} onPress={openModal}>
        <Ionicons name="notifications" size={24} color="#FFFFFF" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.modalHeader}
          >
            <View style={styles.modalHeaderLeft}>
              <Text style={styles.modalTitle}>Bildirimler</Text>
            </View>
            <View style={styles.headerActions}>
              {notifications.length > 0 && (
                <TouchableOpacity
                  style={styles.clearAllButton}
                  onPress={clearAllNotifications}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={styles.clearAllText}>Temizle</Text>
                </TouchableOpacity>
              )}
              {unreadCount > 0 && (
                <TouchableOpacity
                  style={styles.markAllButton}
                  onPress={() => markAsRead()}
                >
                  <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                  <Text style={styles.markAllText}>Tümü Okundu</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <FlatList
            data={notifications}
            renderItem={renderNotificationItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.notificationsList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.1}
            ListEmptyComponent={
              loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#667eea" />
                  <Text style={styles.loadingText}>Bildirimler yükleniyor...</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="notifications-off" size={64} color="#9CA3AF" />
                  <Text style={styles.emptyText}>Henüz bildirim yok</Text>
                  <Text style={styles.emptySubtext}>
                    Yeni bildirimler burada görünecek
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              loading && notifications.length > 0 ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator size="small" color="#667eea" />
                </View>
              ) : null
            }
          />
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  notificationButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  modalHeaderLeft: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markAllButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
  },
  markAllText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  clearAllButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
  },
  clearAllText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationsList: {
    padding: 16,
  },
  notificationItem: {
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
  unreadNotification: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: 'bold',
  },
  notificationTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default NotificationButton; 