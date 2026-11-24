import { describe, expect, it } from 'vitest';
import { compareVersions, newerRelease, pickDownload, type GithubRelease } from '../../src/core/updates/release';

const release: GithubRelease = {
  tag_name: 'v0.3.0',
  html_url: 'https://github.com/o/r/releases/tag/v0.3.0',
  assets: [
    { name: 'DeveloperSecondBrain-Setup-0.3.0.exe', browser_download_url: 'https://x/setup.exe' },
    { name: 'secondbrain.exe', browser_download_url: 'https://x/secondbrain.exe' },
    { name: 'DeveloperSecondBrain-0.3.0-mac-arm64.dmg', browser_download_url: 'https://x/mac-arm64.dmg' },
    { name: 'DeveloperSecondBrain-0.3.0-mac-x64.dmg', browser_download_url: 'https://x/mac-x64.dmg' },
    { name: 'latest.yml', browser_download_url: 'https://x/latest.yml' }
  ]
};

describe('release checks', () => {
  it('compares versions the semver way', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('nonsense', '1.0.0')).toBe(0);
  });

  it('finds a newer final release only', () => {
    expect(newerRelease(release, '0.2.5')).toEqual({ version: '0.3.0' });
    expect(newerRelease(release, '0.3.0')).toBeNull();
    expect(newerRelease({ ...release, prerelease: true }, '0.2.0')).toBeNull();
  });

  it('picks the file for this kind of install', () => {
    expect(pickDownload(release, 'mac', 'arm64')).toBe('https://x/mac-arm64.dmg');
    expect(pickDownload(release, 'mac', 'x64')).toBe('https://x/mac-x64.dmg');
    expect(pickDownload(release, 'windows-portable')).toBe('https://x/secondbrain.exe');
    expect(pickDownload(release, 'windows-installer')).toBe('https://x/setup.exe');
    expect(pickDownload(release, 'linux')).toBe(release.html_url);
  });
});
