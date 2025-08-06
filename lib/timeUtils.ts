// Tarih utility fonksiyonları - Turkey timezone güvenilir hesaplama

/**
 * Günün tarihini YYYY-MM-DD formatında döner (Turkey timezone)
 * Yaz saati ve kış saati otomatik geçişini destekler
 */
export const getCurrentDate = (): string => {
  // Turkey timezone'da doğru tarihi al - yaz/kış saati otomatik
  const now = new Date();
  
  // Check if Intl is available before using
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      // Intl.DateTimeFormat ile Turkey timezone'da tarihi hesapla
      const turkeyDateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(now);
      
      const year = turkeyDateParts.find(part => part.type === 'year')?.value;
      const month = turkeyDateParts.find(part => part.type === 'month')?.value;
      const day = turkeyDateParts.find(part => part.type === 'day')?.value;
      
      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch (error) {
      console.log('Intl error, using fallback:', error.message);
    }
  }
  
  // Fallback: Manual timezone calculation for Android
  console.log('Using fallback date calculation');
  const turkeyOffset = 3; // Turkey is UTC+3
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const turkeyTime = new Date(utc + (turkeyOffset * 3600000));
  
  const year = turkeyTime.getFullYear();
  const month = String(turkeyTime.getMonth() + 1).padStart(2, '0');
  const day = String(turkeyTime.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Turkey timezone'da DateTime objesi döner
 * Yaz saati ve kış saati otomatik geçişini destekler
 */
export const getCurrentDateTime = (): Date => {
  const now = new Date();
  
  // Check if timezone support is available
  if (typeof Intl !== 'undefined' && now.toLocaleString) {
    try {
      // Turkey timezone'da string formatında saat al
      const turkeyTimeString = now.toLocaleString('sv-SE', { 
        timeZone: 'Europe/Istanbul' 
      }); // sv-SE formatı: 'YYYY-MM-DD HH:mm:ss'
      
      const parsedDate = new Date(turkeyTimeString);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    } catch (error) {
      console.log('Timezone error, using fallback:', error.message);
    }
  }
  
  // Fallback: Manual timezone calculation
  console.log('Using fallback datetime calculation');
  const turkeyOffset = 3; // Turkey is UTC+3
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const turkeyTime = new Date(utc + (turkeyOffset * 3600000));
  
  return turkeyTime;
};

/**
 * Belirli bir tarihin haftanın başlangıcını (Pazartesi) döner
 */
export const getWeekStart = (dateString: string): string => {
  const date = new Date(dateString + 'T12:00:00');
  const day = date.getDay(); // 0 = Pazar, 1 = Pazartesi, ...
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Pazartesi'ye ayarla
  
  const weekStart = new Date(date.setDate(diff));
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const day_str = String(weekStart.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day_str}`;
};

/**
 * Bu haftanın başlangıç tarihini döner (Turkey timezone)
 */
export const getCurrentWeek = (): string => {
  const today = getCurrentDate();
  return getWeekStart(today);
};

/**
 * Bu ayın başlangıç tarihini döner (Turkey timezone)
 */
export const getCurrentMonth = (): string => {
  const now = new Date();
  
  try {
    // Turkey timezone'da tarihi al
    const turkeyDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(now);
    
    const year = turkeyDateParts.find(part => part.type === 'year')?.value;
    const month = turkeyDateParts.find(part => part.type === 'month')?.value;
    
    return `${year}-${month}-01`;
  } catch (error) {
    // Fallback: Manual timezone calculation for Android
    console.log('Using fallback month calculation for Android');
    const turkeyOffset = 3; // Turkey is UTC+3
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const turkeyTime = new Date(utc + (turkeyOffset * 3600000));
    
    const year = turkeyTime.getFullYear();
    const month = String(turkeyTime.getMonth() + 1).padStart(2, '0');
    
    return `${year}-${month}-01`;
  }
};

/**
 * Tarih string'ini Turkey timezone'da doğru formatta gösterir
 */
export const formatDateTurkey = (dateString: string): string => {
  const date = new Date(dateString + 'T12:00:00');
  
  try {
    return date.toLocaleDateString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (error) {
    // Fallback: Basic formatting without timezone
    console.log('Using fallback date formatting for Android');
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
};

/**
 * Belirli bir tarihin Turkey timezone'da bugün olup olmadığını kontrol eder
 */
export const isTurkeyToday = (dateString: string): boolean => {
  return dateString === getCurrentDate();
};

/**
 * Tarihi güzel formatta görüntüler
 */
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  
  try {
    return d.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    // Fallback: Manual formatting
    console.log('Using fallback date formatting for Android');
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
};

/**
 * Tarih ve saati güzel formatta görüntüler
 */
export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  
  try {
    return d.toLocaleString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    // Fallback: Manual formatting
    console.log('Using fallback datetime formatting for Android');
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${hours}:${minutes}`;
  }
};

