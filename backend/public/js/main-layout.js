document.addEventListener('DOMContentLoaded', function() {
    const headerPlaceholder = document.createElement('div');
    const pageTitle = document.title || 'Admin Panel';
    const pageName = pageTitle.split(' - ')[1] || 'Dashboard';

    const headerHTML = `
        <style>
            .status-bar {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                justify-content: space-around;
                align-items: center;
                padding: 12px 15px;
                font-size: 13px;
                z-index: 1001;
                flex-wrap: wrap;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                backdrop-filter: blur(10px);
            }
            .status-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                backdrop-filter: blur(5px);
                transition: all 0.3s ease;
                font-weight: 500;
            }
            .status-item:hover {
                background: rgba(255, 255, 255, 0.15);
                transform: translateY(-1px);
            }
            .status-indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #f56565;
                animation: pulse 2s infinite;
                box-shadow: 0 0 0 3px rgba(245, 101, 101, 0.3);
            }
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(245, 101, 101, 0.7); }
                70% { box-shadow: 0 0 0 6px rgba(245, 101, 101, 0); }
                100% { box-shadow: 0 0 0 0 rgba(245, 101, 101, 0); }
            }
            .status-indicator.green { 
                background-color: #48bb78; 
                box-shadow: 0 0 0 3px rgba(72, 187, 120, 0.3);
            }
            .status-indicator.yellow { 
                background-color: #ecc94b; 
                box-shadow: 0 0 0 3px rgba(236, 201, 75, 0.3);
            }
            .status-indicator.red { 
                background-color: #f56565; 
                box-shadow: 0 0 0 3px rgba(245, 101, 101, 0.3);
            }
            .main-content-header {
                padding: 2rem 2.5rem;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%);
                backdrop-filter: blur(20px);
                border-radius: 20px;
                margin-bottom: 2.5rem;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
                margin-top: 70px;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .main-content-header h1 {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                font-size: 2.2rem;
                font-weight: 700;
                margin: 0 0 1rem 0;
                text-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .nav-links {
                display: flex;
                gap: 0.8rem;
                margin-top: 1.5rem;
                flex-wrap: wrap;
            }
            .nav-link {
                padding: 0.75rem 1.5rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 12px;
                transition: all 0.3s ease;
                font-size: 0.95rem;
                font-weight: 500;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.2);
                position: relative;
                overflow: hidden;
            }
            .nav-link::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                transition: left 0.5s;
            }
            .nav-link:hover::before {
                left: 100%;
            }
            .nav-link:hover { 
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }
            .nav-link.active { 
                background: linear-gradient(135deg, #4c51bf 0%, #553c9a 100%);
                font-weight: 600;
                box-shadow: 0 6px 20px rgba(76, 81, 191, 0.4);
            }
            
            /* Mobile Responsive Styles */
            @media (max-width: 768px) {
                .status-bar {
                    padding: 8px 10px;
                    font-size: 11px;
                    gap: 8px;
                }
                .status-item {
                    padding: 4px 8px;
                    font-size: 10px;
                    min-width: auto;
                }
                .main-content-header {
                    padding: 1.5rem 1rem;
                    margin-top: 60px;
                    margin-bottom: 2rem;
                }
                .main-content-header h1 {
                    font-size: 1.8rem;
                    margin-bottom: 0.5rem;
                }
                .nav-links {
                    gap: 0.5rem;
                    justify-content: center;
                }
                .nav-link {
                    padding: 0.6rem 1rem;
                    font-size: 0.85rem;
                    flex: 1;
                    text-align: center;
                    min-width: auto;
                }
            }
            
            @media (max-width: 576px) {
                .status-bar {
                    padding: 6px 8px;
                    font-size: 10px;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                .status-item {
                    padding: 3px 6px;
                    font-size: 9px;
                    flex: 1;
                    min-width: 80px;
                    justify-content: center;
                }
                .main-content-header {
                    padding: 1rem 0.8rem;
                    margin-top: 80px;
                }
                .main-content-header h1 {
                    font-size: 1.5rem;
                }
                .nav-links {
                    flex-wrap: wrap;
                    gap: 0.3rem;
                }
                .nav-link {
                    padding: 0.5rem 0.8rem;
                    font-size: 0.8rem;
                    flex: 1 1 calc(50% - 0.15rem);
                    min-width: calc(50% - 0.15rem);
                }
            }
        </style>

        <div class="status-bar" id="status-bar">
            <div class="status-item">
                <div id="api-status" class="status-indicator"></div>
                <span>API</span>
            </div>
            <div class="status-item">
                <div id="db-status" class="status-indicator"></div>
                <span>Database</span>
            </div>
            <div class="status-item">
                <div id="socket-status" class="status-indicator"></div>
                <span>Socket.IO</span>
            </div>
            <div class="status-item">
                <i class="fas fa-box-open"></i>
                <span>Aktif Sipariş: <b id="active-orders-count">0</b></span>
            </div>
            <div class="status-item">
                <i class="fas fa-motorcycle"></i>
                <span>Aktif Kurye: <b id="active-couriers-count">0</b></span>
            </div>
            <div class="status-item">
                <i class="fas fa-check-circle"></i>
                <span>Bugün Biten: <b id="completed-today-count">0</b></span>
            </div>
        </div>

        <div class="main-content-header">
            <h1>🚀 KuryeX - ${pageName}</h1>
            <div class="nav-links">
                <a href="admin-dashboard.html" class="nav-link ${pageName === 'Dashboard' ? 'active' : ''}">Dashboard</a>
                <a href="admin-orders.html" class="nav-link ${pageName === 'Orders' ? 'active' : ''}">Siparişler</a>
                <a href="admin-couriers.html" class="nav-link ${pageName === 'Couriers' ? 'active' : ''}">Kuryeler</a>
                <a href="admin-restaurants.html" class="nav-link ${pageName === 'Restaurants' ? 'active' : ''}">Restoranlar</a>
                <a href="admin-earnings.html" class="nav-link ${pageName === 'Earnings' ? 'active' : ''}">Kazançlar</a>
                <a href="admin-analytics.html" class="nav-link ${pageName === 'Analytics' ? 'active' : ''}">Analiz</a>
                <a href="admin-settings.html" class="nav-link ${pageName === 'Settings' ? 'active' : ''}">Ayarlar</a>
                <a href="admin-support.html" class="nav-link ${pageName === 'Support' ? 'active' : ''}">🎧 Destek</a>
                <a href="admin-content.html" class="nav-link ${pageName === 'Content' ? 'active' : ''}">📄 İçerik</a>
                <a href="admin-db-management.html" class="nav-link ${pageName === 'DB Management' ? 'active' : ''}">Veritabanı</a>
                <button onclick="adminLogout()" class="nav-link" style="background: #dc2626; border: none; cursor: pointer;">🚪 Çıkış</button>
            </div>
        </div>
    `;

    // Find the main container or body, and prepend the header
    const container = document.querySelector('.container') || document.body;
    container.prepend(headerPlaceholder);
    headerPlaceholder.outerHTML = headerHTML;
    
    // The rest of the page's content should follow this header.
    // We also need a socket client to update the status.
    initializeStatusSockets();
});

