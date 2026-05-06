# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1.0] - 2026-05-05

### Fixed

- Client-side email format validation on the partner application form — invalid addresses (missing `@`, no domain, trailing whitespace) now show an inline error instead of reaching the server.
- Stripe onboarding buttons on the earnings page are now hidden when `STRIPE_SECRET_KEY` is absent, preventing a confusing broken-action state.
- Stripe server actions (`startStripeOnboardingAction`, `confirmStripeOnboardingAction`) now enforce the same key guard as the UI — unauthenticated direct POSTs can no longer write stub Stripe account IDs to the database.
- `NEXTAUTH_SECRET` in `docker-compose.yml` now requires `VMS_NEXTAUTH_SECRET` to be set explicitly; the container refuses to start if the var is missing, preventing deployment with the well-known public default string.

### Changed

- Database environment variables scoped to `VMS_` prefix (`VMS_DB_HOST`, `VMS_DB_PORT`, `VMS_DB_USER`, `VMS_DB_PASSWORD`, `VMS_POSTGRES_ADMIN_DB`) — `VMS_DB_USER` and `VMS_DB_PASSWORD` are now required at container start.
- GitHub Actions CI test job upgraded from Node 20 to Node 22 to match the production Docker image.
- Added `npm run lint` step to CI test job for early feedback on type errors and ESLint violations.
