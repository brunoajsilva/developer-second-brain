import type { ReactNode } from 'react';
import { TOOLS } from '../features/tools/registry';
import type { View } from './navigation';

/**
 * What can be turned on or off per vault, grouped like the sidebar.
 * Ids are stored in the local settings (VaultRecord.hiddenFeatures), so never rename one.
 * Today is not listed: it is always shown.
 */
export type FeatureId = 'people' | 'time-off' | 'boards' | 'docs' | `tool:${string}`;

export interface Feature {
  id: FeatureId;
  name: string;
  description: string;
  /** Icon is resolved by the screen that lists features, from the id (tools bring their own). */
  icon?: ReactNode;
}

export interface FeatureGroup {
  /** Same title as the sidebar group. */
  title: string;
  features: Feature[];
}

export const toolFeature = (toolId: string): FeatureId => `tool:${toolId}`;

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: 'Team',
    features: [
      { id: 'people', name: 'People', description: '1:1s, feedback and reviews for each person.' },
      { id: 'time-off', name: 'Time off', description: 'Vacation, sick days and who is out this week.' }
    ]
  },
  {
    title: 'Boards',
    features: [{ id: 'boards', name: 'Boards and cards', description: 'Kanban boards, your cards on Today, and quick capture.' }]
  },
  {
    title: 'Docs',
    features: [{ id: 'docs', name: 'Docs', description: 'Collections and pages written in Markdown.' }]
  },
  {
    title: 'Tools',
    features: TOOLS.map((t) => ({ id: toolFeature(t.id), name: t.name, description: t.description, icon: t.icon }))
  }
];

/** Answers "is this feature shown in the open vault?". */
export type FeatureCheck = (id: FeatureId) => boolean;

export function featureCheck(hidden: readonly string[] | undefined): FeatureCheck {
  const off = new Set(hidden ?? []);
  return (id) => !off.has(id);
}

/** Feature a screen belongs to; null for screens that are always available (Today, sync conflicts). */
export function featureOfView(view: View): FeatureId | null {
  switch (view.kind) {
    case 'people': return 'people';
    case 'time-off': return 'time-off';
    case 'board': return 'boards';
    case 'docs': return 'docs';
    case 'tool': return toolFeature(view.toolId);
    default: return null;
  }
}
