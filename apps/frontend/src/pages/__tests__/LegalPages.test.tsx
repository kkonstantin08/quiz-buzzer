import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { LegalTodo } from '../../components/LegalTodo';
import { CookiesPage } from '../legal/CookiesPage';

describe('Legal Pages Frontend Tests', () => {
  describe('LegalDraftNotice', () => {
    it('does not render in development (MODE=development)', () => {
      vi.stubEnv('MODE', 'development');

      render(<LegalDraftNotice />);
      expect(screen.queryByText(/Документ находится в разработке/)).not.toBeInTheDocument();
    });

    it('renders in production (MODE=production)', () => {
      vi.stubEnv('MODE', 'production');

      render(<LegalDraftNotice />);
      expect(screen.getByText(/Документ находится в разработке/)).toBeInTheDocument();
      expect(screen.getByText(/Представленный текст является черновиком/)).toBeInTheDocument();
    });
  });

  describe('LegalTodo', () => {
    it('renders in development (MODE=development)', () => {
      vi.stubEnv('MODE', 'development');

      render(<LegalTodo id="test" description="Needs review" />);
      expect(screen.getByText('TODO_LEGAL(test)')).toBeInTheDocument();
      expect(screen.getByText('Needs review')).toBeInTheDocument();
    });

    it('does not render in production (MODE=production)', () => {
      vi.stubEnv('MODE', 'production');

      render(<LegalTodo id="test" description="Needs review" />);
      expect(screen.queryByText('TODO_LEGAL(test)')).not.toBeInTheDocument();
    });
  });

  describe('CookiesPage', () => {
    it('renders required technologies', () => {
      vi.stubEnv('MODE', 'development');

      render(<CookiesPage />);

      expect(screen.getByText(/hostToken/)).toBeInTheDocument();
      expect(screen.getByText(/cookieConsent/)).toBeInTheDocument();
      expect(screen.getByText(/quiz_participant_token/)).toBeInTheDocument();
      expect(screen.getByText(/Не используем рекламные и сторонние аналитические cookie/i)).toBeInTheDocument();
    });
  });
});
