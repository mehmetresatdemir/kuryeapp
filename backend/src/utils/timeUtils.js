/**
 * İki tarih arasındaki dakika farkını hesaplar
 */
function getMinutesDifference(startDate, endDate = new Date()) {
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return Math.floor((end.getTime() - start.getTime()) / 60000);
    } catch (error) {
        console.error('Dakika farkı hesaplanırken hata:', error);
        return 0;
    }
}

/**
 * Sipariş için kalan süreyi hesaplar (45 dakika limiti)
 */
function getOrderRemainingTime(orderCreatedAt, orderStatus) {
    try {
        if (orderStatus === 'teslim edildi' || orderStatus === 'iptal edildi') {
            return -1; // Tamamlanmış siparişler için -1
        }

        const elapsedMinutes = getMinutesDifference(orderCreatedAt);
        const remainingMinutes = 45 - elapsedMinutes;
        
        return remainingMinutes;
    } catch (error) {
        console.error('Sipariş kalan süresi hesaplanırken hata:', error);
        return 0;
    }
}

module.exports = {
    getMinutesDifference,
    getOrderRemainingTime
}; 