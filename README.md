# Developer SecondBrain

Docs and boards as plain Markdown files, in vaults (folders) you choose. On Windows, an installer that updates itself or a portable `.exe`; on macOS, a `.dmg`.

## Using it
- Open the app, type your name, then create a vault (or open a folder shared on your sync drive).
- Several vaults: a personal one and any number of shared ones. Each vault is a folder with `_vault.md`, `Docs/` and `Boards/`.
- Shortcuts: `Ctrl/⌘+K` search and commands · `Ctrl/⌘+\` collapse the sidebar · `Alt+←/→` back and forward · `Ctrl/⌘+E` edit the current page · `Ctrl/⌘+Shift+O` switch vault · `Ctrl/⌘+1..9` open a vault · `Ctrl/⌘+Shift+N` quick capture (works from anywhere).
- When the sync drive creates conflict copies, they show up in the sidebar under "sync conflicts".

### Vault layout on disk
```
My Vault/
├── _vault.md            id and name of the vault
├── _team.md             people who can be assigned to cards
├── Docs/                pages; "Page.md" keeps its sub-pages in "Page/"
│   └── Architecture/_attachments/   images pasted into pages
├── Boards/<board-id>/   _board.md (name + columns) and one .md per card
└── .trash/              everything you delete, recoverable
```
Vaults created by v0.1 (Portuguese file names such as `_cofre.md`, `_equipa.md`, `.lixo/`, `_anexos/` and card keys such as `titulo`/`estado`) are converted automatically the first time v0.2 opens them. The old settings file (`definicoes.json`) is imported once into `settings.json`.

## Architecture
```
src/
├── shared/      contracts used by every process: types, the Api interface, IPC channel names
├── core/        pure Node domain layer (no Electron) — fully unit tested
│   ├── fs/          atomic writes with conflict detection, safe paths, frontmatter
│   ├── vault/       vault layout, creation, team, legacy migration, sample content
│   ├── boards/      boards, cards, fractional ordering keys
│   ├── docs/        pages, folders, attachments
│   ├── search/      full-text index and [[backlinks]]
│   ├── conflicts/   sync-drive conflict copies
│   └── settings/    per-user settings outside the vaults
├── main/        Electron main process
│   ├── index.ts         lifecycle, single instance, global shortcut
│   ├── window.ts        BrowserWindow (context isolation + sandbox, no external navigation)
│   ├── security.ts      Content-Security-Policy
│   ├── vault-protocol.ts  vault:// for attachment images, confined to the vault
│   ├── ipc.ts           one invoke channel → AppService
│   └── services/        AppService (implements Api), VaultWatcher, error mapping
├── preload/     exposes a typed `window.bridge` (no Node in the page)
└── renderer/    React UI
    ├── app/         shell, navigation history, workspace context, vault data
    ├── components/  design-system pieces: Modal, Menu, Toast, Avatar, icons, motion presets, Markdown
    ├── features/    one folder per screen: today, boards, docs, search, vaults, conflicts, capture, layout
    ├── lib/         API client, hooks, formatting, Markdown rendering
    └── styles/      tokens, controls, shell, views, prose
```
The renderer never touches the file system. It calls `api.someMethod(...)`, which becomes one IPC call; the main process runs it through `AppService`, which delegates to `core/` and turns errors into typed results (`conflict`, `invalid`, `missing`, `permission`).

## Developing
    npm install
    npm run dev        # Electron + Vite with hot reload
    npm test           # tests for the core layer (including the migration)
    npm run typecheck
    npm run build      # compiles to dist/

## Building the apps

### On GitHub (recommended, nothing to install)
`.github/workflows/build.yml` builds the Windows `.exe` files on a Windows runner and the macOS `.dmg` on a Mac runner.

- **On every push to `main`** (or manually, in *Actions → Build → Run workflow*): runs the tests and builds everything. Download it from *Actions →* the run *→ Artifacts* (kept for 30 days).
- **To publish a version**, change `version` in `package.json` and push to `main`. When the build passes, GitHub tags the commit (`v0.2.1`) and creates the *Release*. If that version already exists, the tag moves to the new commit and the release files are replaced. Installed apps only see a new version when the number goes up. You can still push a `v*` tag by hand.

  Each release has:
  - `DeveloperSecondBrain-Setup-<version>.exe`: Windows installer (no admin rights needed). **Updates itself.**
  - `secondbrain.exe`: Windows portable, nothing to install. Tells you when there is a new version.
  - `DeveloperSecondBrain-<version>-mac-arm64.dmg` (Apple Silicon: M1 and later) and `…-mac-x64.dmg` (Intel Macs). Tell you when there is a new version.
  - `latest.yml` and `.blockmap`: used by the installed Windows app to update itself. Keep them in the release.

### Locally
    npm install
    npm run dist       # Windows: release/DeveloperSecondBrain-Setup-<version>.exe and release/secondbrain.exe
    npm run dist:mac   # macOS:   release/DeveloperSecondBrain-<version>-mac-arm64.dmg and -mac-x64.dmg

## Updates

The app checks the latest GitHub release 15 seconds after it starts and every 6 hours after that. You can also check by hand: click your name at the bottom of the sidebar, then *Check for updates*.

- **Windows, installed:** the new version downloads in the background. It installs when you close the app, or straight away with *Restart* at the bottom of the sidebar.
- **macOS and the portable `.exe`:** a notice at the bottom of the sidebar offers the download. macOS only lets an app replace itself when it is signed with an Apple Developer ID, which this one isn't.

## Opening it on macOS the first time

The app is not from the App Store and isn't signed with an Apple certificate, so macOS blocks it the first time. Drag it to *Applications*, try to open it once, then go to *System Settings → Privacy & Security → Open Anyway*. Or, in Terminal:

    xattr -dr com.apple.quarantine "/Applications/Developer SecondBrain.app"

You only need to do this once per version.

## Installing on another computer (from the public repository)

**Windows** (PowerShell, nothing to install; needs a published release):

```
irm https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/install.ps1 | iex
```

Downloads the latest `secondbrain.exe` to `%LOCALAPPDATA%\SecondBrain`, adds the folder to `PATH` and creates a Start menu shortcut. Run the same command again to update.

**macOS/Linux** (needs Node 22+ and Git):

```
curl -fsSL https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/install.sh | bash
```

Then, in any new terminal: `secondbrain`.

## Opening it from the terminal (`secondbrain`)

**macOS/Linux/Windows, from source** (needs Node):

```
npm install
npm run cli:install    # builds and registers the "secondbrain" command (npm link)
secondbrain            # opens the app; the terminal stays free
```

To remove it: `npm unlink -g developer-secondbrain`.

**Windows, with the portable executable:** the file is called `secondbrain.exe`. Put it in a folder (for example `C:\Tools`), add that folder to `PATH` and type `secondbrain` in a new terminal.

## License

[MIT](LICENSE) © 2026 Bruno Silva. Free to use, copy, modify and distribute, including commercially, as long as the copyright notice is kept.

The app bundles open-source packages under their own licences (MIT, ISC, BSD, Apache-2.0, MPL-2.0, EPL-2.0 and the SIL Open Font License for the Geist font). `npm run build` lists all of them, with their licence texts, in `dist/THIRD_PARTY_NOTICES.txt`, which ships with the app.
