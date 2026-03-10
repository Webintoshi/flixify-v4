const M3uController = require('../../src/api/controllers/M3uController')

describe('M3uController stale playlist policy', () => {
  const buildController = () => (
    new M3uController(
      { execute: jest.fn() },
      { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
      'test-secret'
    )
  )

  test('does not serve stale playlist for provider 404 responses', () => {
    const controller = buildController()
    const shouldServe = controller._shouldServeStalePlaylist({ statusCode: 404 })

    expect(shouldServe).toBe(false)
  })

  test('does not serve stale playlist for provider 401 responses', () => {
    const controller = buildController()
    const shouldServe = controller._shouldServeStalePlaylist({ response: { status: 401 } })

    expect(shouldServe).toBe(false)
  })

  test('serves stale playlist for transient provider failures', () => {
    const controller = buildController()

    expect(controller._shouldServeStalePlaylist({ statusCode: 502 })).toBe(true)
    expect(controller._shouldServeStalePlaylist(new Error('ETIMEDOUT'))).toBe(true)
  })
})
