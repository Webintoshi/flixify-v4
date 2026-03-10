const M3uController = require('../../src/api/controllers/M3uController')

describe('M3uController live proxy helpers', () => {
  const buildController = () => (
    new M3uController(
      { execute: jest.fn() },
      { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
      'test-secret'
    )
  )

  test('builds stream proxy url with upstream proxy index when provided', () => {
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

  test('builds stream proxy url without upstream hint when no index is provided', () => {
    const controller = buildController()
    const url = controller._buildStreamProxyUrl(
      'https://flixify.pro/api/v1',
      'ABC123',
      'jwt-token',
      'http://example.com/live/84.m3u8'
    )

    expect(url).not.toContain('up=')
    expect(url).not.toContain('rk=')
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

  test('builds direct candidate when no proxy is configured', () => {
    const controller = buildController()
    expect(controller._buildProxyCandidates([])).toEqual([{ proxy: null, proxyIndex: -1 }])
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

  test('keeps original live playlist when pruning is disabled', () => {
    const controller = buildController()
    const raw = [
      '#EXTM3U',
      '#EXT-X-MEDIA-SEQUENCE:100',
      '#EXTINF:10.0,',
      'seg-1.ts',
      '#EXTINF:10.0,',
      'seg-2.ts',
      '#EXTINF:10.0,',
      'seg-3.ts'
    ].join('\n')

    expect(controller._optimizeLivePlaylist(raw)).toBe(raw)
  })

  test('extracts nested hls origins from segment and URI tags', () => {
    const controller = buildController()
    const playlist = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=1800000,URI="tracks/audio.m3u8"',
      'variant/index.m3u8',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.net/live.key"',
      '#EXTINF:6.0,',
      'https://cdn.example.com/live/segment001.ts'
    ].join('\n')

    const origins = controller._extractOriginsFromHlsPlaylist(
      playlist,
      'https://origin.example.com/master/main.m3u8'
    )

    expect(origins.has('https://origin.example.com')).toBe(true)
    expect(origins.has('https://cdn.example.com')).toBe(true)
    expect(origins.has('https://keys.example.net')).toBe(true)
  })
})
