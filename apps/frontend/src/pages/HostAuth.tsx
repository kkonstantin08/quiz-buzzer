import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Target, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { legalConfig } from '../config/legal';

import { Footer } from '../components/Footer';

const LogoIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
    <Target className="w-6 h-6 text-white" strokeWidth={2.5} />
  </div>
);

export function HostAuth({ defaultIsLogin = true }: { defaultIsLogin?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(defaultIsLogin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Update local state if the route changes (e.g., user clicked between /login and /register)
  useEffect(() => {
    setIsLogin(defaultIsLogin);
  }, [defaultIsLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(email)) {
      setError('Неверный формат email');
      setLoading(false);
      return;
    }

    if (!isLogin) {
      if (password.length < 8) {
        setError('Пароль должен содержать минимум 8 символов');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        setLoading(false);
        return;
      }
      if (!termsAccepted) {
        setError('Необходимо принять Пользовательское соглашение');
        setLoading(false);
        return;
      }
    }

    try {
      isLogin
        ? await api.login(email, password)
        : await api.register(email, password, { termsAccepted, displayedTermsVersion: legalConfig.versions.terms });
      // Cookie is set server-side; just navigate
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <main id="main-content" tabIndex={-1} className="flex-1 relative flex flex-col items-center justify-center p-4 overflow-hidden focus:outline-none">
        {/* Background decoration matching Landing Page */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <div className="absolute w-[400px] h-[400px] bg-blue-200/40 rounded-full mix-blend-multiply blur-[80px] translate-x-10 -translate-y-20"></div>
          <div className="absolute w-[300px] h-[300px] bg-red-200/40 rounded-full mix-blend-multiply blur-[80px] -translate-x-20 translate-y-20"></div>

          {/* Floating geometric confetti */}
          <div className="hidden md:block absolute top-[15%] left-[10%] md:left-[20%] w-8 h-8 rounded-full bg-yellow-300 opacity-60 animate-bounce" style={{ animationDuration: '3s' }}></div>
          <div className="hidden md:block absolute bottom-[20%] left-[5%] md:left-[25%] w-6 h-6 rounded-lg bg-blue-300 opacity-60 transform rotate-45 animate-pulse" style={{ animationDuration: '4s' }}></div>
          <div className="hidden md:block absolute top-[25%] right-[10%] md:right-[20%] w-10 h-10 rounded-full bg-red-300 opacity-50 animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '3.5s' }}></div>
          <div className="hidden md:block absolute bottom-[15%] right-[5%] md:right-[25%] w-7 h-7 rounded-full bg-green-300 opacity-60 animate-pulse" style={{ animationDelay: '1s', animationDuration: '2.5s' }}></div>
        </div>

        <Link to="/" className="mb-8 flex items-center justify-center gap-3 relative z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <LogoIcon />
          <h1 className="text-3xl font-black text-slate-800 tracking-tight drop-shadow-sm">КвизПульт</h1>
        </Link>

        <Card className="w-full max-w-md shadow-2xl shadow-slate-200/50 border border-white/60 bg-white/70 backdrop-blur-md relative z-10 overflow-hidden flex flex-col z-20">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold">{isLogin ? 'Вход в аккаунт' : 'Регистрация'}</CardTitle>
            <CardDescription className="text-slate-600 font-medium">Для ведущих и организаторов</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {error && (
              <div role="alert" className="mb-4 flex items-center gap-2 p-3 text-sm font-medium text-red-600 bg-red-50/80 backdrop-blur-sm border border-red-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email" className="sr-only">Email</Label>
                <Input
                  id="auth-email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  aria-invalid={!!error}
                  className="h-12 bg-white/80 border-slate-200/60 focus:bg-white transition-colors"
                />
              </div>
              <div className="relative">
                <Label htmlFor="auth-password" className="sr-only">Пароль</Label>
                <Input
                  id="auth-password"
                  name="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  type={showPassword ? "text" : "password"}
                  placeholder="Пароль"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  aria-invalid={!!error}
                  className="h-12 bg-white/80 border-slate-200/60 focus:bg-white transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-0 h-full flex items-center justify-center text-slate-500 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {!isLogin && (
                <>
                  <div className="relative">
                    <Label htmlFor="auth-confirm-password" className="sr-only">Повторите пароль</Label>
                    <Input
                      id="auth-confirm-password"
                      name="confirm-password"
                      autoComplete="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Повторите пароль"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      onPaste={e => e.preventDefault()}
                      required
                      aria-invalid={!!error}
                      className="h-12 bg-white/80 border-slate-200/60 focus:bg-white transition-colors pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-0 h-full flex items-center justify-center text-slate-500 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
                      aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id="terms-checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="terms-checkbox" className="text-sm font-normal text-slate-600 leading-snug">
                        Я принимаю <Link to="/legal/terms" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Пользовательское соглашение</Link>.
                      </Label>
                    </div>
                    <div className="text-sm text-slate-500 leading-snug pl-6">
                      Регистрируясь, вы подтверждаете, что ознакомились с <Link to="/legal/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Политикой обработки персональных данных</Link>.
                    </div>
                  </div>
                </>
              )}
              <Button type="submit" className="w-full h-12 text-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" disabled={loading}>
                {loading ? 'Загрузка...' : isLogin ? 'Войти' : 'Зарегистрироваться'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-slate-200/50 pt-6 bg-white/30 mt-2">
            <Button variant="link" className="text-slate-600 hover:text-slate-900 font-medium" onClick={() => {
              setIsLogin(!isLogin);
              navigate(isLogin ? '/register' : '/login', { replace: true });
            }}>
              {isLogin ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
            </Button>
          </CardFooter>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
