# Developer SecondBrain

Docs and boards as plain Markdown files, in vaults (folders) you choose. No install needed: a single portable `.exe` on Windows.

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

## Building the portable .exe

### On GitHub (recommended, nothing to install)
`.github/workflows/build.yml` builds the `.exe` on a Windows runner.

- **On every push to `main`** (or manually, in *Actions → Build → Run workflow*): runs the tests and builds the `.exe`. Download it from *Actions →* the run *→ Artifacts* (kept for 30 days).
- **To publish a version** with a permanent download, push a tag starting with `v` (it should match `package.json`):

      git tag v0.2.0
      git push origin v0.2.0

  GitHub creates a *Release* with `secondbrain.exe`.

### On your PC (Windows, Node.js 20+)
    npm install
    npm run dist       # release/secondbrain.exe

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
