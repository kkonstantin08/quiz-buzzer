import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingPage } from '../LandingPage';

describe('Landing page tariff', () => {
  it('opens the tariff page from the header', () => {
    function Location() {
      return <output data-testid="location">{useLocation().pathname}</output>;
    }

    render(<MemoryRouter><LandingPage /><Location /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Тарифы' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/tariff');
    expect(screen.queryByRole('heading', { name: 'Доступ к сервису «КвизПульт»' })).not.toBeInTheDocument();
  });
});
