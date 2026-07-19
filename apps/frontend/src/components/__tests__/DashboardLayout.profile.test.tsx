import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLayout } from '../DashboardLayout';
import { api } from '../../services/api';
import { toast } from 'sonner';

vi.mock('../BillingModal', () => ({ BillingModal: () => null }));
vi.mock('../../services/api', () => ({
  api: {
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const onProfileUpdated = vi.fn();

function renderProfile() {
  return render(
    <MemoryRouter>
      <DashboardLayout
        email="host@example.com"
        hasSubscription
        onLogout={() => undefined}
        onCreateRoom={() => undefined}
        onProfileUpdated={onProfileUpdated}
      >
        <div>Dashboard</div>
      </DashboardLayout>
    </MemoryRouter>,
  );
}

function openProfile() {
  fireEvent.click(screen.getByText('host@example.com'));
}

describe('DashboardLayout profile security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.updateProfile).mockResolvedValue({ name: 'Ada', email: 'host@example.com' });
    vi.mocked(api.changePassword).mockResolvedValue({ success: true });
  });

  it('sends a name-only update without email or currentPassword', async () => {
    renderProfile();
    openProfile();

    fireEvent.change(screen.getByLabelText('Имя (необязательно)'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Ada' }));
    expect(onProfileUpdated).toHaveBeenCalledWith('Ada', 'host@example.com');
  });

  it('requires and submits the current password only for a changed email', async () => {
    renderProfile();
    openProfile();

    fireEvent.change(screen.getByLabelText('Email (Логин)'), { target: { value: 'new@example.com' } });
    const currentPassword = screen.getByLabelText('Текущий пароль для смены email');
    fireEvent.change(currentPassword, { target: { value: 'current-password' } });
    vi.mocked(api.updateProfile).mockResolvedValue({ name: null, email: 'new@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ email: 'new@example.com', currentPassword: 'current-password' }));
  });

  it('validates and clears the password-change form after success', async () => {
    renderProfile();
    openProfile();

    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'current-password' } });
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'different-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));
    expect(api.changePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith({ currentPassword: 'current-password', newPassword: 'new-password123' }));
    expect(screen.getByLabelText('Текущий пароль')).toHaveValue('');
    expect(screen.getByLabelText('Новый пароль')).toHaveValue('');
    expect(screen.getByLabelText('Повторите новый пароль')).toHaveValue('');
  });

  it('shows a clear translated error when password change is rejected', async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new Error('Не удалось изменить пароль'));
    renderProfile();
    openProfile();

    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'current-password' } });
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new-password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ошибка смены пароля', { description: 'Не удалось изменить пароль' }));
  });

  it('opens the shared profile dialog from the mobile trigger and clears passwords on close', () => {
    renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть профиль' }));
    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'current-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть профиль' }));

    expect(screen.getByLabelText('Текущий пароль')).toHaveValue('');
    expect(screen.getAllByText('Профиль')).toHaveLength(1);
  });
});
