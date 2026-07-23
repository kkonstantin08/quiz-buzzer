import { loadConfig } from '../config';

describe('development CORS configuration', () => {
  it('allows the local Vite server on 127.0.0.1', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).corsOrigin).toContain('http://127.0.0.1:5173');
  });
});
