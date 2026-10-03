/**
 * Packaging for Central Pro.
 *
 *   npm run dist:win    → dist/Central-Pro-Setup-<version>.exe (NSIS, x64)
 *
 * Business data lives in %APPDATA%\Central Pro (never in Program Files), so
 * installing a new version over an old one, or uninstalling, never touches
 * it. Database migrations run at first start, after an automatic backup.
 *
 * Optional online updates: set CENTRAL_UPDATE_URL (a folder on your web
 * server where you upload latest.yml + the installer) when building.
 * Without it, updates are delivered by sending customers the new installer.
 * Optional code signing: set CSC_LINK / CSC_KEY_PASSWORD (electron-builder).
 */
const updateUrl = process.env.CENTRAL_UPDATE_URL

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.centralpro.app',
  productName: 'Central Pro',
  copyright: `© ${new Date().getFullYear()} Central Pro`,
  directories: { output: 'dist', buildResources: 'build' },
  files: [
    'out/**',
    'resources/**',
    'package.json',
    '!**/*.map',
    '!**/*.d.{ts,mts,cts}',
    '!**/node_modules/better-sqlite3/{deps,src,docs}/**',
    // Only the SQLite query compiler is used.
    '!**/node_modules/@prisma/client/runtime/*{mysql,postgresql,sqlserver,cockroachdb}*'
  ],
  // Native SQLite driver and the Prisma query engine must live outside the asar.
  // better-sqlite3 ships Node-API prebuilds for every platform that load in
  // Electron as-is, so no native rebuild (and no compiler) is needed.
  npmRebuild: false,
  // Native drivers must live outside the asar.
  asarUnpack: ['**/*.node'],
  extraResources: [{ from: 'prisma/migrations', to: 'migrations', filter: ['**/migration.sql'] }],
  electronLanguages: ['ar', 'en-US'],
  win: {
    files: ['!**/node_modules/better-sqlite3/prebuilds/{linux,darwin}*', '!**/node_modules/better-sqlite3/prebuilds/win32-arm64*'],
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png',
    artifactName: 'Central-Pro-Setup-${version}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'Central Pro',
    deleteAppDataOnUninstall: false,
    installerLanguages: ['ar_SA', 'en_US'],
    displayLanguageSelector: false,
    language: '1025'
  },
  linux: { target: ['dir'], icon: 'build/icon.png', category: 'Office', files: ['!**/node_modules/better-sqlite3/prebuilds/{win32,darwin}*'] },
  publish: updateUrl ? [{ provider: 'generic', url: updateUrl }] : null
}
