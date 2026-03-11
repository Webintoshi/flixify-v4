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

  test('builds stream proxy url with alternate upstream targets', () => {
    const controller = buildController()
    const url = controller._buildStreamProxyUrl(
      'https://flixify.pro/api/v1',
      'ABC123',
      'jwt-token',
      'http://example.com/live/84.m3u8',
      null,
      [
        'http://example.com/live/84.ts',
        'http://backup.example.com/live/84.m3u8'
      ]
    )

    const parsed = new URL(url)
    expect(parsed.searchParams.get('url')).toBe('http://example.com/live/84.m3u8')
    expect(parsed.searchParams.getAll('alt')).toEqual([
      'http://example.com/live/84.ts',
      'http://backup.example.com/live/84.m3u8'
    ])
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
    expect(reordered).toHaveLength(4)
    expect(reordered[reordered.length - 1]).toEqual({ proxy: null, proxyIndex: -1 })
  })

  test('builds direct candidate when no proxy is configured', () => {
    const controller = buildController()
    expect(controller._buildProxyCandidates([])).toEqual([{ proxy: null, proxyIndex: -1 }])
  })

  test('uses a wider live HLS window by default when no env override exists', () => {
    const previousValue = process.env.LIVE_HLS_KEEP_SEGMENTS
    delete process.env.LIVE_HLS_KEEP_SEGMENTS

    const controller = buildController()

    if (previousValue === undefined) {
      delete process.env.LIVE_HLS_KEEP_SEGMENTS
    } else {
      process.env.LIVE_HLS_KEEP_SEGMENTS = previousValue
    }

    expect(controller._liveHlsKeepSegments).toBe(60)
  })

  test('uses short shared live catalog and allowed origin cache defaults', () => {
    const previousLiveCatalogTtl = process.env.LIVE_CATALOG_CACHE_TTL_SEC
    const previousAllowedOriginsTtl = process.env.ALLOWED_ORIGINS_CACHE_TTL_SEC
    const previousCacheVersion = process.env.LIVE_SHARED_CATALOG_CACHE_VERSION
    delete process.env.LIVE_CATALOG_CACHE_TTL_SEC
    delete process.env.ALLOWED_ORIGINS_CACHE_TTL_SEC
    delete process.env.LIVE_SHARED_CATALOG_CACHE_VERSION

    const controller = buildController()

    if (previousLiveCatalogTtl === undefined) {
      delete process.env.LIVE_CATALOG_CACHE_TTL_SEC
    } else {
      process.env.LIVE_CATALOG_CACHE_TTL_SEC = previousLiveCatalogTtl
    }

    if (previousAllowedOriginsTtl === undefined) {
      delete process.env.ALLOWED_ORIGINS_CACHE_TTL_SEC
    } else {
      process.env.ALLOWED_ORIGINS_CACHE_TTL_SEC = previousAllowedOriginsTtl
    }

    if (previousCacheVersion === undefined) {
      delete process.env.LIVE_SHARED_CATALOG_CACHE_VERSION
    } else {
      process.env.LIVE_SHARED_CATALOG_CACHE_VERSION = previousCacheVersion
    }

    expect(controller._liveCatalogCacheTtlSec).toBe(300)
    expect(controller._allowedOriginsCacheTtlSec).toBe(180)
    expect(controller._liveCatalogCacheVersion).toBe('v4')
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

  test('resolves redirected upstream response URL for playlist rewriting', () => {
    const controller = buildController()
    const resolved = controller._resolveUpstreamResponseUrl(
      'http://provider.example/live/81.m3u8',
      {
        request: {
          res: {
            responseUrl: 'http://edge.example/auth/token/live.m3u8'
          }
        }
      }
    )

    expect(resolved).toBe('http://edge.example/auth/token/live.m3u8')
  })

  test('rewrites relative hls paths using redirected playlist host', () => {
    const controller = buildController()
    const rewritten = controller._rewriteHlsPlaylist(
      [
        '#EXTM3U',
        '#EXTINF:9.9,',
        '/hls/segment-001.ts'
      ].join('\n'),
      {
        baseApiUrl: 'https://flixify.pro/api/v1',
        baseTargetUrl: 'http://45.142.3.97/auth/token/live.m3u8',
        code: 'ABC123',
        token: 'jwt-token'
      }
    )

    const rewrittenSegmentLine = rewritten
      .split('\n')
      .find((line) => line.includes('/stream/ABC123?'))
    const parsed = new URL(rewrittenSegmentLine)
    const proxiedTarget = decodeURIComponent(parsed.searchParams.get('url'))

    expect(proxiedTarget).toBe('http://45.142.3.97/hls/segment-001.ts')
  })

  test('rehydrates alternate stream proxy targets for the current request host', () => {
    const controller = buildController()
    const rehydrated = controller._rehydrateProxyUrlForRequest(
      'https://legacy.example/api/v1/stream/ABC123?token=old-token&url=http%3A%2F%2Fprovider.example%2Flive%2F81.m3u8&alt=http%3A%2F%2Fprovider.example%2Flive%2F81.ts',
      'https://api-v4.flixify.pro/api/v1',
      'ABC123',
      'new-token'
    )

    const parsed = new URL(rehydrated)
    expect(parsed.origin).toBe('https://api-v4.flixify.pro')
    expect(parsed.searchParams.get('token')).toBe('new-token')
    expect(parsed.searchParams.get('url')).toBe('http://provider.example/live/81.m3u8')
    expect(parsed.searchParams.getAll('alt')).toEqual(['http://provider.example/live/81.ts'])
  })

  test('prefers direct live sample urls and keeps templated fallback targets', () => {
    const controller = buildController()
    const primary = controller._buildLiveItemTargetUrl('http://provider.example/playlist/user/pass/m3u_plus?output=hls', {
      streamId: '81',
      sampleUrl: 'http://provider.example/live/user/pass/81.ts'
    }, 'http://provider.example/live/{username}/{password}/{streamId}.m3u8')
    const alternates = controller._buildLiveItemAlternateTargetUrls(
      'http://provider.example/playlist/user/pass/m3u_plus?output=hls',
      {
        streamId: '81',
        backupUrls: ['http://provider.example/live/user/pass/81.m3u8']
      },
      'http://provider.example/live/{username}/{password}/{streamId}.m3u8',
      primary
    )

    expect(primary).toBe('http://provider.example/live/user/pass/81.ts')
    expect(alternates).toEqual(['http://provider.example/live/user/pass/81.m3u8'])
  })

  test('builds upstream stream headers with provider referer and origin', () => {
    const controller = buildController()
    const headers = controller._buildUpstreamStreamHeaders(
      { headers: {} },
      '*/*',
      'http://provider.example/live/81.m3u8'
    )

    expect(headers.Referer).toBe('http://provider.example/')
    expect(headers.Origin).toBe('http://provider.example')
  })

  test('applies hardened media proxy headers with no-store and no buffering', () => {
    const controller = buildController()
    const headers = {}
    const res = {
      setHeader: (name, value) => {
        headers[name] = value
      }
    }

    controller._setProxyMediaHeaders(
      res,
      {
        'content-type': 'application/vnd.apple.mpegurl',
        'content-length': '128'
      },
      { headers: {} },
      'application/vnd.apple.mpegurl'
    )

    expect(headers['Cache-Control']).toBe('private, no-store')
    expect(headers['Pragma']).toBe('no-cache')
    expect(headers['Surrogate-Control']).toBe('no-store')
    expect(headers['X-Accel-Buffering']).toBe('no')
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin')
    expect(headers['Content-Type']).toBe('application/vnd.apple.mpegurl')
  })

  test('builds compact series summary catalog with counts and first episode', () => {
    const controller = buildController()
    const fullCatalog = [
      {
        name: 'Test Series',
        genre: 'Netflix Dizileri',
        logo: 'https://example.com/poster.jpg',
        logoCandidates: ['https://example.com/poster.jpg', 'https://example.com/poster2.jpg'],
        seasons: {
          1: [
            {
              id: 'ep-1',
              seriesName: 'Test Series',
              season: 1,
              episode: 1,
              fullTitle: 'Test Series S01E01',
              logo: 'https://example.com/poster.jpg',
              genre: 'Netflix Dizileri',
              url: 'https://example.com/ep1.m3u8'
            },
            {
              id: 'ep-2',
              seriesName: 'Test Series',
              season: 1,
              episode: 2,
              fullTitle: 'Test Series S01E02',
              logo: 'https://example.com/poster.jpg',
              genre: 'Netflix Dizileri',
              url: 'https://example.com/ep2.m3u8'
            }
          ],
          2: [
            {
              id: 'ep-3',
              seriesName: 'Test Series',
              season: 2,
              episode: 1,
              fullTitle: 'Test Series S02E01',
              logo: 'https://example.com/poster.jpg',
              genre: 'Netflix Dizileri',
              url: 'https://example.com/ep3.m3u8'
            }
          ]
        }
      }
    ]

    const compactCatalog = controller._buildSeriesSummaryCatalog(fullCatalog)
    expect(compactCatalog).toHaveLength(1)
    expect(compactCatalog[0]).toMatchObject({
      name: 'Test Series',
      seasonCount: 2,
      episodeCount: 3
    })
    expect(compactCatalog[0].firstEpisode).toMatchObject({
      id: 'ep-1',
      season: 1,
      episode: 1,
      url: 'https://example.com/ep1.m3u8'
    })
  })

  test('finds series by name case-insensitively', () => {
    const controller = buildController()
    const catalog = [
      { name: 'One Piece' },
      { name: 'Dark' }
    ]

    const found = controller._findSeriesByName(catalog, 'dark')
    const missing = controller._findSeriesByName(catalog, 'breaking bad')

    expect(found).toEqual({ name: 'Dark' })
    expect(missing).toBeNull()
  })

  test('rehydrates cached series proxy urls for the current request host', () => {
    const controller = buildController()
    const rehydrated = controller._rehydrateSeriesCatalogForRequest(
      [
        {
          name: 'Dark',
          logo: 'https://legacy.example/api/v1/m3u/logo/ABC123?token=old-token&url=https%3A%2F%2Fimg.example%2Fdark.png',
          logoCandidates: [
            'https://legacy.example/api/v1/m3u/logo/ABC123?token=old-token&url=https%3A%2F%2Fimg.example%2Fdark.png'
          ],
          seasons: {
            1: [
              {
                id: 'dark-s1e1',
                logo: '/api/v1/m3u/logo/ABC123?token=old-token&url=https%3A%2F%2Fimg.example%2Fdark.png',
                url: 'https://legacy.example/api/v1/stream/ABC123?token=old-token&url=http%3A%2F%2Fprovider.example%2Fseries%2Fdark-s1e1.m3u8&up=2'
              }
            ]
          }
        }
      ],
      'https://api-v4.flixify.pro/api/v1',
      'ABC123',
      'new-token'
    )

    expect(rehydrated[0].logo).toBe(
      'https://api-v4.flixify.pro/api/v1/m3u/logo/ABC123?token=new-token&url=https%3A%2F%2Fimg.example%2Fdark.png'
    )
    expect(rehydrated[0].seasons[1][0].url).toContain('https://api-v4.flixify.pro/api/v1/stream/ABC123?')
    expect(rehydrated[0].seasons[1][0].url).toContain('token=new-token')
    expect(rehydrated[0].seasons[1][0].url).toContain('up=2')
  })

  test('rehydrates cached movie proxy urls for the current request host', () => {
    const controller = buildController()
    const rehydrated = controller._rehydrateMovieCatalogForRequest(
      [
        {
          title: 'Inception',
          logo: 'https://legacy.example/api/v1/m3u/logo/ABC123?token=old-token&url=https%3A%2F%2Fimg.example%2Finception.jpg',
          url: 'https://legacy.example/api/v1/stream/ABC123?token=old-token&url=http%3A%2F%2Fprovider.example%2Fmovie%2Finception.m3u8'
        }
      ],
      'https://api-v4.flixify.pro/api/v1',
      'ABC123',
      'new-token'
    )

    expect(rehydrated[0].logo).toBe(
      'https://api-v4.flixify.pro/api/v1/m3u/logo/ABC123?token=new-token&url=https%3A%2F%2Fimg.example%2Finception.jpg'
    )
    expect(rehydrated[0].url).toBe(
      'https://api-v4.flixify.pro/api/v1/stream/ABC123?token=new-token&url=http%3A%2F%2Fprovider.example%2Fmovie%2Finception.m3u8'
    )
  })
})
