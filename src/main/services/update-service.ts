// Keeps the app up to date with the GitHub releases.
//   Windows installer → electron-updater downloads in the background and installs on quit (or on "Restart to update").
//   macOS, portable .exe, Linux → can't replace themselves (macOS needs an Apple Developer ID for that),
//   so the app only checks the latest release and offers its download.
import { app, net, shell } from 'electron';
import type { AppUpdater } from 'electron-updater';
import { LATEST_RELEASE_API, newerRelease, pickDownload, type GithubRelease, type InstallKind } from '../../core/updates/release';
import type { UpdateStatus } from '../../shared/types';

const FIRST_CHECK_DELAY = 15_000;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

function installKind(): InstallKind {
  if (process.platform === 'darwin') return 'mac';
  // electron-builder's portable launcher sets this variable
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_FILE ? 'windows-portable' : 'windows-installer';
  return 'linux';
}

const isTrustedDownload = (url: string) => /^https:\/\/github\.com\//.test(url);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 200);

export class UpdateService {
  private readonly kind = installKind();
  private status: UpdateStatus;
  private downloadUrl = '';
  private updater: AppUpdater | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly notify: (status: UpdateStatus) => void) {
    const mode = !app.isPackaged ? 'off' : this.kind === 'windows-installer' ? 'auto' : 'notify';
    this.status = { mode, current: app.getVersion(), state: 'idle' };
  }

  start(): void {
    if (this.status.mode === 'off') return;
    this.timers.push(setTimeout(() => void this.check(), FIRST_CHECK_DELAY), setInterval(() => void this.check(), CHECK_EVERY));
  }

  stop(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  current(): UpdateStatus {
    return this.status;
  }

  async check(): Promise<UpdateStatus> {
    if (this.status.mode === 'off') return this.set({ state: 'up-to-date', message: 'Updates are off while developing.' });
    // a downloaded update stays ready; one in progress keeps going
    if (this.status.state === 'ready' || this.status.state === 'downloading' || this.status.state === 'checking') return this.status;
    this.set({ state: 'checking', message: undefined });
    try {
      if (this.status.mode === 'auto') await (await this.autoUpdater()).checkForUpdates();
      else await this.checkLatestRelease();
    } catch (e) {
      this.set({ state: 'error', message: errorText(e) });
    }
    return this.set({ checkedAt: Date.now() });
  }

  async install(): Promise<void> {
    if (this.status.mode === 'auto' && this.status.state === 'ready') {
      // quit and run the installer silently, then reopen the app
      setImmediate(() => this.updater?.quitAndInstall(true, true));
      return;
    }
    if (this.status.mode === 'notify' && this.status.state === 'available' && isTrustedDownload(this.downloadUrl)) {
      await shell.openExternal(this.downloadUrl);
    }
  }

  private set(patch: Partial<UpdateStatus>): UpdateStatus {
    this.status = { ...this.status, ...patch };
    this.notify(this.status);
    return this.status;
  }

  private async checkLatestRelease(): Promise<void> {
    const res = await net.fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `DeveloperSecondBrain/${app.getVersion()}` } });
    if (res.status === 404) return void this.set({ state: 'up-to-date' }); // nothing published yet
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const release = (await res.json()) as GithubRelease;
    const newer = newerRelease(release, this.status.current);
    if (!newer) return void this.set({ state: 'up-to-date', latest: release.tag_name.replace(/^v/i, '') });
    this.downloadUrl = pickDownload(release, this.kind, process.arch);
    this.set({ state: 'available', latest: newer.version });
  }

  /** electron-updater, loaded only on the installed Windows app. */
  private async autoUpdater(): Promise<AppUpdater> {
    if (this.updater) return this.updater;
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', latest: info.version, progress: 0 }));
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', progress: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'ready', latest: info.version, progress: 100 }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'up-to-date' }));
    autoUpdater.on('error', (e) => this.set({ state: 'error', message: errorText(e) }));
    this.updater = autoUpdater;
    return autoUpdater;
  }
}
