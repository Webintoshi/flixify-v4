import { useEffect } from 'react'

function isTypingTarget(target) {
  if (!target) {
    return false
  }

  const tagName = target.tagName
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || target.isContentEditable
}

export function useVodKeyboardControls({
  enabled,
  containerRef,
  canSeek,
  onWakeControls,
  onTogglePlay,
  onSeekRelative,
  onVolumeDelta,
  onToggleMute,
  onToggleFullscreen,
  onSeekToStart,
  onSeekToEnd
}) {
  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (isTypingTarget(document.activeElement)) {
        return
      }

      const container = containerRef?.current
      const hasPlayerFocus = container && container.contains(document.activeElement)
      if (!hasPlayerFocus && !document.fullscreenElement) {
        return
      }

      onWakeControls?.()

      switch (event.code) {
        case 'Space':
        case 'KeyK':
          event.preventDefault()
          onTogglePlay?.()
          return
        case 'KeyM':
          event.preventDefault()
          onToggleMute?.()
          return
        case 'KeyF':
          event.preventDefault()
          onToggleFullscreen?.()
          return
        case 'ArrowUp':
          event.preventDefault()
          onVolumeDelta?.(0.1)
          return
        case 'ArrowDown':
          event.preventDefault()
          onVolumeDelta?.(-0.1)
          return
        case 'Escape':
          if (document.fullscreenElement) {
            event.preventDefault()
            document.exitFullscreen().catch(() => {})
          }
          return
        case 'ArrowRight':
        case 'KeyL':
          if (!canSeek) return
          event.preventDefault()
          onSeekRelative?.(10)
          return
        case 'ArrowLeft':
        case 'KeyJ':
          if (!canSeek) return
          event.preventDefault()
          onSeekRelative?.(-10)
          return
        case 'Home':
          if (!canSeek) return
          event.preventDefault()
          onSeekToStart?.()
          return
        case 'End':
          if (!canSeek) return
          event.preventDefault()
          onSeekToEnd?.()
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    containerRef,
    canSeek,
    onWakeControls,
    onTogglePlay,
    onSeekRelative,
    onVolumeDelta,
    onToggleMute,
    onToggleFullscreen,
    onSeekToStart,
    onSeekToEnd
  ])
}
