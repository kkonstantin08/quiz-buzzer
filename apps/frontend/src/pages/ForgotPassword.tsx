import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '../services/api';
import { PasswordRecoveryLayout } from './PasswordRecoveryLayout';

const confirmation = 'Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Неверный формат email');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить инструкции');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PasswordRecoveryLayout title="Восстановление пароля" description="Укажите email аккаунта ведущего">
      {sent ? <div className="space-y-5 text-center"><p role="status" className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-left text-sm font-medium text-green-700"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{confirmation}</p><Button asChild variant="outline" className="w-full"><Link to="/login">Вернуться ко входу</Link></Button></div> : <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="flex gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600"><AlertCircle className="h-5 w-5 shrink-0" />{error}</p>}
        <div className="space-y-2"><Label htmlFor="forgot-email">Email</Label><Input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Отправляем...' : 'Отправить инструкции'}</Button>
        <Link to="/login" className="block text-center text-sm font-medium text-slate-600 hover:text-slate-900">Вернуться ко входу</Link>
      </form>}
    </PasswordRecoveryLayout>
  );
}
