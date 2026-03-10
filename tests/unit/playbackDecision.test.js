const { buildPlaybackDecision, normalizeCodecName, isBrowserSupportedAudioCodec } = require('../../src/utils/playbackDecision')

describe('playbackDecision utility', () => {
  test('returns hls strategy for HLS containers', () => {
    const decision = buildPlaybackDecision({
      containerType: 'hls',
      acceptRanges: false,
      hasAudio: true,
      audioCodec: 'aac'
    })

    expect(decision.playbackStrategy).toBe('hls')
    expect(decision.remuxRecommended).toBe(false)
    expect(decision.remuxReason).toBeNull()
  })

  test('forces remux for unsupported container types', () => {
    const decision = buildPlaybackDecision({
      containerType: 'mkv',
      acceptRanges: true,
      hasAudio: true,
      audioCodec: 'aac'
    })

    expect(decision.playbackStrategy).toBe('remux-hls')
    expect(decision.remuxReason).toBe('container-unsupported')
  })

  test('forces remux when audio codec is not browser supported', () => {
    const decision = buildPlaybackDecision({
      containerType: 'mp4',
      acceptRanges: true,
      hasAudio: true,
      audioCodec: 'eac3'
    })

    expect(decision.playbackStrategy).toBe('remux-hls')
    expect(decision.remuxReason).toBe('audio-codec-unsupported')
    expect(decision.audioBrowserSupported).toBe(false)
  })

  test('forces remux when source is not seekable in non-HLS mode', () => {
    const decision = buildPlaybackDecision({
      containerType: 'mp4',
      acceptRanges: false,
      hasAudio: true,
      audioCodec: 'aac'
    })

    expect(decision.playbackStrategy).toBe('remux-hls')
    expect(decision.remuxReason).toBe('source-not-seekable')
  })

  test('returns native for browser-compatible MP4', () => {
    const decision = buildPlaybackDecision({
      containerType: 'mp4',
      acceptRanges: true,
      hasAudio: true,
      audioCodec: 'aac'
    })

    expect(decision.playbackStrategy).toBe('native')
    expect(decision.remuxRecommended).toBe(false)
  })

  test('returns native for browser-compatible WEBM without audio', () => {
    const decision = buildPlaybackDecision({
      containerType: 'webm',
      acceptRanges: true,
      hasAudio: false,
      audioCodec: null
    })

    expect(decision.playbackStrategy).toBe('native')
    expect(decision.audioBrowserSupported).toBe(true)
  })

  test('normalizes codec names and compatibility checks', () => {
    expect(normalizeCodecName(' AAC ')).toBe('aac')
    expect(normalizeCodecName(null)).toBeNull()
    expect(isBrowserSupportedAudioCodec('mp3')).toBe(true)
    expect(isBrowserSupportedAudioCodec('dts')).toBe(false)
  })
})
