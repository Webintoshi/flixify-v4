const SUPPORTED_BROWSER_AUDIO_CODECS = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac'
]);

function normalizeCodecName(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

function isBrowserSupportedAudioCodec(codecName) {
  const normalized = normalizeCodecName(codecName);
  if (!normalized) {
    return false;
  }
  return SUPPORTED_BROWSER_AUDIO_CODECS.has(normalized);
}

function buildPlaybackDecision({
  containerType = 'unknown',
  acceptRanges = false,
  hasAudio = false,
  audioCodec = null
} = {}) {
  const normalizedContainer = String(containerType || 'unknown').toLowerCase();
  const normalizedAudioCodec = normalizeCodecName(audioCodec);
  const audioBrowserSupported = hasAudio ? isBrowserSupportedAudioCodec(normalizedAudioCodec) : true;

  if (normalizedContainer === 'hls') {
    return {
      playbackStrategy: 'hls',
      remuxRecommended: false,
      remuxFallback: false,
      remuxReason: null,
      audioBrowserSupported
    };
  }

  if (['mkv', 'ts', 'unknown'].includes(normalizedContainer)) {
    return {
      playbackStrategy: 'remux-hls',
      remuxRecommended: true,
      remuxFallback: true,
      remuxReason: 'container-unsupported',
      audioBrowserSupported
    };
  }

  if (hasAudio && !audioBrowserSupported) {
    return {
      playbackStrategy: 'remux-hls',
      remuxRecommended: true,
      remuxFallback: true,
      remuxReason: 'audio-codec-unsupported',
      audioBrowserSupported
    };
  }

  if (normalizedContainer !== 'hls' && !acceptRanges) {
    return {
      playbackStrategy: 'remux-hls',
      remuxRecommended: true,
      remuxFallback: true,
      remuxReason: 'source-not-seekable',
      audioBrowserSupported
    };
  }

  if (['mp4', 'webm'].includes(normalizedContainer)) {
    return {
      playbackStrategy: 'native',
      remuxRecommended: false,
      remuxFallback: false,
      remuxReason: null,
      audioBrowserSupported
    };
  }

  return {
    playbackStrategy: 'remux-hls',
    remuxRecommended: true,
    remuxFallback: true,
    remuxReason: 'conservative-fallback',
    audioBrowserSupported
  };
}

module.exports = {
  normalizeCodecName,
  isBrowserSupportedAudioCodec,
  buildPlaybackDecision
};
