import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Maximize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import Hls from 'hls.js'
import { useVodSourceProbe } from '../../hooks/useVodSourceProbe'
import { useVodKeyboardControls } from '../../hooks/useVodKeyboardControls'

const PRIMARY = '#E50914'

function formatTime(seconds) {
  if (!seconds || !Number.isFinite(seconds)) {
    return '0:00'
  }

  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function inferContainerFromUrl(streamUrl) {
  if (!streamUrl) {
    return 'unknown'
  }

  try {
    const parsed = new URL(streamUrl, window.location.origin)
    const nestedUrl = parsed.searchParams.get('url') || parsed.pathname
    const lowered = nestedUrl.toLowerCase()

    if (lowered.includes('.m3u8')) return 'hls'
    if (lowered.includes('.mp4') || lowered.includes('.m4v')) return 'mp4'
    if (lowered.includes('.webm')) return 'webm'
    if (lowered.includes('.mkv')) return 'mkv'
    if (lowered.includes('.ts')) return 'ts'
  } catch {
    return 'unknown'
  }

  return 'unknown'
}

function getFallbackStrategy(streamUrl) {
  const container = inferContainerFromUrl(streamUrl)
  return container === 'hls' ? 'hls' : 'native'
}

function shouldUseImmediateRemux(streamUrl) {
  const container = inferContainerFromUrl(streamUrl)
  return container === 'mkv' || container === 'ts' || container === 'unknown'
}

function buildRemuxManifestUrl(streamUrl) {
  if (!streamUrl) {
    return null
  }

  try {
    const parsed = new URL(streamUrl, window.location.origin)
    const match = parsed.pathname.match(/\/api\/v1\/stream\/([^/]+)/)
    if (!match) {
      return null
    }

    parsed.pathname = `/api/v1/vod/${match[1]}/manifest.m3u8`
    return parsed.toString()
  } catch {
    return null
  }
}

export default function VodPlayer({
  mode,
  videoUrl,
  videoTitle,
  onBack
}) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const controlsTimeoutRef = useRef(null)
  const startupTimeoutRef = useRef(null)
  const playbackStartedRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [runtimeStrategy, setRuntimeStrategy] = useState('native')
  const [useRemuxFallback, setUseRemuxFallback] = useState(false)

  const { data: probe, error: probeError } = useVodSourceProbe(videoUrl, Boolean(videoUrl))

  const remuxManifestUrl = useMemo(() => buildRemuxManifestUrl(videoUrl), [videoUrl])

  useEffect(() => {
    if (!videoUrl) {
      return
    }

    // Fast-start policy: begin playback immediately with URL-inferred strategy.
    playbackStartedRef.current = false
    setUseRemuxFallback(shouldUseImmediateRemux(videoUrl))
    setRuntimeStrategy(getFallbackStrategy(videoUrl))
  }, [videoUrl])

  useEffect(() => {
    if (!videoUrl || playbackStartedRef.current || !probeError) {
      return
    }

    if (!shouldUseImmediateRemux(videoUrl)) {
      return
    }

    setUseRemuxFallback(true)
    setRuntimeStrategy('hls')
  }, [probeError, videoUrl])

  useEffect(() => {
    if (!videoUrl || !probe?.playbackStrategy) {
      return
    }

    if (playbackStartedRef.current) {
      return
    }

    // "source-not-seekable" is handled as runtime fallback to keep startup fast.
    const wantsImmediateRemux =
      probe.playbackStrategy === 'remux-hls' &&
      probe.remuxReason !== 'source-not-seekable'

    if (wantsImmediateRemux) {
      setUseRemuxFallback(true)
      setRuntimeStrategy('hls')
      return
    }

    if (probe.playbackStrategy === 'hls') {
      setUseRemuxFallback(false)
      setRuntimeStrategy('hls')
      return
    }

    setUseRemuxFallback(false)
    setRuntimeStrategy('native')
  }, [probe?.playbackStrategy, probe?.remuxReason, videoUrl])

  const playbackSourceUrl = useMemo(() => {
    if (!videoUrl) {
      return null
    }

    if (runtimeStrategy === 'hls') {
      if (useRemuxFallback) {
        return remuxManifestUrl || videoUrl
      }
      return videoUrl
    }

    return videoUrl
  }, [videoUrl, runtimeStrategy, useRemuxFallback, remuxManifestUrl])

  const canSeek = useMemo(() => {
    if (useRemuxFallback) {
      return true
    }

    if (!probe) {
      return runtimeStrategy !== 'native' || inferContainerFromUrl(videoUrl) !== 'ts'
    }

    return Boolean(probe.seekableGuess)
  }, [probe, runtimeStrategy, useRemuxFallback, videoUrl])

  const clearControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = null
    }
  }, [])

  const wakeControls = useCallback(() => {
    setShowControls(true)
    clearControlsTimeout()
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }, [clearControlsTimeout])

  const clearStartupTimeout = useCallback(() => {
    if (startupTimeoutRef.current) {
      clearTimeout(startupTimeoutRef.current)
      startupTimeoutRef.current = null
    }
  }, [])

  const activateRemuxFallback = useCallback(() => {
    if (useRemuxFallback || !remuxManifestUrl) {
      return false
    }

    const inferredContainer = inferContainerFromUrl(videoUrl)
    const canUseFallback =
      probe?.remuxFallback ||
      probe?.remuxRecommended ||
      inferredContainer === 'mkv' ||
      inferredContainer === 'unknown'

    if (!canUseFallback) {
      return false
    }

    setError(null)
    setLoading(true)
    setUseRemuxFallback(true)
    setRuntimeStrategy('hls')
    return true
  }, [probe?.remuxFallback, probe?.remuxRecommended, remuxManifestUrl, useRemuxFallback, videoUrl])

  const getSeekBounds = useCallback(() => {
    const video = videoRef.current
    if (!video || !canSeek) {
      return null
    }

    const seekableEnd = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : 0
    const seekableStart = video.seekable?.length ? video.seekable.start(0) : 0
    const effectiveDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : seekableEnd

    if (!effectiveDuration || !Number.isFinite(effectiveDuration)) {
      return null
    }

    return {
      start: seekableStart,
      end: effectiveDuration
    }
  }, [canSeek])

  const syncTimeline = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const seekableEnd = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : 0
    const effectiveDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : seekableEnd

    setCurrentTime(video.currentTime || 0)
    setDuration(effectiveDuration || 0)

    if (effectiveDuration > 0) {
      setProgress((video.currentTime / effectiveDuration) * 100)
    } else {
      setProgress(0)
    }
  }, [])

  const destroyPlaybackEngine = useCallback(() => {
    clearStartupTimeout()

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [clearStartupTimeout])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const seekTo = useCallback((targetTime) => {
    const video = videoRef.current
    const bounds = getSeekBounds()
    if (!video || !bounds) {
      return false
    }

    const clampedTime = Math.max(bounds.start, Math.min(bounds.end, targetTime))
    video.currentTime = clampedTime
    setCurrentTime(clampedTime)
    if (bounds.end > 0) {
      setProgress((clampedTime / bounds.end) * 100)
    }
    return true
  }, [getSeekBounds])

  const seekRelative = useCallback((seconds) => {
    const video = videoRef.current
    if (!video) {
      return false
    }

    return seekTo(video.currentTime + seconds)
  }, [seekTo])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    if (video.paused) {
      video.play().catch(() => {})
      return
    }

    video.pause()
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const changeVolume = useCallback((delta) => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.volume = Math.max(0, Math.min(1, video.volume + delta))
    if (video.volume > 0 && video.muted) {
      video.muted = false
    }
    setVolume(video.volume)
    setIsMuted(video.muted || video.volume === 0)
  }, [])

  const handleVolumeChange = useCallback((event) => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const nextVolume = Number(event.target.value)
    video.volume = nextVolume
    if (nextVolume > 0 && video.muted) {
      video.muted = false
    }
    setVolume(video.volume)
    setIsMuted(video.muted || nextVolume === 0)
  }, [])

  const handleSeekInput = useCallback((event) => {
    const nextProgress = Number(event.target.value)
    setProgress(nextProgress)

    const bounds = getSeekBounds()
    if (!bounds) {
      return
    }

    const targetTime = (nextProgress / 100) * bounds.end
    seekTo(targetTime)
  }, [getSeekBounds, seekTo])

  useVodKeyboardControls({
    enabled: Boolean(videoUrl),
    containerRef,
    canSeek,
    onWakeControls: wakeControls,
    onTogglePlay: togglePlay,
    onSeekRelative: seekRelative,
    onVolumeDelta: changeVolume,
    onToggleMute: toggleMute,
    onToggleFullscreen: toggleFullscreen,
    onSeekToStart: () => seekTo(0),
    onSeekToEnd: () => {
      const bounds = getSeekBounds()
      if (bounds) {
        seekTo(bounds.end)
      }
    }
  })

  useEffect(() => {
    const focusTimer = setTimeout(() => {
      containerRef.current?.focus()
    }, 0)

    return () => clearTimeout(focusTimer)
  }, [videoUrl])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => () => {
    clearControlsTimeout()
    clearStartupTimeout()
  }, [clearControlsTimeout, clearStartupTimeout])

  useEffect(() => {
    if (!playbackSourceUrl || !videoRef.current) {
      return undefined
    }

    const video = videoRef.current
    playbackStartedRef.current = false
    setLoading(true)
    setError(null)
    setIsPlaying(false)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)

    const handleLoadedMetadata = () => {
      clearStartupTimeout()
      syncTimeline()
      setLoading(false)
    }

    const handleCanPlay = () => {
      clearStartupTimeout()
      syncTimeline()
      setLoading(false)
    }

    const handleTimeUpdate = () => {
      if (video.currentTime > 0) {
        playbackStartedRef.current = true
        clearStartupTimeout()
      }
      syncTimeline()
    }
    const handlePlay = () => {
      playbackStartedRef.current = true
      clearStartupTimeout()
      setIsPlaying(true)
    }
    const handlePause = () => setIsPlaying(false)
    const handleVolumeSync = () => {
      setVolume(video.volume)
      setIsMuted(video.muted || video.volume === 0)
    }
    const handleEnded = () => {
      setIsPlaying(false)
      setProgress(100)
    }
    const handleWaiting = () => {
      if (playbackStartedRef.current) {
        setLoading(true)
      }
    }
    const handleReady = () => {
      playbackStartedRef.current = true
      clearStartupTimeout()
      setLoading(false)
    }
    const handleError = () => {
      clearStartupTimeout()
      setLoading(false)
      setError('Video baslatilamadi veya bu format tarayicida desteklenmiyor.')
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('durationchange', syncTimeline)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('volumechange', handleVolumeSync)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('seeking', handleWaiting)
    video.addEventListener('seeked', handleReady)
    video.addEventListener('playing', handleReady)
    video.addEventListener('error', handleError)

    video.playsInline = true
    video.preload = runtimeStrategy === 'native' ? 'auto' : 'metadata'
    video.crossOrigin = 'anonymous'

    startupTimeoutRef.current = setTimeout(() => {
      if (playbackStartedRef.current || !video.paused || video.currentTime > 0) {
        return
      }
      setLoading(false)
      setError('Video belirtilen surede baslatilamadi. Kaynak gecici olarak yanit vermiyor olabilir.')
    }, useRemuxFallback ? 25000 : 12000)

    if (runtimeStrategy === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false
        })
        hlsRef.current = hls
        hls.loadSource(playbackSourceUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearStartupTimeout()
          setLoading(false)
          video.play().catch(() => {
            if (!activateRemuxFallback()) {
              setError('Video baslatilamadi veya bu format tarayicida desteklenmiyor.')
            }
          })
        })
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data?.fatal) {
            clearStartupTimeout()
            if (!activateRemuxFallback()) {
              setLoading(false)
              setError('HLS video oynatimi basarisiz oldu.')
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playbackSourceUrl
        video.load()
        video.play().catch(() => {
          if (!activateRemuxFallback()) {
            setError('Bu HLS kaynagi mevcut tarayicida desteklenmiyor.')
          }
        })
      } else {
        clearStartupTimeout()
        if (!activateRemuxFallback()) {
          setLoading(false)
          setError('Bu HLS kaynagi mevcut tarayicida desteklenmiyor.')
        }
      }
    } else {
      video.src = playbackSourceUrl
      video.load()
      video.play().catch(() => {
        if (!activateRemuxFallback()) {
          setLoading(false)
          setError('Video baslatilamadi veya bu format tarayicida desteklenmiyor.')
        }
      })
    }

    return () => {
      clearStartupTimeout()
      playbackStartedRef.current = false
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('durationchange', syncTimeline)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('volumechange', handleVolumeSync)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('seeking', handleWaiting)
      video.removeEventListener('seeked', handleReady)
      video.removeEventListener('playing', handleReady)
      video.removeEventListener('error', handleError)
      destroyPlaybackEngine()
    }
  }, [
    clearStartupTimeout,
    destroyPlaybackEngine,
    activateRemuxFallback,
    playbackSourceUrl,
    runtimeStrategy,
    syncTimeline,
    useRemuxFallback,
    videoUrl
  ])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.volume = volume
    video.muted = isMuted
  }, [isMuted, volume])

  const titlePrefix = mode === 'series' ? 'Dizi' : 'Film'

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 outline-none"
      tabIndex={-1}
      onMouseMove={wakeControls}
      onDoubleClick={toggleFullscreen}
      onClick={() => {
        setShowControls(true)
        containerRef.current?.focus()
      }}
    >
      <div className="relative w-full h-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
            <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: PRIMARY }} />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
            <div className="text-center text-white p-8 max-w-md">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: PRIMARY }} />
              <p className="mb-4">{error}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={onBack}
                  className="px-6 py-3 rounded-xl font-bold text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Geri Don
                </button>
                <button
                  type="button"
                  className="px-4 py-3 rounded-xl font-semibold text-white border border-white/20 hover:bg-white/10"
                  onClick={() => window.location.reload()}
                >
                  Yeniden Dene
                </button>
              </div>
            </div>
          </div>
        )}

        <video ref={videoRef} className="w-full h-full object-contain bg-black" playsInline preload="metadata" />

        {showControls && !error && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40">
            <div className="absolute top-0 left-0 right-0 p-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={onBack}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/45 mb-1">{titlePrefix}</p>
                  <h1 className="text-white text-xl font-bold">{videoTitle || 'Video'}</h1>
                  <p className="text-white/55 text-sm mt-1">
                    Oynatma modu: {runtimeStrategy === 'hls' ? (useRemuxFallback ? 'Remux HLS' : 'HLS') : 'Native HTML5'}
                  </p>
                </div>
              </div>

            </div>

            {!isPlaying && !loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={togglePlay}
                  className="w-24 h-24 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Play className="w-12 h-12 ml-1" fill="currentColor" />
                </button>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-6">
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={progress}
                onInput={handleSeekInput}
                onChange={handleSeekInput}
                disabled={!canSeek}
                className="w-full h-2 rounded-full appearance-none cursor-pointer mb-4 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, ${PRIMARY} ${progress}%, rgba(255,255,255,0.2) ${progress}%)`
                }}
              />
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={togglePlay} className="text-white hover:opacity-70">
                    {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                  </button>
                  <button onClick={() => seekRelative(-10)} disabled={!canSeek} className="text-white hover:opacity-70 disabled:opacity-40">
                    <SkipBack className="w-6 h-6" />
                  </button>
                  <button onClick={() => seekRelative(10)} disabled={!canSeek} className="text-white hover:opacity-70 disabled:opacity-40">
                    <SkipForward className="w-6 h-6" />
                  </button>

                  <div className="flex items-center gap-2 group">
                    <button onClick={toggleMute} className="text-white hover:opacity-70">
                      {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> :
                        volume < 0.3 ? <Volume className="w-6 h-6" /> :
                          volume < 0.7 ? <Volume1 className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                    </button>
                    <div className="w-0 overflow-hidden group-hover:w-24 transition-all duration-300">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-20 h-1 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, ${PRIMARY} ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%)`
                        }}
                      />
                    </div>
                  </div>

                  <div className="text-sm text-white/80 tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!canSeek && (
                    <span className="text-xs uppercase tracking-[0.2em] text-white/55">
                      Seek Yok
                    </span>
                  )}
                  {probe?.codecRisk && (
                    <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-white/55">
                      <ExternalLink className="w-3 h-3" />
                      Uyumluluk Riski
                    </span>
                  )}
                  <button onClick={toggleFullscreen} className="text-white hover:opacity-70">
                    <Maximize className={`w-6 h-6 ${isFullscreen ? 'opacity-80' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
