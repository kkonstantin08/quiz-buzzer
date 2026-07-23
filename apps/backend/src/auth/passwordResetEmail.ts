import { Resend } from 'resend';
import { config } from '../config';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!));
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  if (!config.resendApiKey) return null;

  const link = escapeHtml(resetUrl);
  const { error } = await new Resend(config.resendApiKey).emails.send({
    from: config.mailFrom,
    to: [email],
    subject: 'Восстановление пароля — КвизПульт',
    html: `<p>Вы запросили восстановление пароля в КвизПульте.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Восстановить пароль</a></p><p>Или откройте ссылку: <a href="${link}">${link}</a></p><p>Ссылка действует ${config.passwordResetTokenTtlMinutes} минут. Если вы не запрашивали восстановление, проигнорируйте это письмо.</p>`,
    text: `Вы запросили восстановление пароля в КвизПульте. Откройте ссылку: ${resetUrl}\n\nСсылка действует ${config.passwordResetTokenTtlMinutes} минут. Если вы не запрашивали восстановление, проигнорируйте это письмо.`,
  });
  return !error;
}
