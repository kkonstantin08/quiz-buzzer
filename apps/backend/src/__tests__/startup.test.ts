import { checkBillingReadiness } from '../billing/readiness';

// We mock checkBillingReadiness to simulate readiness
jest.mock('../billing/readiness', () => ({
  checkBillingReadiness: jest.fn()
}));

jest.mock('../history/cleanup', () => ({
  startGameHistoryCleanup: jest.fn(),
}));

// We need to mock config to change paymentsEnabled dynamically before importing server.ts
jest.mock('../config', () => ({
  config: {
    paymentsEnabled: true,
    port: 3000,
    corsOrigin: '*',
    uploadDir: '/tmp/uploads'
  }
}));

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`process.exit called with ${code}`);
});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Startup Guard', () => {
  beforeEach(() => {
    jest.resetModules();
    mockExit.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exits if payments are enabled but readiness fails', () => {
    const { checkBillingReadiness: mockedCheck } = require('../billing/readiness');
    (mockedCheck as any).mockReturnValue({
      ready: false,
      reasons: ['Testing missing readiness']
    });

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      require('../server');
    } catch (e: any) {
      expect(e.message).toBe('process.exit called with 1');
    }

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith('CRITICAL: PAYMENTS_ENABLED=true, но инфраструктура не готова.');

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('does not exit if payments are enabled and readiness succeeds', () => {
    const { checkBillingReadiness: mockedCheck } = require('../billing/readiness');
    (mockedCheck as any).mockReturnValue({
      ready: true,
      reasons: []
    });

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Since we mock server.listen, we also need to mock ensureUploadDirExists
    jest.mock('../utils/upload', () => ({
      ensureUploadDirExists: jest.fn(),
      receiveUpload: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    }));
    
    // Prevent the real server from binding a port while preserving the Server API Socket.IO needs.
    const http = require('http');
    jest.spyOn(http.Server.prototype, 'listen').mockImplementation(function (this: any, ...args: any[]) {
      const callback = args.find((arg) => typeof arg === 'function');
      callback?.();
      return this;
    });

    require('../server');

    expect(mockExit).not.toHaveBeenCalled();
    const { startGameHistoryCleanup } = require('../history/cleanup');
    expect(startGameHistoryCleanup).toHaveBeenCalledTimes(1);
    process.env.NODE_ENV = originalNodeEnv;
  });
});
