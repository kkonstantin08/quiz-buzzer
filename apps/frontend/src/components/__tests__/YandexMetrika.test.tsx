import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YandexMetrika } from '../YandexMetrika';
import { acknowledgeCookieNotice } from '../../lib/cookieNoticeStorage';

const SCRIPT_ID = 'yandex-metrika-script';

describe('YandexMetrika', () => {
  beforeEach(() => {
    localStorage.clear();
    document.getElementById(SCRIPT_ID)?.remove();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    document.getElementById(SCRIPT_ID)?.remove();
  });

  it('does not load without an ID or analytics consent', async () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '');
    acknowledgeCookieNotice(true);
    render(<YandexMetrika />);

    await waitFor(() => expect(document.getElementById(SCRIPT_ID)).toBeNull());
  });

  it('loads only after analytics consent and removes its script on revocation', async () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '123456');
    render(<YandexMetrika />);
    expect(document.getElementById(SCRIPT_ID)).toBeNull();

    acknowledgeCookieNotice(true);
    await waitFor(() => expect(document.getElementById(SCRIPT_ID)).toHaveAttribute('src', 'https://mc.yandex.ru/metrika/tag.js'));

    acknowledgeCookieNotice(false);
    await waitFor(() => expect(document.getElementById(SCRIPT_ID)).toBeNull());
  });
});
