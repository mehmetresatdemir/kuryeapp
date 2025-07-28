const nodemailer = require('nodemailer');

// Email yapılandırması
const createTransporter = () => {
    // Gmail için yapılandırma
    return nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER || 'your-email@gmail.com',
            pass: process.env.EMAIL_PASS || 'your-app-password'
        }
    });
};

// Şifre sıfırlama e-postası gönder
const sendPasswordResetEmail = async (email, resetToken, userType) => {
    try {
        const transporter = createTransporter();
        
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&type=${userType}`;
        
        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply@kuryeapp.com',
            to: email,
            subject: 'Şifre Sıfırlama Talebi - Kurye App',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">🚀 Kurye App</h1>
                        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Şifre Sıfırlama Talebi</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
                        <h2 style="color: #333; margin-top: 0;">Merhaba,</h2>
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            Kurye App hesabınız için şifre sıfırlama talebinde bulundunuz. 
                            Şifrenizi sıfırlamak için aşağıdaki butona tıklayın:
                        </p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetUrl}" 
                               style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); 
                                      color: white; 
                                      padding: 15px 30px; 
                                      text-decoration: none; 
                                      border-radius: 8px; 
                                      font-weight: bold; 
                                      font-size: 16px;
                                      display: inline-block;">
                                Şifremi Sıfırla
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; line-height: 1.6;">
                            Eğer butona tıklayamıyorsanız, aşağıdaki linki kopyalayıp tarayıcınıza yapıştırın:
                        </p>
                        <p style="color: #667eea; font-size: 14px; word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">
                            ${resetUrl}
                        </p>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-top: 20px;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                ⚠️ <strong>Güvenlik Uyarısı:</strong> Bu link 1 saat süreyle geçerlidir. 
                                Eğer bu talebi siz yapmadıysanız, lütfen bu e-postayı görmezden gelin.
                            </p>
                        </div>
                    </div>
                    
                    <div style="text-align: center; color: #999; font-size: 12px;">
                        <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                        <p>© 2025 Kurye App. Tüm hakları saklıdır.</p>
                    </div>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        return { success: true, message: 'E-posta gönderildi' };
        
    } catch (error) {
        console.error('E-posta gönderme hatası:', error);
        return { success: false, message: 'E-posta gönderilemedi', error: error.message };
    }
};

// Test e-postası gönder
const sendTestEmail = async (email) => {
    try {
        const transporter = createTransporter();
        
        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply@kuryeapp.com',
            to: email,
            subject: 'Test E-postası - Kurye App',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #667eea;">Test E-postası</h1>
                    <p>Bu bir test e-postasıdır. E-posta sistemi düzgün çalışıyor! 🎉</p>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        return { success: true, message: 'Test e-postası gönderildi' };
        
    } catch (error) {
        console.error('Test e-postası gönderme hatası:', error);
        return { success: false, message: 'Test e-postası gönderilemedi', error: error.message };
    }
};

module.exports = {
    sendPasswordResetEmail,
    sendTestEmail
}; 