// Veritabanı artık Europe/Istanbul timezone'unu kullanıyor
// Timestamp operations use database timezone directly

// formatTimeForTurkey function removed - using simple date formatting instead

/**
 * Countdown hesaplaması için stateless fonksiyon - Turkey time kullanır
 */
export const calculateCountdown = (targetTime: Date): { hours: number, minutes: number, seconds: number, isExpired: boolean } => {
  // Backend Turkey time kullanıyor, frontend'te de Turkey time kullan
  const now = new Date(new Date().getTime() + (3 * 60 * 60 * 1000)); // Turkey time
  const diff = targetTime.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { hours, minutes, seconds, isExpired: false };
};

/**
 * Kabul yasağı countdown'u (10 saniye)
 */
export const calculateAcceptanceCountdown = (orderCreatedAt: string): { seconds: number, isExpired: boolean } => {
  const createdTime = new Date(orderCreatedAt);
  const acceptanceTime = new Date(createdTime.getTime() + 10000); // 10 saniye ekle
  const countdown = calculateCountdown(acceptanceTime);
  
  return {
    seconds: countdown.seconds + (countdown.minutes * 60) + (countdown.hours * 3600),
    isExpired: countdown.isExpired
  };
};

/**
 * Otomatik silme countdown'u (1 saat)
 */
export const calculateDeletionCountdown = (orderCreatedAt: string): { hours: number, minutes: number, seconds: number, isExpired: boolean } => {
  const createdTime = new Date(orderCreatedAt);
  const deletionTime = new Date(createdTime.getTime() + 3600000); // 1 saat ekle
  return calculateCountdown(deletionTime);
};

/**
 * Teslimat countdown'u (kabul zamanından 1 saat)
 */
export const calculateDeliveryCountdown = (acceptedAt: string): { hours: number, minutes: number, seconds: number, isExpired: boolean } => {
  const acceptedTime = new Date(acceptedAt);
  const deliveryDeadline = new Date(acceptedTime.getTime() + 3600000); // 1 saat ekle
  return calculateCountdown(deliveryDeadline);
}; 