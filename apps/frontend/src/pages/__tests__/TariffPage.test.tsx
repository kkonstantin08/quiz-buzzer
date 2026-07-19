import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TariffPage } from '../TariffPage';

describe('TariffPage', () => {
  it('publishes temporary free activation alongside the 30-day tariff', () => {
    render(<MemoryRouter><TariffPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Доступ к сервису «КвизПульт»' })).toBeInTheDocument();
    expect(screen.getByText('500 ₽ за 30 дней')).toBeInTheDocument();
    expect(screen.getByText('Без автоматического продления. Следующий период оплачивается самостоятельно.')).toBeInTheDocument();
    expect(screen.getByText('На период тестирования доступ можно активировать бесплатно один раз на 30 дней.')).toBeInTheDocument();
  });
});
