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
});
