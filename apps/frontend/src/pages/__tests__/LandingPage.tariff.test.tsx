import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingPage } from '../LandingPage';

describe('Landing page tariff', () => {
  it('links to the 30-day tariff page', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Доступ ведущего: 500 ₽ / 30 дней' })).toHaveAttribute('href', '/tariff');
    expect(screen.queryByRole('heading', { name: 'Доступ к сервису «КвизПульт»' })).not.toBeInTheDocument();
  });
});
