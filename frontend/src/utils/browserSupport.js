function resolveNavigator() {
  if (typeof navigator === 'undefined') {
    return null
  }

  return navigator
}

export function getBrowserCapabilities() {
  const nav = resolveNavigator()
  const userAgent = String(nav?.userAgent || '')
  const vendor = String(nav?.vendor || '')
  const platform = String(nav?.platform || '')

  const isInternetExplorer = /MSIE|Trident\//i.test(userAgent)
  const isEdgeHTML = /Edge\/\d+/i.test(userAgent)
  const isFirefox = /Firefox\//i.test(userAgent)
  const isOpera = /OPR\//i.test(userAgent)
  const isVivaldi = /Vivaldi/i.test(userAgent)
  const isChromium = /Chrome|CriOS|Chromium|Edg\//i.test(userAgent) || isOpera || isVivaldi
  const isSafari = /Safari/i.test(userAgent) && /Apple/i.test(vendor) && !isChromium && !isFirefox && !isOpera && !isInternetExplorer
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && Number(nav?.maxTouchPoints || 0) > 1)
  const supportsMse = typeof window !== 'undefined' && Boolean(window.MediaSource || window.ManagedMediaSource)
  const supportsFullscreen = typeof document !== 'undefined' && (
    document.fullscreenEnabled
    || document.webkitFullscreenEnabled
    || document.msFullscreenEnabled
    || document.mozFullScreenEnabled
  )

  return {
    userAgent,
    isInternetExplorer,
    isEdgeHTML,
    isFirefox,
    isSafari,
    isIOS,
    isChromium,
    supportsMse,
    supportsFullscreen
  }
}

export function canPlayNativeHls(video) {
  return Boolean(video?.canPlayType?.('application/vnd.apple.mpegurl'))
}

export function isFullscreenActive(doc = document) {
  if (!doc) return false

  return Boolean(
    doc.fullscreenElement
    || doc.webkitFullscreenElement
    || doc.msFullscreenElement
    || doc.mozFullScreenElement
  )
}

export function requestElementFullscreen(element, video = null) {
  if (element?.requestFullscreen) {
    return element.requestFullscreen()
  }

  if (element?.webkitRequestFullscreen) {
    element.webkitRequestFullscreen()
    return Promise.resolve()
  }

  if (element?.mozRequestFullScreen) {
    element.mozRequestFullScreen()
    return Promise.resolve()
  }

  if (element?.msRequestFullscreen) {
    element.msRequestFullscreen()
    return Promise.resolve()
  }

  if (video?.webkitEnterFullscreen) {
    video.webkitEnterFullscreen()
    return Promise.resolve()
  }

  return Promise.reject(new Error('fullscreen-not-supported'))
}

export function exitElementFullscreen(doc = document) {
  if (!doc) {
    return Promise.resolve()
  }

  if (doc.exitFullscreen) {
    return doc.exitFullscreen()
  }

  if (doc.webkitExitFullscreen) {
    doc.webkitExitFullscreen()
    return Promise.resolve()
  }

  if (doc.mozCancelFullScreen) {
    doc.mozCancelFullScreen()
    return Promise.resolve()
  }

  if (doc.msExitFullscreen) {
    doc.msExitFullscreen()
    return Promise.resolve()
  }

  return Promise.resolve()
}

export function bindFullscreenChangeListeners(listener, doc = document) {
  if (!doc || typeof listener !== 'function') {
    return () => {}
  }

  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']
  events.forEach((eventName) => doc.addEventListener(eventName, listener))

  return () => {
    events.forEach((eventName) => doc.removeEventListener(eventName, listener))
  }
}
