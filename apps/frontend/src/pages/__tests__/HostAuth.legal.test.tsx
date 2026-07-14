import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { HostAuth } from '../HostAuth';

vi.mock('../../services/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  }
}));

describe('HostAuth - Legal Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires accepting terms during registration', async () => {
    render(
      <BrowserRouter>
        <HostAuth />
      </BrowserRouter>
    );

    // Switch to Registration mode
    fireEvent.click(screen.getByRole('button', { name: /Нет аккаунта\? Зарегистрируйтесь/i }));

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Пароль');
    const confirmPasswordInput = screen.getByLabelText('Повторите пароль');
    const submitBtn = screen.getByRole('button', { name: /Зарегистрироваться/i });

    // Fill inputs
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    // Terms checkbox should be present
    const termsCheckbox = screen.getByRole('checkbox', { name: /Я принимаю/i });
    expect(termsCheckbox).toBeInTheDocument();
    expect(termsCheckbox).not.toBeChecked();

    // Click register without accepting
    fireEvent.click(submitBtn);

    // Expect an error toast or similar indicating terms must be accepted
    // Check if the mock wasn't called
    const { api } = await import('../../services/api');
    expect(api.register).not.toHaveBeenCalled();

    // Now accept terms
    fireEvent.click(termsCheckbox);
    expect(termsCheckbox).toBeChecked();

    fireEvent.click(submitBtn);

    // Should call register
    await waitFor(() => {
      expect(api.register).toHaveBeenCalled();
    });
  });

  it('does not require terms for login', async () => {
    render(
      <BrowserRouter>
        <HostAuth />
      </BrowserRouter>
    );

    // Default mode is Login
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Пароль');
    const submitBtn = screen.getByRole('button', { name: /Войти/i });

    // Terms checkbox should NOT be present
    expect(screen.queryByRole('checkbox', { name: /Я принимаю условия/i })).not.toBeInTheDocument();

    // Fill inputs
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    fireEvent.click(submitBtn);

    const { api } = await import('../../services/api');
    await waitFor(() => {
      expect(api.login).toHaveBeenCalled();
    });
  });

  it('displays error message when document version mismatches', async () => {
    const { api } = await import('../../services/api');
    const err: any = new Error('Версия документа изменилась...');
    err.code = 'DOCUMENT_VERSION_MISMATCH';
    api.register = vi.fn().mockRejectedValue(err);

    render(
      <BrowserRouter>
        <HostAuth />
      </BrowserRouter>
    );

    // Switch to Registration mode
    fireEvent.click(screen.getByRole('button', { name: /Нет аккаунта\? Зарегистрируйтесь/i }));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'password123' } });
    
    // Accept terms
    fireEvent.click(screen.getByRole('checkbox', { name: /Я принимаю/i }));
    
    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Зарегистрироваться/i }));

    await waitFor(() => {
      expect(screen.getByText('Версия Пользовательского соглашения изменилась. Обновите страницу, ознакомьтесь с новой редакцией и повторите регистрацию.')).toBeInTheDocument();
    });
  });

  it('displays error message when registration is disabled', async () => {
    const { api } = await import('../../services/api');
    const err: any = new Error('Регистрация закрыта');
    err.code = 'REGISTRATION_DISABLED';
    api.register = vi.fn().mockRejectedValue(err);

    render(
      <BrowserRouter>
        <HostAuth />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Нет аккаунта\? Зарегистрируйтесь/i }));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Я принимаю/i }));
    fireEvent.click(screen.getByRole('button', { name: /Зарегистрироваться/i }));

    await waitFor(() => {
      expect(screen.getByText('Регистрация временно недоступна до публикации окончательной редакции Пользовательского соглашения')).toBeInTheDocument();
    });
  });
});
