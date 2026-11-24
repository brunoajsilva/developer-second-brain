import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { vaultFilePath } from '../core/docs/docs';

const SCHEME = 'vault';
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/** Must run before the app is ready. */
export function registerVaultScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

/** vault://<vaultId>/<relative path> serves attachment images, and only from inside the vault. */
export function handleVaultProtocol(resolveVaultRoot: (vaultId: string) => Promise<string>): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const file = vaultFilePath(await resolveVaultRoot(url.hostname), decodeURIComponent(url.pathname));
      if (!IMAGE.test(file)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}
