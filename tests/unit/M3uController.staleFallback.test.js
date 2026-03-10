const M3uController = require('../../src/api/controllers/M3uController')

describe('M3uController stale playlist policy', () => {
  const buildController = () => (
    new M3uController(
      { execute: jest.fn() },
      { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
      'test-secret'
    )
  )

  test('does not serve stale playlist for provider 404 responses', () => {
    const controller = buildController()
    const shouldServe = controller._shouldServeStalePlaylist({ statusCode: 404 })

    expect(shouldServe).toBe(false)
  })

  test('does not serve stale playlist for provider 401 responses', () => {
    const controller = buildController()
    const shouldServe = controller._shouldServeStalePlaylist({ response: { status: 401 } })

    expect(shouldServe).toBe(false)
  })

  test('serves stale playlist for transient provider failures', () => {
    const controller = buildController()

    expect(controller._shouldServeStalePlaylist({ statusCode: 502 })).toBe(true)
    expect(controller._shouldServeStalePlaylist(new Error('ETIMEDOUT'))).toBe(true)
  })

  test('builds stream proxy url with pinned upstream proxy index when provided', () => {
    const controller = buildController()
    const url = controller._buildStreamProxyUrl(
      'https://flixify.pro/api/v1',
      'ABC123',
      'jwt-token',
      'http://example.com/live/84.m3u8',
      1
    )

    expect(url).toContain('/stream/ABC123?')
    expect(url).toContain('up=1')
  })

  test('includes route key in stream proxy url when provided', () => {
    const controller = buildController()
    const url = controller._buildStreamProxyUrl(
      'https://flixify.pro/api/v1',
      'ABC123',
      'jwt-token',
      'http://example.com/live/84.m3u8',
      0,
      'rk123'
    )

    expect(url).toContain('up=0')
    expect(url).toContain('rk=rk123')
  })

  test('parses preferred proxy index safely', () => {
    const controller = buildController()

    expect(controller._parsePreferredProxyIndex('2')).toBe(2)
    expect(controller._parsePreferredProxyIndex('0')).toBe(0)
    expect(controller._parsePreferredProxyIndex('')).toBeNull()
    expect(controller._parsePreferredProxyIndex('-1')).toBeNull()
    expect(controller._parsePreferredProxyIndex('abc')).toBeNull()
  })

  test('reorders proxy candidates to try preferred proxy first', () => {
    const controller = buildController()
    const proxyA = { host: 'a', port: 1 }
    const proxyB = { host: 'b', port: 2 }
    const proxyC = { host: 'c', port: 3 }

    const reordered = controller._buildProxyCandidates([proxyA, proxyB, proxyC], 2)

    expect(reordered[0].proxy).toBe(proxyC)
    expect(reordered[0].proxyIndex).toBe(2)
    expect(reordered).toHaveLength(3)
  })

  test('pins and resolves route proxy index with ttl checks', () => {
    const controller = buildController()

    controller._setPinnedProxyIndex('route-1', 2)
    expect(controller._getPinnedProxyIndex('route-1')).toBe(2)
    expect(controller._getPinnedProxyIndex('missing-route')).toBeNull()
  })

  test('prunes old live segments and adjusts media sequence', () => {
    const controller = buildController()
    const raw = [
      '#EXTM3U',
      '#EXT-X-MEDIA-SEQUENCE:100',
      '#EXTINF:10.0,',
      'seg-1.ts',
      '#EXTINF:10.0,',
      'seg-2.ts',
      '#EXTINF:10.0,',
      'seg-3.ts',
      '#EXTINF:10.0,',
      'seg-4.ts',
      '#EXTINF:10.0,',
      'seg-5.ts',
      '#EXTINF:10.0,',
      'seg-6.ts',
      '#EXTINF:10.0,',
      'seg-7.ts'
    ].join('\n')

    const pruned = controller._pruneLivePlaylistWindow(raw)

    expect((pruned.match(/#EXTINF/g) || []).length).toBe(5)
    expect(pruned).toContain('#EXT-X-MEDIA-SEQUENCE:102')
    expect(pruned).not.toContain('seg-1.ts')
    expect(pruned).not.toContain('seg-2.ts')
  })
})
