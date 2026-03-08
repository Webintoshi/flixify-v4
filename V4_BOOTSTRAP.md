# Flixify V4 Bootstrap

This project tree was created from the V3 codebase as a clean working copy.

## Included

- `src/` backend source
- `frontend/src/` and frontend build config
- `database/` schemas, migrations, and seed files
- deployment and operational documentation
- tests and scripts

## Intentionally Excluded

- `.git/`
- `node_modules/`
- build outputs such as `dist/` and `coverage/`
- live environment files such as `.env` and root `.env.production`

## Important Note

V4 currently starts from the V3 application logic. The unsafe and outdated patterns have not been refactored yet; this folder is the new workspace for that refactor.

## Recommended First Refactor Targets

1. Move all IPTV fetching behind backend proxy endpoints. The frontend should never read provider URLs directly.
2. Rewrite playlist, logo, and segment URLs so the browser only talks to your own HTTPS domain.
3. Remove or replace public raw playlist endpoints that expose provider credentials.
4. Encrypt user-specific provider URLs at rest before storing them in the database.
5. Replace static package management with real database-backed CRUD.
6. Fix admin creation flow to write `password_hash`, not `password`.
7. Fix generated user proxy URLs to use `/api/v1/...`.
8. Tighten CORS and production startup so the app fails fast instead of switching to in-memory mode in production.

## Suggested Working Order

1. Stabilize backend auth, package, and admin flows.
2. Introduce secure playlist parsing and caching on the server.
3. Replace the current player flow with proxy-only playback.
4. Add production validation, monitoring, and deployment hardening.
