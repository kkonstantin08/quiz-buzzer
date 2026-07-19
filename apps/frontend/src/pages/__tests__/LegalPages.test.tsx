import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CookiesPage } from '../legal/CookiesPage';
import { TermsPage } from '../legal/TermsPage';
import { legalConfig } from '../../config/legal';

describe('Published legal documents', () => {
  it('uses public routes and one published document date', () => {
    expect(legalConfig.urls).toMatchObject({
      details: '/legal/details',
      offer: '/offer',
      terms: '/terms',
      privacy: '/privacy',
      cookies: '/cookies',
      subscription: '/subscription',
      refunds: '/refunds',
      consent: '/consent',
    });
    expect(new Set(Object.values(legalConfig.dates))).toEqual(new Set(['18 июля 2026 года']));
  });

  it('renders the final terms and cookie policy fragments', () => {
    const terms = render(<TermsPage />);
    expect(screen.getByText(/предназначен для проведения интерактивных викторин/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Назначение Сервиса' })).toHaveClass('font-bold');
    expect(screen.getByText(/^1\.1\. Сервис предназначен/).tagName).toBe('P');
    expect(screen.getByText('Версия 1.0. Действует с 18 июля 2026 года.')).toBeInTheDocument();
    terms.unmount();

    render(<CookiesPage />);
    expect(screen.getByText(/До согласия посетителя код Метрики/i)).toBeInTheDocument();
  });
});
