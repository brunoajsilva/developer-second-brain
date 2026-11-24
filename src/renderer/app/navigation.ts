import { useCallback, useState } from 'react';

export type View =
  | { kind: 'today' }
  | { kind: 'board'; boardId: string; cardId?: string }
  | { kind: 'docs'; collection: string; path: string | null }
  | { kind: 'conflicts' }
  | { kind: 'time-off' }
  | { kind: 'people'; person?: string; meeting?: string; review?: string; tab?: PersonTab }
  | { kind: 'tool'; toolId: string };

const HISTORY_LIMIT = 60;
const same = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

/** Identity of the screen: changing it plays the view transition (opening a card or a page inside it does not). */
export function screenKey(v: View): string {
  if (v.kind === 'board') return 'board:' + v.boardId;
  if (v.kind === 'docs') return 'docs:' + v.collection;
  if (v.kind === 'tool') return 'tool:' + v.toolId;
  return v.kind;
}

/** Back/forward history of views, plus the direction of the last move (for transitions). */
export function useNavigation() {
  const [state, setState] = useState<{ stack: View[]; index: number; direction: 1 | -1 }>({ stack: [{ kind: 'today' }], index: 0, direction: 1 });

  const go = useCallback((view: View, replace?: boolean) => {
    setState((s) => {
      const current = s.stack[s.index];
      if (same(current, view)) return s;
      // filling in the selected page of the same collection replaces the entry instead of adding one
      const fillIn = current.kind === 'docs' && view.kind === 'docs' && current.collection === view.collection && current.path === null;
      const keep = replace || fillIn ? s.index : s.index + 1;
      const stack = s.stack.slice(0, keep).concat(view).slice(-HISTORY_LIMIT);
      return { stack, index: stack.length - 1, direction: 1 };
    });
  }, []);
  const back = useCallback(() => setState((s) => (s.index > 0 ? { ...s, index: s.index - 1, direction: -1 } : s)), []);
  const forward = useCallback(() => setState((s) => (s.index < s.stack.length - 1 ? { ...s, index: s.index + 1, direction: 1 } : s)), []);
  const reset = useCallback(() => setState({ stack: [{ kind: 'today' }], index: 0, direction: 1 }), []);

  return {
    view: state.stack[state.index],
    direction: state.direction,
    canGoBack: state.index > 0,
    canGoForward: state.index < state.stack.length - 1,
    go,
    back,
    forward,
    reset
  };
}

/** Tabs of a person's page under Team › People. */
export type PersonTab = 'feedback' | 'one-on-ones' | 'reviews';
