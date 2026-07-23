import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HostAuth } from '../HostAuth';
import { ForgotPassword } from '../ForgotPassword';
import { ResetPassword } from '../ResetPassword';

vi.mock('../../services/api', () => ({
  api: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

function LoginMessage() {
  const location = useLocation();
  return <p>{(location.state as { message?: string } | null)?.message}</p>;
}

describe('password recovery pages', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { api } = await import('../../services/api');
    vi.mocked(api.forgotPassword).mockResolvedValue({});
    vi.mocked(api.resetPassword).mockResolvedValue({});
  });

  it('links to password recovery from login', () => {
    render(<MemoryRouter><HostAuth defaultIsLogin /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute('href', '/forgot-password');
  });

  it('shows the neutral sent state after a recovery request', async () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'host@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить инструкции' }));

    expect(await screen.findByText('Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля')).toBeInTheDocument();
  });

  it('shows an invalid token error returned by the reset endpoint', async () => {
    const { api } = await import('../../services/api');
    vi.mocked(api.resetPassword).mockRejectedValue(new Error('Ссылка недействительна или срок её действия истёк'));
    render(<MemoryRouter initialEntries={['/reset-password?token=expired']}><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    expect(await screen.findByText('Ссылка недействительна или срок её действия истёк')).toBeInTheDocument();
  });

  it('redirects to login with the requested success message', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<LoginMessage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    await waitFor(() => expect(screen.getByText('Пароль изменён. Войдите с новым паролем')).toBeInTheDocument());
  });
});
