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

  it('shows a loading state while requesting recovery', async () => {
    const { api } = await import('../../services/api');
    vi.mocked(api.forgotPassword).mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'host@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: 'Отправить инструкции' }));

    expect(await screen.findByRole('button', { name: 'Отправляем...' })).toBeDisabled();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    const { api } = await import('../../services/api');
    render(<MemoryRouter initialEntries={['/reset-password?token=valid']}><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'different-password123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than eight characters', async () => {
    const { api } = await import('../../services/api');
    render(<MemoryRouter initialEntries={['/reset-password?token=valid']}><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    expect(await screen.findByText('Пароль должен содержать от 8 до 128 символов')).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it('shows a loading state while resetting the password', async () => {
    const { api } = await import('../../services/api');
    vi.mocked(api.resetPassword).mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter initialEntries={['/reset-password?token=valid']}><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new-password123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    expect(await screen.findByRole('button', { name: 'Изменяем...' })).toBeDisabled();
  });

  it('disables reset and explains a missing token', () => {
    render(<MemoryRouter initialEntries={['/reset-password']}><ResetPassword /></MemoryRouter>);

    expect(screen.getByText('Ссылка недействительна или срок её действия истёк')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить пароль' })).toBeDisabled();
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
