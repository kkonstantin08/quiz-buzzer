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
    expect(legalConfig.documentVersion).toBe('1.0');
    expect(legalConfig.effectiveDate).toBe('18 июля 2026 года');
    expect(new Set(Object.values(legalConfig.dates))).toEqual(new Set([legalConfig.effectiveDate]));
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

  it('updates document metadata and restores it after leaving the page', () => {
    document.title = 'КвизПульт';
    const view = render(<TermsPage />);

    expect(document.title).toBe('Пользовательское соглашение | КвизПульт');
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Пользовательское соглашение сервиса «КвизПульт».');

    view.unmount();
    expect(document.title).toBe('КвизПульт');
  });
});
