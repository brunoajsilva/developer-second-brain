import type { ComponentType, ReactNode } from 'react';
import { Base64Icon, JsonIcon, KeyIcon } from '../../components/Icons';
import { Base64Viewer } from './base64/Base64Viewer';
import { JsonTools } from './json/JsonTools';
import { JwtDecoder } from './jwt/JwtDecoder';

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
    name: 'Base64 Viewer',
    description: 'Decode base64 or a data URI and see what is inside, or turn a file into base64.',
    icon: <Base64Icon size={17} />,
    keywords: ['base64', 'data uri', 'decode', 'encode', 'image', 'pdf', 'binary', 'file type'],
    component: Base64Viewer
  },
  {
    id: 'json',
    name: 'JSON Tools',
    description: 'Beautify or minify JSON, sort keys, and find syntax errors by line and column.',
    icon: <JsonIcon size={17} />,
    keywords: ['json', 'beautify', 'format', 'prettify', 'minify', 'validate', 'pretty print'],
    component: JsonTools
  },
  {
    id: 'jwt',
    name: 'JWT Decoder',
    description: 'Read a token’s header and claims, check expiry and verify the signature.',
    icon: <KeyIcon size={17} />,
    keywords: ['jwt', 'token', 'jws', 'jwe', 'bearer', 'oauth', 'claims', 'signature', 'decode'],
    component: JwtDecoder
  }
];

export const findTool = (id: string) => TOOLS.find((t) => t.id === id);
