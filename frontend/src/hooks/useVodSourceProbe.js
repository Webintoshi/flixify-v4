import { useEffect, useMemo, useState } from 'react'

function buildProbeUrl(streamUrl) {
  if (!streamUrl || typeof window === 'undefined') {
    return null
  }

  try {
    const parsed = new URL(streamUrl, window.location.origin)
    if (!parsed.pathname.startsWith('/api/v1/stream/')) {
      return null
    }

    parsed.pathname = `${parsed.pathname}/probe`
    return parsed.toString()
  } catch {
    return null
  }
}

export function useVodSourceProbe(streamUrl, enabled = true) {
  const probeUrl = useMemo(() => buildProbeUrl(streamUrl), [streamUrl])
  const [state, setState] = useState({
    loading: !!enabled,
    error: null,
    data: null
  })

  useEffect(() => {
    if (!enabled || !streamUrl || !probeUrl) {
      setState({ loading: false, error: null, data: null })
      return
    }

    const controller = new AbortController()

    setState((current) => ({
      loading: true,
      error: null,
      data: current.data
    }))

    fetch(probeUrl, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload?.message || `HTTP ${response.status}`)
        }

        return payload?.data || null
      })
      .then((data) => {
        setState({
          loading: false,
          error: null,
          data
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }

        setState({
          loading: false,
          error,
          data: null
        })
      })

    return () => controller.abort()
  }, [enabled, probeUrl, streamUrl])

  return {
    probeUrl,
    ...state
  }
}
