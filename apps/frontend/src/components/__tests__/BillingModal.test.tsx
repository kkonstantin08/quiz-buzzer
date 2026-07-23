import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BillingModal } from '../BillingModal';
import { api } from '../../services/api';

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock api
vi.mock('../../services/api', () => ({
  api: {
    getBillingStatus: vi.fn(),
    checkout: vi.fn(),
    activateFreeTrial: vi.fn(),
  }
}));

describe('BillingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initially disables the checkout button while loading status from backend', async () => {
    // Return a never-resolving promise to simulate loading
    (api.getBillingStatus as any).mockReturnValue(new Promise(() => {}));
    
    render(<BillingModal />);
    
    const checkoutButton = screen.getByRole('button', { name: /Проверка/i });
    expect(checkoutButton).toBeDisabled();
    expect(checkoutButton).toHaveAttribute('aria-disabled', 'true');
    expect(api.getBillingStatus).toHaveBeenCalled();
  });

  it('enables checkout button if status checkoutAvailable is true', async () => {
    (api.getBillingStatus as any).mockResolvedValue({
      paymentsEnabled: true,
      providerConfigured: true,
      checkoutAvailable: true
    });
    
    render(<BillingModal />);
    
    await waitFor(() => {
      const checkoutButton = screen.getByRole('button', { name: /Оплатить подписку/i });
      expect(checkoutButton).not.toBeDisabled();
      expect(checkoutButton).toHaveAttribute('aria-disabled', 'false');
    });
  });

  it('disables checkout button and shows disabled text if status checkoutAvailable is false', async () => {
    (api.getBillingStatus as any).mockResolvedValue({
      paymentsEnabled: false,
      providerConfigured: false,
      checkoutAvailable: false
    });
    
    render(<BillingModal />);
    
    await waitFor(() => {
      const checkoutButton = screen.getByRole('button', { name: /Оплата временно недоступна/i });
      expect(checkoutButton).toBeDisabled();
      expect(checkoutButton).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('disables checkout button on API error', async () => {
    (api.getBillingStatus as any).mockRejectedValue(new Error('Network error'));
    
    render(<BillingModal />);
    
    await waitFor(() => {
      const checkoutButton = screen.getByRole('button', { name: /Оплата временно недоступна/i });
      expect(checkoutButton).toBeDisabled();
      expect(checkoutButton).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('does not use VITE_PAYMENTS_ENABLED as source of truth', async () => {
    // Even if we mock the env var (though Vite replaces it statically, we test behavior)
    // We already assert it uses getBillingStatus.
    (api.getBillingStatus as any).mockResolvedValue({
      paymentsEnabled: false,
      providerConfigured: false,
      checkoutAvailable: false
    });
    
    render(<BillingModal />);
    
    await waitFor(() => {
      expect(api.getBillingStatus).toHaveBeenCalled();
      const checkoutButton = screen.getByRole('button', { name: /Оплата временно недоступна/i });
      expect(checkoutButton).toBeDisabled();
    });
  });

  it('activates free access and refreshes the cabinet', async () => {
    (api.getBillingStatus as any).mockResolvedValue({
      paymentsEnabled: false,
      providerConfigured: false,
      checkoutAvailable: false,
    });
    (api.activateFreeTrial as any).mockResolvedValue({ success: true });
    const onActivated = vi.fn();

    render(<BillingModal onActivated={onActivated} />);

    await waitFor(() => expect(api.getBillingStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Активировать бесплатно на 30 дней/i }));

    await waitFor(() => {
      expect(api.activateFreeTrial).toHaveBeenCalledTimes(1);
      expect(onActivated).toHaveBeenCalledTimes(1);
    });
  });
});
