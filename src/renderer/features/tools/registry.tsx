import type { ComponentType, ReactNode } from 'react';
import { Base64Icon } from '../../components/Icons';
import { Base64Viewer } from './base64/Base64Viewer';

/** A developer tool. Tools do not depend on the open vault; add new ones to TOOLS. */
export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  /** Extra words the command palette matches on. */
  keywords: string[];
  component: ComponentType;
}

export const TOOLS: Tool[] = [
  {
    id: 'base64',
    name: 'Base64 viewer',
    description: 'Decode base64 or a data URI and see what is inside, or turn a file into base64.',
    icon: <Base64Icon size={17} />,
    keywords: ['base64', 'data uri', 'decode', 'encode', 'image', 'pdf', 'binary', 'file type'],
    component: Base64Viewer
  }
];

export const findTool = (id: string) => TOOLS.find((t) => t.id === id);
