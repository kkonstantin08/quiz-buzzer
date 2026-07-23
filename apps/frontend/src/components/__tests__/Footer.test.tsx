import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Footer } from '../Footer';
import { OPEN_COOKIE_SETTINGS_EVENT } from '../../lib/cookieNoticeStorage';

describe('Footer', () => {
  it('shows public requisites and opens cookie settings', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, listener);

    render(<MemoryRouter><Footer /></MemoryRouter>);

    expect(screen.getByText('Индивидуальный предприниматель Тумакин Алексей Анатольевич')).toBeInTheDocument();
    expect(screen.getByText('ИНН: 344211197773')).toBeInTheDocument();
    expect(screen.getByText('ОГРНИП: 314344311900126')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'videoaleks@mail.ru' })).toHaveAttribute('href', 'mailto:videoaleks@mail.ru');

    fireEvent.click(screen.getByRole('button', { name: 'Настройки cookie' }));
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, listener);
  });
});