/**
 * Sadece saati görüntüler
 */
export const formatTime = (date: string | Date): string => {
  const d = new Date(date);
  
  try {
    return d.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    // Fallback: Manual formatting
    console.log('Using fallback time formatting for Android');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
};

/**
 * İki tarih arasındaki farkı hesaplar
 */
export const getDaysDifference = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Sipariş kabul yasağının bitimine kadar olan süreyi hesaplar
 */
export const calculateAcceptanceCountdown = (createdAt: string, blockTime: number) => {
  // Input validation
  if (!createdAt || typeof createdAt !== 'string' || !blockTime || isNaN(blockTime)) {
    console.warn('Invalid parameters for calculateAcceptanceCountdown:', { createdAt, blockTime });
    return { isExpired: true, seconds: 0 };
  }
  
  const createdTime = new Date(createdAt).getTime();
  const now = new Date().getTime();
  
  // Check for invalid dates
  if (isNaN(createdTime) || isNaN(now)) {
    console.warn('Invalid date in calculateAcceptanceCountdown:', { createdAt, createdTime, now });
    return { isExpired: true, seconds: 0 };
  }
  
  const blockEndTime = createdTime + (blockTime * 1000);
  const remainingMs = blockEndTime - now;
  
  if (remainingMs <= 0) {
    return { isExpired: true, seconds: 0 };
  }
  
  const seconds = Math.ceil(remainingMs / 1000);
  
  return {
    isExpired: false,
    seconds: isNaN(seconds) ? 0 : Math.max(0, seconds)
  };
};

/**
 * Siparişin otomatik silinme süresini hesaplar
 */
export const calculateDeletionCountdown = (createdAt: string) => {
  // Input validation
  if (!createdAt || typeof createdAt !== 'string') {
    console.warn('Invalid createdAt parameter for calculateDeletionCountdown:', createdAt);
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const createdTime = new Date(createdAt).getTime();
  const now = new Date().getTime();
  
  // Check for invalid dates
  if (isNaN(createdTime) || isNaN(now)) {
    console.warn('Invalid date in calculateDeletionCountdown:', { createdAt, createdTime, now });
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const deletionTime = createdTime + (60 * 60 * 1000); // 1 saat
  const remainingMs = deletionTime - now;
  
  if (remainingMs <= 0) {
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const totalSeconds = Math.ceil(remainingMs / 1000);
  
  // NaN kontrolü ile güvenli hesaplama
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return {
    isExpired: false,
    hours: isNaN(hours) ? 0 : Math.max(0, hours),
    minutes: isNaN(minutes) ? 0 : Math.max(0, minutes),
    seconds: isNaN(seconds) ? 0 : Math.max(0, seconds)
  };
};

/**
 * Teslimat süresini hesaplar
 */
export const calculateDeliveryCountdown = (acceptedAt: string) => {
  // Input validation
  if (!acceptedAt || typeof acceptedAt !== 'string') {
    console.warn('Invalid acceptedAt parameter for calculateDeliveryCountdown:', acceptedAt);
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const acceptedTime = new Date(acceptedAt).getTime();
  const now = new Date().getTime();
  
  // Check for invalid dates
  if (isNaN(acceptedTime) || isNaN(now)) {
    console.warn('Invalid date in calculateDeliveryCountdown:', { acceptedAt, acceptedTime, now });
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const deliveryTime = acceptedTime + (60 * 60 * 1000); // 1 saat
  const remainingMs = deliveryTime - now;
  
  if (remainingMs <= 0) {
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const totalSeconds = Math.ceil(remainingMs / 1000);
  
  // NaN kontrolü ile güvenli hesaplama
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return {
    isExpired: false,
    hours: isNaN(hours) ? 0 : Math.max(0, hours),
    minutes: isNaN(minutes) ? 0 : Math.max(0, minutes),
    seconds: isNaN(seconds) ? 0 : Math.max(0, seconds)
  };
}; 