function initializeStatusSockets() {
    // Raspberry Pi için optimize edilmiş Socket.IO ayarları
    const socket = io({
        timeout: 45000,
        reconnection: true,
        reconnectionDelay: 2000,      // 2 saniye sonra tekrar dene
        reconnectionDelayMax: 10000,  // Maksimum 10 saniye
        reconnectionAttempts: 10,     // 10 kez dene
        transports: ['websocket', 'polling'],
        upgrade: true,
        forceNew: false
    });

    const apiStatus = document.getElementById('api-status');
    const dbStatus = document.getElementById('db-status');
    const socketStatus = document.getElementById('socket-status');
    const activeOrdersCount = document.getElementById('active-orders-count');
    const activeCouriersCount = document.getElementById('active-couriers-count');
    const completedTodayCount = document.getElementById('completed-today-count');

    let reconnectCount = 0;
    let lastConnectionTime = null;

    socket.on('connect', () => {
        console.log('🟢 Admin bağlantısı kuruldu');
        socketStatus.className = 'status-indicator green';
        reconnectCount = 0;
        lastConnectionTime = new Date();
        
        // Admin room'a katıl
        socket.emit('joinAdminRoom');
        
        // Admin bağlantısını bildir
        socket.emit('admin:connect', {
            adminId: `admin_${Date.now()}`,
            timestamp: new Date().toISOString()
        });
        
        // İlk veriyi talep et
        socket.emit('admin:request-main-stats');
    });

    socket.on('connect_error', (error) => {
        console.error('🔴 Admin bağlantı hatası:', error);
        socketStatus.className = 'status-indicator red';
    });

    socket.on('disconnect', (reason) => {
        console.log('🟡 Admin bağlantısı kesildi:', reason);
        socketStatus.className = 'status-indicator yellow';
        reconnectCount++;
        
        // Raspberry Pi'de sık görülen bağlantı kesme sebepleri
        if (reason === 'transport close' || reason === 'ping timeout') {
            console.log('🔄 Raspberry Pi bağlantı sorunu, yeniden bağlanıyor...');
        }
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`🟢 Admin yeniden bağlandı (deneme ${attemptNumber})`);
        socketStatus.className = 'status-indicator green';
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 Admin yeniden bağlantı denemesi ${attemptNumber}`);
        socketStatus.className = 'status-indicator yellow';
    });

    socket.on('reconnect_failed', () => {
        console.error('🔴 Admin yeniden bağlantı başarısız!');
        socketStatus.className = 'status-indicator red';
        
        // Manuel reload öner
        if (confirm('Bağlantı kurulamadı. Sayfayı yeniden yüklemek ister misiniz?')) {
            location.reload();
        }
    });

    // Server ping'ine cevap ver
    socket.on('admin:server-ping', (data) => {
        socket.emit('admin:pong', {
            timestamp: Date.now(),
            serverTimestamp: data.timestamp
        });
    });

    socket.on('admin:main-stats', (data) => {
        // API and DB status
        apiStatus.className = `status-indicator ${data.apiOk ? 'green' : 'red'}`;
        dbStatus.className = `status-indicator ${data.dbOk ? 'green' : 'red'}`;

        // Live counts
        activeOrdersCount.textContent = data.activeOrders;
        activeCouriersCount.textContent = data.activeCouriers;
        completedTodayCount.textContent = data.completedToday;
        
        // Bağlantı kalitesi kontrolü
        if (data.connectionId) {
            console.log(`📊 İstatistik güncellendi - Bağlantı ID: ${data.connectionId}`);
        }
    });

    // We can also set an interval to check API health via fetch,
    // as a fallback or for non-socket health checks.
    setInterval(async () => {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            apiStatus.className = `status-indicator ${response.ok ? 'green' : 'red'}`;
            dbStatus.className = `status-indicator ${data.database.status === 'ok' ? 'green' : 'red'}`;
        } catch (error) {
            apiStatus.className = 'status-indicator red';
        }
    }, 15000); // Check every 15 seconds
}

// Helper function to get authorization headers
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (token) {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }
    return { 'Content-Type': 'application/json' };
}

// Logout fonksiyonu
function adminLogout() {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('adminAuth');
        window.location.href = 'admin-login.html';
    }
}

// Bildirim gösterme fonksiyonu
function showNotification(message, type = 'info', duration = 3000) {
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        const newContainer = document.createElement('div');
        newContainer.id = 'notification-container';
        newContainer.style.position = 'fixed';
        newContainer.style.top = '20px';
        newContainer.style.right = '20px';
        newContainer.style.zIndex = '10000';
        newContainer.style.display = 'flex';
        newContainer.style.flexDirection = 'column';
        newContainer.style.gap = '10px';
        document.body.appendChild(newContainer);
        notificationContainer = newContainer;
    }

    const notification = document.createElement('div');
    notification.className = 'notification-item';
    notification.textContent = message;

    let bgColor = '#333';
    let textColor = 'white';
    switch (type) {
        case 'success':
            bgColor = '#28a745';
            break;
        case 'error':
            bgColor = '#dc3545';
            break;
        case 'warning':
            bgColor = '#ffc107';
            textColor = '#333';
            break;
        case 'info':
        default:
            bgColor = '#17a2b8';
            break;
    }

    notification.style.background = bgColor;
    notification.style.color = textColor;
    notification.style.padding = '12px 20px';
    notification.style.borderRadius = '8px';
    notification.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.5s ease-out';

    notificationContainer.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        notification.addEventListener('transitionend', () => notification.remove());
    }, duration);
}

// Notification styles (add these to the <style> tag in your main HTML files, or a common CSS file)
/*
.notification-item {
    min-width: 250px;
}
*/ 