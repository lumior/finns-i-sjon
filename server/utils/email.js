const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@finnsisjon.se';
// Railway sätter RAILWAY_PUBLIC_DOMAIN automatiskt
const RAILWAY_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || (RAILWAY_DOMAIN ? `https://${RAILWAY_DOMAIN}` : 'http://localhost:3000');

let transporter = null;

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        console.log('📧 SMTP inte konfigurerat — e-post loggas till konsolen');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    return transporter;
}

async function sendEmail({ to, subject, text, html }) {
    const transport = getTransporter();

    const mailOptions = {
        from: SMTP_FROM,
        to,
        subject,
        text,
        html
    };

    if (!transport) {
        console.log('=== E-POST (loggläge) ===');
        console.log('Till:', to);
        console.log('Ämne:', subject);
        console.log('Text:', text);
        console.log('=========================');
        return { messageId: 'logged-to-console' };
    }

    try {
        const info = await transport.sendMail(mailOptions);
        console.log('📧 E-post skickad:', info.messageId);
        return info;
    } catch (err) {
        console.error('❌ Kunde inte skicka e-post:', err.message);
        throw err;
    }
}

async function sendVerificationEmail(email, token) {
    const verifyUrl = `${FRONTEND_URL}/verify-email.html?token=${token}`;

    await sendEmail({
        to: email,
        subject: 'Bekräfta din e-postadress — FISK',
        text: `Hej!\n\nKlicka på länken för att bekräfta din e-postadress:\n${verifyUrl}\n\nLänken är giltig i 24 timmar.`,
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2>🎣 Välkommen till FISK — Finns i sjön!</h2>
                <p>Klicka på knappen nedan för att bekräfta din e-postadress:</p>
                <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Bekräfta e-post</a>
                <p style="color: #666; font-size: 0.9rem;">Länken är giltig i 24 timmar. Om du inte registrerade dig kan du ignorera detta meddelande.</p>
                <p style="color: #666; font-size: 0.85rem;">Om knappen inte fungerar, kopiera denna länk: ${verifyUrl}</p>
            </div>
        `
    });
}

async function sendPasswordResetEmail(email, token) {
    const resetUrl = `${FRONTEND_URL}/reset-password.html?token=${token}`;

    await sendEmail({
        to: email,
        subject: 'Återställ ditt lösenord — FISK',
        text: `Hej!\n\nKlicka på länken för att återställa ditt lösenord:\n${resetUrl}\n\nLänken är giltig i 1 timme.`,
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2>🔒 Återställ ditt lösenord</h2>
                <p>Klicka på knappen nedan för att välja ett nytt lösenord:</p>
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Återställ lösenord</a>
                <p style="color: #666; font-size: 0.9rem;">Länken är giltig i 1 timme. Om du inte begärde detta kan du ignorera meddelandet.</p>
                <p style="color: #666; font-size: 0.85rem;">Om knappen inte fungerar, kopiera denna länk: ${resetUrl}</p>
            </div>
        `
    });
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
