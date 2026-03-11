const CHANNEL_LOGO_FALLBACKS = [
  {
    src: '/logos/channels/beinsports.png',
    patterns: ['bein sports', 'beinsports', 'bein sport']
  },
  {
    src: '/logos/channels/trtspor.png',
    patterns: ['trt spor', 'trtspor']
  },
  {
    src: '/logos/channels/trt1.png',
    patterns: ['trt 1', 'trt1', 'trt 4k', 'trt4k']
  },
  {
    src: '/logos/channels/atv.png',
    patterns: [' atv ', ' tr atv ', 'tr atv', 'atv hd', 'atv fhd', 'atv 4k']
  },
  {
    src: '/logos/channels/startv.png',
    patterns: ['star tv', 'startv']
  },
  {
    src: '/logos/channels/showtv.png',
    patterns: ['show tv', 'showtv']
  },
  {
    src: '/logos/channels/kanald.png',
    patterns: ['kanal d', 'kanald']
  },
  {
    src: '/logos/channels/fox.png',
    patterns: ['fox', 'now tv', 'now']
  },
  {
    src: '/logos/channels/tv8.png',
    patterns: ['tv8']
  },
  {
    src: '/logos/channels/aspor.png',
    patterns: ['a spor', 'aspor']
  },
  {
    src: '/logos/channels/eurosport.png',
    patterns: ['eurosport']
  },
  {
    src: '/logos/channels/beyaztv.png',
    patterns: ['beyaz tv', 'beyaztv']
  }
]

function toAsciiLower(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveChannelFallbackLogo(channel = {}) {
  const haystack = ` ${toAsciiLower(channel?.name)} ${toAsciiLower(channel?.group)} `

  const match = CHANNEL_LOGO_FALLBACKS.find((candidate) => (
    candidate.patterns.some((pattern) => haystack.includes(` ${toAsciiLower(pattern)} `))
  ))

  return match?.src || ''
}
