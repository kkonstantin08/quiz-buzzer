import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LegalPagePlaceholder } from '../legal/LegalPagePlaceholder';
import { CookiesPage } from '../legal/CookiesPage';

describe('Legal Pages Frontend Tests', () => {
  const originalEnv = import.meta.env;

  describe('LegalPagePlaceholder', () => {
    it('renders children in development (PROD=false)', () => {
      // Vitest runs in test/dev mode by default, so PROD is false
      Object.defineProperty(import.meta.env, 'PROD', { value: false, configurable: true, enumerable: true, writable: true });
      
      render(
        <LegalPagePlaceholder title="Test Title">
          <div data-testid="draft-content">Draft TODO_LEGAL</div>
        </LegalPagePlaceholder>
      );

      expect(screen.getByTestId('draft-content')).toBeInTheDocument();
      expect(screen.queryByText('Документ находится в подготовке. Приём платежей отключён.')).not.toBeInTheDocument();
    });

    it('hides children and shows placeholder in production (PROD=true)', () => {
      Object.defineProperty(import.meta.env, 'PROD', { value: true, configurable: true, enumerable: true, writable: true });
      
      render(
        <LegalPagePlaceholder title="Test Title">
          <div data-testid="draft-content">Draft TODO_LEGAL</div>
        </LegalPagePlaceholder>
      );

      expect(screen.queryByTestId('draft-content')).not.toBeInTheDocument();
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Документ находится в подготовке. Приём платежей отключён.')).toBeInTheDocument();
    });
  });

  describe('CookiesPage', () => {
    it('renders required technologies', () => {
      Object.defineProperty(import.meta.env, 'PROD', { value: false, configurable: true, enumerable: true, writable: true });
      
      render(<CookiesPage />);
      
      expect(screen.getByText(/hostToken/)).toBeInTheDocument();
      expect(screen.getByText(/cookieConsent/)).toBeInTheDocument();
      expect(screen.getByText(/quiz_participant_token/)).toBeInTheDocument();
      expect(screen.getByText(/Не используем рекламные и сторонние аналитические cookie/i)).toBeInTheDocument();
    });
  });
});
