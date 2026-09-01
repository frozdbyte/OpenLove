# Changelog

All notable changes to OpenLove are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.6.1] - 2026-08-31

### Added

- Update banner and button prompting you when a new version is available
- Redesigned QR codes, with scanning improvements

### Changed

- More detailed offline-handling drawer
- Better visual state while an image is uploading

### Fixed

- QR code generation
- Toast notification positioning
- iOS JSON export for a specific bond

## [1.6.0] - 2026-08-28

### Added

- Multi-view settings navigation
- Four new UI themes
- Adjustments to onboarding, the push notification prompt, and the invite sheet

### Fixed

- Settings navigation, copy, and attention indicators
- Photo/image error handling, with proactive refresh
- Visual issues in the new themes

## [1.5.1] - 2026-08-28

### Added

- Restore from a JSON backup directly during onboarding
- JSON import preview drawer, with a modern backup-preview style

### Fixed

- Upload size limit on the image relay
- Visual overflow in the hours/days/milestones display
- Android PWA issues

## [1.5.0] - 2026-08-27

### Added

- Optional end-to-end encrypted photo sharing: toggle "Share Photo" on a QR code or link
  share, encrypted on-device before upload
- Feature-flag infrastructure so self-hosters can disable the photo-sharing upload endpoint
  entirely (`FEATURE_SHARE_IMAGES=false`)
- JSON backups now embed each bond's photo inline

### Fixed

- Image loading/indicator and milestone rendering issues
- Photo sharing now greys out correctly while offline

## [1.4.0] - 2026-08-27

### Added

- Multi-bond ("poly") support: track more than one relationship or friendship, each with its
  own settings and theme
- Progressive disclosure improvements across the settings UI
- Emerald color option for friendship bonds

### Fixed

- Milestone scheduler timezone issues
- Bond notification preferences now hide correctly when not applicable
- Broader backup-format compatibility when scanning/importing a shared profile

### Changed

- Internal refactor of the settings, onboarding, and theme components for maintainability

## [1.3.1] - 2026-08-26

### Added

- New "Cover" theme
- Updated app icons

### Fixed

- PWA install button visibility and device detection
- Offline mode
- VAPID subject handling
- Startup flash on load
- Color theme rendering issues
- PWA update toast position
- iOS double-tap zoom
- Modern theme screen fit
- "Cover" theme background, gradients, and image sizing

## [1.3.0] - 2026-08-26

### Added

- In-app version indicator, sourced from `package.json`
- Info page in onboarding

### Fixed

- PWA install device detection

## [1.2.0] - 2026-08-25

### Added

- Improved sharing flow

### Fixed

- Web Push errors

## [1.1.0] - 2026-08-25

### Added

- Coolify deployment support
- Standalone/PWA install metadata detection

### Fixed

- Docker build
- Light mode
- Settings drawer not closing after a data reset
- Mobile settings horizontal scroll
- Onboarding flow ordering and screen fit

## [1.0.0] - 2026-08-25

Initial public release.

### Added

- Client-side relationship/friendship tracking stored in IndexedDB, with dark mode
- Milestone calculation engine and extensible theme system
- Onboarding flow with OS-aware PWA install guidance
- Self-hostable backend with Docker deployment

[Unreleased]: https://github.com/frozdbyte/OpenLove/compare/1.6.1...HEAD
[1.6.1]: https://github.com/frozdbyte/OpenLove/compare/1.6.0...1.6.1
[1.6.0]: https://github.com/frozdbyte/OpenLove/compare/1.5.1...1.6.0
[1.5.1]: https://github.com/frozdbyte/OpenLove/compare/1.5.0...1.5.1
[1.5.0]: https://github.com/frozdbyte/OpenLove/compare/1.4.0...1.5.0
[1.4.0]: https://github.com/frozdbyte/OpenLove/compare/1.3.1...1.4.0
[1.3.1]: https://github.com/frozdbyte/OpenLove/compare/1.3.0...1.3.1
[1.3.0]: https://github.com/frozdbyte/OpenLove/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/frozdbyte/OpenLove/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/frozdbyte/OpenLove/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/frozdbyte/OpenLove/releases/tag/1.0.0
