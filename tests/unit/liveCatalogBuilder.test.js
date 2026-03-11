const { buildLiveCatalog } = require('../../src/utils/liveCatalogBuilder')

describe('buildLiveCatalog', () => {
  test('prefers 4K live variant over lower-quality siblings', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="TR Test Kanal FHD" group-title="TR:ULUSAL",TR Test Kanal FHD',
      'https://provider.example/live/user/pass/1001.m3u8',
      '#EXTINF:-1 tvg-name="TR Test Kanal 4K" group-title="TR:ULUSAL",TR Test Kanal 4K',
      'https://provider.example/live/user/pass/1002.m3u8'
    ].join('\n')

    const catalog = buildLiveCatalog(playlist)

    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0].name).toContain('4K')
    expect(catalog.items[0].streamId).toBe('1002')
  })

  test('maps Turkish live aliases into canonical categories', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="TR Spor Test" group-title="TR:SPOR \u26bd",TR Spor Test',
      'https://provider.example/live/user/pass/2001.m3u8'
    ].join('\n')

    const catalog = buildLiveCatalog(playlist)

    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0].group).toBe('TR:SPOR')
    expect(catalog.countries.find((country) => country.code === 'TR')?.categories.some((category) => (
      category.name === 'TR:SPOR' && category.count === 1
    ))).toBe(true)
  })

  test('maps nonstop foreign series group into Turkish live taxonomy', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="TR The Last of Us 7/24" group-title="7/24 YABANCI DIZI",TR The Last of Us 7/24',
      'https://provider.example/live/user/pass/3001.m3u8'
    ].join('\n')

    const catalog = buildLiveCatalog(playlist)

    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0].group).toBe('TR:7/24 YABANCI DIZI')
    expect(catalog.countries.find((country) => country.code === 'TR')?.categories.some((category) => (
      category.name === 'TR:7/24 YABANCI DIZI' && category.count === 1
    ))).toBe(true)
  })

  test('maps Turkish 4K live aliases into canonical categories', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="TR Test 4K" group-title="TR:ULUSAL 4K\u2728",TR Test 4K',
      'https://provider.example/live/user/pass/4001.m3u8'
    ].join('\n')

    const catalog = buildLiveCatalog(playlist)

    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0].group).toBe('TR:ULUSAL 4K')
    expect(catalog.countries.find((country) => country.code === 'TR')?.categories.some((category) => (
      category.name === 'TR:ULUSAL 4K' && category.count === 1
    ))).toBe(true)
  })
})
