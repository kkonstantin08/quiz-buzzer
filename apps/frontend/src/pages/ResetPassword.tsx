import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '../services/api';
import { PasswordRecoveryLayout } from './PasswordRecoveryLayout';

const invalidToken = 'Ссылка недействительна или срок её действия истёк';

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? '' : invalidToken);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8 || newPassword.length > 128) return setError('Пароль должен содержать от 8 до 128 символов');
    if (newPassword !== confirmation) return setError('Пароли не совпадают');
    setLoading(true);
    try {
      await api.resetPassword(token, newPassword);
      navigate('/login', { replace: true, state: { message: 'Пароль изменён. Войдите с новым паролем' } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : invalidToken);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PasswordRecoveryLayout title="Новый пароль" description="Придумайте пароль длиной не менее 8 символов">
      <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="flex gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600"><AlertCircle className="h-5 w-5 shrink-0" />{error}</p>}
        <div className="space-y-2"><Label htmlFor="reset-password">Новый пароль</Label><Input id="reset-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="reset-confirmation">Повторите новый пароль</Label><Input id="reset-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} onPaste={(event) => event.preventDefault()} required /></div>
        <Button type="submit" className="w-full" disabled={loading || !token}>{loading ? 'Изменяем...' : 'Изменить пароль'}</Button>
      </form>
    </PasswordRecoveryLayout>
  );
}
