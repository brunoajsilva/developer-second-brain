import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { spring } from '../../components/motion';
import { useToast } from '../../components/Toast';
import { DownloadIcon, RestartIcon } from '../../components/Icons';
import type { UpdateStatus } from '../../../shared/types';

/** Sidebar notice for a new version: "Restart" once downloaded (Windows), "Download" where the app can't update itself. */
export function UpdateAlert({ status, collapsed }: { status: UpdateStatus | null; collapsed: boolean }) {
  const toast = useToast();
  const ready = status?.state === 'ready';
  const available = status?.state === 'available';
  const label = ready ? `Version ${status!.latest} is ready` : `Version ${status?.latest} is out`;
  const action = ready ? 'Restart' : 'Download';
  const run = () => void api.installUpdate().catch((e) => toast(errorMessage(e), 'error'));
  return (
    <AnimatePresence>
      {(ready || available) && (
        <motion.button className="update-alert" onClick={run} title={ready ? 'Restart now to finish updating' : 'Download the new version from GitHub'}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring}>
          {ready ? <RestartIcon size={16} /> : <DownloadIcon size={16} />}
          {!collapsed && <span className="grow">{label}</span>}
          {!collapsed && <span className="link">{action}</span>}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
