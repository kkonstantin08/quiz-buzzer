import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YandexMetrika } from '../YandexMetrika';
import { acknowledgeCookieNotice } from '../../lib/cookieNoticeStorage';

const SCRIPT_ID = 'yandex-metrika-script';

function TrackerHarness() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/tariff?source=test')}>Перейти</button><YandexMetrika /></>;
}

function queuedCalls() {
  return Array.from((window.ym as typeof window.ym & { a?: IArguments[] })?.a ?? []).map((call) => Array.from(call));
}

describe('YandexMetrika', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.ym;
    document.getElementById(SCRIPT_ID)?.remove();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.ym;
    document.getElementById(SCRIPT_ID)?.remove();
  });

  it('is fully disabled without a valid counter ID', () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', 'counter');
    acknowledgeCookieNotice(true);
    render(<MemoryRouter><YandexMetrika /></MemoryRouter>);

    expect(document.getElementById(SCRIPT_ID)).toBeNull();
    expect(window.ym).toBeUndefined();
  });

  it('does not add the tag or queue before analytics consent', () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '123456');
    render(<MemoryRouter><YandexMetrika /></MemoryRouter>);

    expect(document.getElementById(SCRIPT_ID)).toBeNull();
    expect(window.ym).toBeUndefined();
  });

  it('creates the standard queue, initializes once with defer, and sends the first hit', () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '123456');
    acknowledgeCookieNotice(true);
    render(<MemoryRouter initialEntries={['/']}><YandexMetrika /></MemoryRouter>);

    expect(document.getElementById(SCRIPT_ID)).toHaveAttribute('src', 'https://mc.yandex.ru/metrika/tag.js');
    expect(queuedCalls()).toEqual([
      ['123456', 'init', expect.objectContaining({ defer: true })],
      ['123456', 'hit', '/'],
    ]);
  });

  it('sends one hit for a new SPA URL and never duplicates the current URL', async () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '123456');
    acknowledgeCookieNotice(true);
    const view = render(<MemoryRouter initialEntries={['/']}><TrackerHarness /></MemoryRouter>);

    fireEvent.click(view.getByRole('button', { name: 'Перейти' }));
    await waitFor(() => expect(queuedCalls()).toContainEqual(['123456', 'hit', '/tariff?source=test']));
    view.rerender(<MemoryRouter initialEntries={['/tariff?source=test']}><TrackerHarness /></MemoryRouter>);

    expect(queuedCalls().filter((call) => call[1] === 'hit' && call[2] === '/tariff?source=test')).toHaveLength(1);
  });

  it('destructs on consent revocation and starts again without adding a second script', async () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '123456');
    acknowledgeCookieNotice(true);
    const view = render(<MemoryRouter initialEntries={['/']}><TrackerHarness /></MemoryRouter>);

    acknowledgeCookieNotice(false);
    await waitFor(() => expect(queuedCalls()).toContainEqual(['123456', 'destruct']));
    const hitsBeforeNavigation = queuedCalls().filter((call) => call[1] === 'hit').length;
    fireEvent.click(view.getByRole('button', { name: 'Перейти' }));
    expect(queuedCalls().filter((call) => call[1] === 'hit')).toHaveLength(hitsBeforeNavigation);

    acknowledgeCookieNotice(true);
    await waitFor(() => expect(queuedCalls().filter((call) => call[1] === 'init')).toHaveLength(2));
    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);
  });
});
