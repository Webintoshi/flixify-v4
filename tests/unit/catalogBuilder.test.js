const { buildSeriesCatalog, buildMoviesCatalog } = require('../../src/utils/catalogBuilder')

describe('catalogBuilder utility', () => {
  const streamProxyBuilder = (targetUrl) => `https://proxy.local/stream?url=${encodeURIComponent(targetUrl)}`
  const logoProxyBuilder = (targetUrl) => `https://proxy.local/logo?url=${encodeURIComponent(targetUrl)}`

  test('buildSeriesCatalog groups episodes, preserves logo candidates, and sorts episodes', () => {
    const playlist = `#EXTM3U
#EXTINF:-1 tvg-logo="https://img.example/show-a.jpg" group-title="Netflix Dizileri",Sample Show S01E02
http://provider.local/series/u/p/1002.mkv
#EXTINF:-1 tvg-logo="https://img.example/show-b.jpg" group-title="Netflix Dizileri",Sample Show S01E01
http://provider.local/series/u/p/1001.mkv
#EXTINF:-1 tvg-logo="https://img.example/other.jpg" group-title="Disney+ Dizileri",Other Show S01E01
http://provider.local/series/u/p/2001.mkv`

    const catalog = buildSeriesCatalog(playlist, {
      streamProxyBuilder,
      logoProxyBuilder
    })

    expect(catalog).toHaveLength(2)

    const sampleShow = catalog.find((item) => item.name === 'Sample Show')
    expect(sampleShow).toBeDefined()
    expect(sampleShow.logo).toBe('https://proxy.local/logo?url=https%3A%2F%2Fimg.example%2Fshow-a.jpg')
    expect(sampleShow.logoCandidates).toEqual([
      'https://proxy.local/logo?url=https%3A%2F%2Fimg.example%2Fshow-a.jpg',
      'https://proxy.local/logo?url=https%3A%2F%2Fimg.example%2Fshow-b.jpg'
    ])

    const seasonOneEpisodes = sampleShow.seasons[1]
    expect(seasonOneEpisodes.map((episode) => episode.episode)).toEqual([1, 2])
    expect(seasonOneEpisodes[0].url).toContain('https://proxy.local/stream?url=')
  })

  test('buildMoviesCatalog deduplicates titles and keeps poster failover candidates', () => {
    const playlist = `#EXTM3U
#EXTINF:-1 tvg-logo="https://img.example/movie-a.jpg" group-title="Dram & Romantik",Movie One (2024)
http://provider.local/movie/u/p/3001.mkv
#EXTINF:-1 tvg-logo="https://img.example/movie-b.jpg" group-title="Dram & Romantik",Movie One (2024)
http://provider.local/movie/u/p/3001.mkv
#EXTINF:-1 tvg-logo="https://img.example/movie-c.jpg" group-title="XXX",Adult Movie
http://provider.local/movie/u/p/3002.mkv`

    const catalog = buildMoviesCatalog(playlist, {
      streamProxyBuilder,
      logoProxyBuilder
    })

    expect(catalog).toHaveLength(1)
    expect(catalog[0].title).toBe('Movie One (2024)')
    expect(catalog[0].logo).toBe('https://proxy.local/logo?url=https%3A%2F%2Fimg.example%2Fmovie-a.jpg')
    expect(catalog[0].logoCandidates).toEqual([
      'https://proxy.local/logo?url=https%3A%2F%2Fimg.example%2Fmovie-a.jpg',
      'https://proxy.local/logo?url=https%3A%2F%2Fimg.example%2Fmovie-b.jpg'
    ])
    expect(catalog[0].url).toContain('https://proxy.local/stream?url=')
  })
})
