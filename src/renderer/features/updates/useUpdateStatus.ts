import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { UpdateStatus } from '../../../shared/types';

/** The app's update status, kept current by the main process. */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getUpdateStatus().then((s) => alive && setStatus(s)).catch(() => undefined);
    const off = window.bridge.onUpdateStatus(setStatus);
    return () => { alive = false; off(); };
  }, []);
  return status;
}

/** What to tell the person after they asked to check. */
export function describeCheck(s: UpdateStatus): { text: string; tone?: 'error' } {
  switch (s.state) {
    case 'up-to-date': return { text: s.mode === 'off' ? 'Updates are off in development builds.' : `You have the latest version (${s.current}).` };
    case 'available': return { text: `Version ${s.latest} is available. Use “Download” at the bottom of the sidebar.` };
    case 'downloading': return { text: `Downloading version ${s.latest}…` };
    case 'ready': return { text: `Version ${s.latest} is ready. Restart to update.` };
    case 'error': return { text: `Couldn't check for updates: ${s.message ?? 'unknown error'}`, tone: 'error' };
    default: return { text: 'Checking for updates…' };
  }
}
