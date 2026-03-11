#!/usr/bin/env node

function normalizeBaseUrl(value) {
  const normalized = String(value || 'http://127.0.0.1:4173').trim()
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.FRONTEND_BASE_URL)
  const expectedReleaseId = String(process.env.EXPECTED_RELEASE_ID || '').trim()
  const response = await fetch(`${baseUrl}/`, {
    headers: {
      Accept: 'text/html'
    },
    redirect: 'manual'
  })

  expect(response.ok, `frontend-root: expected 2xx but received ${response.status}`)
  const html = await response.text()
  const releaseMatch = html.match(/<meta\s+name=["']x-release-id["']\s+content=["']([^"']+)["']/i)
  const assetMatch = html.match(/\/assets\/index-[^"'\\s>]+\.js/i)

  expect(releaseMatch?.[1], 'frontend-root: missing x-release-id meta tag')
  expect(assetMatch?.[0], 'frontend-root: missing hashed index asset reference')
  expect(!html.includes('/src/main.jsx'), 'frontend-root: dev entrypoint leaked into production HTML')

  if (expectedReleaseId) {
    expect(
      releaseMatch[1] === expectedReleaseId,
      `frontend-root: expected release ${expectedReleaseId} but received ${releaseMatch[1]}`
    )
  }

  console.table([{
    label: 'frontend-root',
    status: response.status,
    releaseId: releaseMatch[1],
    asset: assetMatch[0]
  }])
}

main().catch((error) => {
  console.error(`[smoke:frontend] ${error.message}`)
  process.exit(1)
})
