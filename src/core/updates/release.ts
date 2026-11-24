// Reading GitHub releases: which version is newest and which file fits this computer.
// Pure functions, so they are tested without the network.

/** The GitHub repository releases are published to. */
export const RELEASES_REPO = { owner: 'brunoajsilva', repo: 'developer-second-brain' } as const;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO.owner}/${RELEASES_REPO.repo}/releases/latest`;

export interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/** "v1.2.3" or "1.2.3-beta.1" → [1, 2, 3] plus the pre-release tag ('' for a final version). */
function parse(version: string): { parts: number[]; pre: string } | null {
  const m = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  return m ? { parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? '' } : null;
}

/** Negative when a < b, positive when a > b, 0 when equal or unreadable. A final version beats its pre-releases. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] - y.parts[i];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

export type InstallKind = 'mac' | 'windows-installer' | 'windows-portable' | 'linux';

/** The download that replaces what is installed now; the release page when there is no matching file. */
export function pickDownload(release: GithubRelease, kind: InstallKind, arch = 'x64'): string {
  const find = (test: (name: string) => boolean) => release.assets.find((a) => test(a.name.toLowerCase()))?.browser_download_url;
  const url =
    kind === 'mac' ? find((n) => n.endsWith(`-${arch}.dmg`)) ?? find((n) => n.endsWith('.dmg'))
    : kind === 'windows-portable' ? find((n) => n.endsWith('.exe') && !n.includes('setup'))
    : kind === 'windows-installer' ? find((n) => n.endsWith('.exe') && n.includes('setup'))
    : find((n) => n.endsWith('.appimage'));
  return url ?? release.html_url;
}

/** The newer release, or null when what is installed is up to date (drafts and pre-releases are ignored). */
export function newerRelease(release: GithubRelease, current: string): { version: string } | null {
  if (release.draft || release.prerelease) return null;
  const version = release.tag_name.replace(/^v/i, '');
  return compareVersions(version, current) > 0 ? { version } : null;
}
