const { buildLiveCatalog } = require('../../src/utils/liveCatalogBuilder')

describe('buildLiveCatalog', () => {
  test('prefers 4K live variant over lower-quality siblings', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="TR • Test Kanal FHD" group-title="TR ✨ Ulusal",TR • Test Kanal FHD',
      'https://provider.example/live/user/pass/1001.m3u8',
      '#EXTINF:-1 tvg-name="TR • Test Kanal 4K" group-title="TR ✨ Ulusal",TR • Test Kanal 4K',
      'https://provider.example/live/user/pass/1002.m3u8'
    ].join('\n')

    const catalog = buildLiveCatalog(playlist)

    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0].name).toContain('4K')
    expect(catalog.items[0].streamId).toBe('1002')
  })
})
