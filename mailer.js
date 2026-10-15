const nodemailer = require('nodemailer');

// ==========================================
// CONFIGURAÇÃO DO SERVIÇO DE E-MAIL (GMAIL / SMTP)
// ==========================================

function getSmtpConfig() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || '';
  const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_PASS || '').replace(/\s+/g, '');
  const host = process.env.SMTP_HOST || (user.includes('@gmail.com') ? 'smtp.gmail.com' : '');
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return { user, pass, host, port, secure };
}

function isConfigured() {
  const { user, pass, host } = getSmtpConfig();
  return Boolean(user && pass && host);
}

function createTransporter() {
  const { user, pass, host, port, secure } = getSmtpConfig();
  if (!user || !pass || !host) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

function getFromAddress() {
  const { user } = getSmtpConfig();
  const fromName = process.env.SMTP_FROM_NAME || 'Placar Champions';
  return user ? `"${fromName}" <${user}>` : `"${fromName}" <noreply@placarchampions.com>`;
}

// ==========================================
// TEMPLATE DE E-MAIL BASE ESTILIZADO (DARK THEME)
// ==========================================
function wrapEmailHtml({ title, preheader, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #07090e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }
    .email-container { max-width: 580px; margin: 30px auto; background: #0f172a; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); }
    .email-header { background: linear-gradient(135deg, #07090e, #1e293b); padding: 32px 24px; text-align: center; border-bottom: 1px solid rgba(0, 242, 254, 0.25); }
    .email-logo { font-size: 40px; line-height: 1; margin-bottom: 8px; }
    .email-brand { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; margin: 0; }
    .email-brand span { color: #00f2fe; }
    .email-body { padding: 32px 28px; line-height: 1.6; }
    .email-title { font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 14px 0; }
    .email-text { font-size: 15px; color: #cbd5e1; margin: 0 0 20px 0; }
    .highlight-box { background: rgba(0, 242, 254, 0.08); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 12px; padding: 18px 20px; margin: 24px 0; text-align: center; }
    .highlight-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.75px; margin-bottom: 6px; }
    .highlight-value { font-size: 24px; font-weight: 800; color: #00f2fe; letter-spacing: 2px; font-family: monospace; }
    .cta-button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00f2fe, #4facfe); color: #000000 !important; font-weight: 800; font-size: 15px; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 15px rgba(0, 242, 254, 0.3); margin: 12px 0 20px 0; }
    .cta-button-gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); }
    .email-footer { background: #07090e; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.06); }
    .email-footer a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || title}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #07090e; padding: 20px 0;">
    <tr>
      <td align="center">
        <div class="email-container">
          <div class="email-header">
            <div class="email-logo">🏐</div>
            <h1 class="email-brand">Placar <span>Champions</span></h1>
          </div>
          <div class="email-body">
            ${contentHtml}
          </div>
          <div class="email-footer">
            <p style="margin: 0 0 6px 0;">Placar Champions - Sistema de Placar Digital, Sorteio & Gestão de Peladas de Vôlei.</p>
            <p style="margin: 0;">Se você não solicitou esta mensagem, pode desconsiderá-la com segurança.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ==========================================
// 1. E-MAIL DE CONVITE PARA A PELADA
// ==========================================
async function sendInviteEmail({ to, peladaName, peladaId, inviteCode, inviterName, role, inviteUrl }) {
  const roleName = role === 'admin' ? 'Administrador' : (role === 'espectador' ? 'Espectador' : 'Votante');
  const roleEmoji = role === 'admin' ? '⭐' : (role === 'espectador' ? '👁️' : '🏐');

  const contentHtml = `
    <h2 class="email-title">Você foi convidado para a pelada! 🎉</h2>
    <p class="email-text">
      Olá! <strong>${escapeHtml(inviterName || 'Um organizador')}</strong> convidou você para fazer parte da sala <strong>"${escapeHtml(peladaName)}"</strong> no Placar Champions.
    </p>

    <div class="highlight-box">
      <div class="highlight-label">Seu papel nesta sala:</div>
      <div style="font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 8px;">
        ${roleEmoji} ${roleName}
      </div>
      <div class="highlight-label" style="margin-top: 10px;">Código da Sala:</div>
      <div class="highlight-value">${escapeHtml(inviteCode || String(peladaId))}</div>
    </div>

    <p class="email-text" style="text-align: center;">
      Clique no botão abaixo para aceitar o convite e acessar a escalação, placar e votações:
    </p>

    <div style="text-align: center;">
      <a href="${inviteUrl}" class="cta-button" target="_blank">
        ⚡ Aceitar Convite e Acessar Sala
      </a>
    </div>

    <p class="email-text" style="font-size: 12px; color: #94a3b8; text-align: center;">
      Se o botão não funcionar, copie e cole este link no seu navegador:<br>
      <a href="${inviteUrl}" style="color: #38bdf8; word-break: break-all;">${inviteUrl}</a>
    </p>
  `;

  const subject = `🏐 Convite para a pelada "${peladaName}" no Placar Champions`;
  const text = `Olá!\n\n${inviterName || 'Um organizador'} convidou você para a pelada "${peladaName}".\n\nPapel: ${roleName}\nCódigo da sala: ${inviteCode}\n\nAcesse pelo link: ${inviteUrl}\n\nPlacar Champions`;

  const html = wrapEmailHtml({
    title: subject,
    preheader: `${inviterName} convidou você para ${peladaName} no Placar Champions!`,
    contentHtml
  });

  return dispatchEmail({ to, subject, text, html, logType: 'CONVITE PELADA' });
}

// ==========================================
// 2. E-MAIL DE RECUPERAÇÃO DE SENHA
// ==========================================
async function sendPasswordResetEmail({ to, userName, resetUrl }) {
  const contentHtml = `
    <h2 class="email-title">Recuperação de Senha 🔑</h2>
    <p class="email-text">
      Olá, <strong>${escapeHtml(userName || 'Atleta')}</strong>!
    </p>
    <p class="email-text">
      Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Placar Champions</strong>.
    </p>

    <p class="email-text" style="text-align: center;">
      Clique no botão abaixo para criar uma nova senha:
    </p>

    <div style="text-align: center;">
      <a href="${resetUrl}" class="cta-button cta-button-gold" target="_blank">
        🔒 Redefinir Minha Senha
      </a>
    </div>

    <div style="background: rgba(251, 191, 36, 0.08); border-left: 3px solid #fbbf24; border-radius: 6px; padding: 12px 14px; margin: 20px 0;">
      <p style="margin: 0; font-size: 13px; color: #cbd5e1;">
        ⏰ <strong>Importante:</strong> Este link é válido por <strong>1 hora</strong>. Se você não solicitou a troca de senha, pode ignorar este e-mail; sua senha continuará a mesma.
      </p>
    </div>

    <p class="email-text" style="font-size: 12px; color: #94a3b8; text-align: center;">
      Se o botão não funcionar, copie este link no navegador:<br>
      <a href="${resetUrl}" style="color: #38bdf8; word-break: break-all;">${resetUrl}</a>
    </p>
  `;

  const subject = `🔑 Recuperação de Senha - Placar Champions`;
  const text = `Olá, ${userName || 'Atleta'}!\n\nRecebemos uma solicitação para redefinir sua senha no Placar Champions.\n\nAcesse o link abaixo para criar sua nova senha (válido por 1 hora):\n${resetUrl}\n\nSe você não solicitou, ignore esta mensagem.`;

  const html = wrapEmailHtml({
    title: subject,
    preheader: `Link de redefinição de senha para sua conta no Placar Champions`,
    contentHtml
  });

  return dispatchEmail({ to, subject, text, html, logType: 'RECUPERAÇÃO DE SENHA' });
}

// ==========================================
// DISPATCH GENÉRICO (ENVIA OU SIMULA SE SEM SMTP)
// ==========================================
async function dispatchEmail({ to, subject, text, html, logType }) {
  const configured = isConfigured();

  if (!configured) {
    console.log(`\n==================================================`);
    console.log(`📧 [MAILER - SIMULAÇÃO] (${logType})`);
    console.log(`Para: ${to}`);
    console.log(`Assunto: ${subject}`);
    console.log(`Status: SMTP não configurado (adicione SMTP_USER e SMTP_PASS no .env/Railway)`);
    console.log(`Texto:\n${text}`);
    console.log(`==================================================\n`);

    return {
      sent: false,
      simulated: true,
      message: 'SMTP não configurado. Mensagem simulada no console do servidor.'
    };
  }

  const transporter = createTransporter();
  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject,
      text,
      html
    });

    console.log(`✅ [MAILER] E-mail enviado com sucesso para ${to}. ID: ${info.messageId}`);
    return { sent: true, simulated: false, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [MAILER] Erro ao enviar e-mail para ${to}:`, error.message);
    throw new Error(`Falha no envio de e-mail: ${error.message}`);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  isConfigured,
  getSmtpConfig,
  sendInviteEmail,
  sendPasswordResetEmail
};
