const request = require('supertest');

const mockCreateClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClient(...args)
}));

function buildSupabaseMock() {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        error: new Error('supabase unavailable in tests'),
        limit: jest.fn().mockResolvedValue({ error: new Error('supabase unavailable in tests') })
      }))
    }))
  };
}

describe('server discovery and health endpoints', () => {
  let server;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '9299';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    process.env.JWT_SECRET = 'test-secret';
    process.env.RELEASE_ID = 'test-release-id';
    process.env.API_VERSION = 'test-version';
    process.env.REDIS_URL = '';
    process.env.TELEGRAM_BOT_TOKEN = '';
    process.env.TELEGRAM_WEBHOOK_SECRET = '';
    process.env.TELEGRAM_WEBHOOK_URL = '';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '';
    process.env.TELEGRAM_NOTIFICATION_CHAT_IDS = '';
    process.env.TELEGRAM_WEBHOOK_HEADER_SECRET = '';
    process.env.TELEGRAM_BOT_ADMIN_ID = '';

    mockCreateClient.mockImplementation(() => buildSupabaseMock());

    jest.resetModules();
    const { startServer } = require('../../src/server');
    server = await startServer();
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET / returns discovery payload and release headers', async () => {
    const response = await request(server).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['x-api-version']).toBe('test-version');
    expect(response.headers['x-release-id']).toBe('test-release-id');
    expect(response.body).toMatchObject({
      status: 'success',
      data: {
        service: 'iptv-platform',
        version: 'test-version',
        releaseId: 'test-release-id',
        environment: 'test',
        apiRoot: '/api/v1',
        apiHealth: '/api/v1/health',
        ready: '/api/v1/ready',
        m3uHealth: '/api/v1/m3u/health'
      }
    });
  });

  test('GET /api/v1 and health endpoints expose release metadata', async () => {
    const apiRoot = await request(server).get('/api/v1');
    const rootHealth = await request(server).get('/health');
    const apiHealth = await request(server).get('/api/v1/health');
    const readiness = await request(server).get('/api/v1/ready');

    expect(apiRoot.status).toBe(200);
    expect(apiRoot.body.data.releaseId).toBe('test-release-id');
    expect(apiRoot.body.data.apiRoot).toBe('/api/v1');

    expect(rootHealth.status).toBe(200);
    expect(rootHealth.body.releaseId).toBe('test-release-id');
    expect(rootHealth.body.apiRoot).toBe('/api/v1');

    expect(apiHealth.status).toBe(200);
    expect(apiHealth.body.data.releaseId).toBe('test-release-id');
    expect(apiHealth.body.data.environment).toBe('test');

    expect([200, 503]).toContain(readiness.status);
    expect(readiness.body.data.releaseId).toBe('test-release-id');
  });

  test('unknown routes still return RFC7807 404 with release metadata', async () => {
    const response = await request(server).get('/missing-route');

    expect(response.status).toBe(404);
    expect(response.headers['x-api-version']).toBe('test-version');
    expect(response.headers['x-release-id']).toBe('test-release-id');
    expect(response.body).toMatchObject({
      type: 'https://api.iptv-platform.com/errors/NOT_FOUND',
      status: 404,
      code: 'NOT_FOUND',
      releaseId: 'test-release-id',
      version: 'test-version'
    });
  });
});
