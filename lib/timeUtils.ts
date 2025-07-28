// Tarih utility fonksiyonları - Turkey timezone güvenilir hesaplama

/**
 * Günün tarihini YYYY-MM-DD formatında döner (Turkey timezone)
 * Yaz saati ve kış saati otomatik geçişini destekler
 */
export const getCurrentDate = (): string => {
  // Turkey timezone'da doğru tarihi al - yaz/kış saati otomatik
  const now = new Date();
  
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
  
  return `${year}-${month}-${day}`;
};

/**
 * Turkey timezone'da DateTime objesi döner
 * Yaz saati ve kış saati otomatik geçişini destekler
 */
export const getCurrentDateTime = (): Date => {
  const now = new Date();
  
  // Turkey timezone'da string formatında saat al
  const turkeyTimeString = now.toLocaleString('sv-SE', { 
    timeZone: 'Europe/Istanbul' 
  }); // sv-SE formatı: 'YYYY-MM-DD HH:mm:ss'
  
  return new Date(turkeyTimeString);
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
  
  // Turkey timezone'da tarihi al
  const turkeyDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  
  const year = turkeyDateParts.find(part => part.type === 'year')?.value;
  const month = turkeyDateParts.find(part => part.type === 'month')?.value;
  
  return `${year}-${month}-01`;
};

/**
 * Tarih string'ini Turkey timezone'da doğru formatta gösterir
 */
export const formatDateTurkey = (dateString: string): string => {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
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
  return d.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Tarih ve saati güzel formatta görüntüler
 */
export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Sadece saati görüntüler
 */
export const formatTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });
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
  const createdTime = new Date(createdAt).getTime();
  const now = new Date().getTime();
  const blockEndTime = createdTime + (blockTime * 1000);
  const remainingMs = blockEndTime - now;
  
  if (remainingMs <= 0) {
    return { isExpired: true, seconds: 0 };
  }
  
  return {
    isExpired: false,
    seconds: Math.ceil(remainingMs / 1000)
  };
};

/**
 * Siparişin otomatik silinme süresini hesaplar
 */
export const calculateDeletionCountdown = (createdAt: string) => {
  const createdTime = new Date(createdAt).getTime();
  const now = new Date().getTime();
  const deletionTime = createdTime + (60 * 60 * 1000); // 1 saat
  const remainingMs = deletionTime - now;
  
  if (remainingMs <= 0) {
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return {
    isExpired: false,
    hours,
    minutes,
    seconds
  };
};

/**
 * Teslimat süresini hesaplar
 */
export const calculateDeliveryCountdown = (acceptedAt: string) => {
  const acceptedTime = new Date(acceptedAt).getTime();
  const now = new Date().getTime();
  const deliveryTime = acceptedTime + (60 * 60 * 1000); // 1 saat
  const remainingMs = deliveryTime - now;
  
  if (remainingMs <= 0) {
    return { isExpired: true, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return {
    isExpired: false,
    hours,
    minutes,
    seconds
  };
}; 