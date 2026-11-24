import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data and reloads whenever the dependencies change (including the "tick" bumped by folder changes). */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const reload = useCallback(() => {
    const n = ++sequence.current;
    load()
      .then((d) => {
        if (n !== sequence.current) return;
        setData(d);
        setError('');
      })
      .catch((e: unknown) => {
        if (n === sequence.current) setError(e instanceof Error ? e.message : String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => reload(), [reload]);
  return { data, error, reload, setData };
}

/** Debounced call with `cancel` and `flush` (run now). */
export function useDebounced(fn: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(fn);
  latest.current = fn;
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(), ms);
  }, [ms]);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    latest.current();
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { schedule, cancel, flush };
}

/** Runs `handler` on keydown anywhere in the window. */
export function useWindowKey(handler: (e: KeyboardEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

/** Closes something (a menu) on any mousedown outside it or when the window loses focus. */
export function useDismiss(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const f = () => close();
    window.addEventListener('mousedown', f);
    window.addEventListener('blur', f);
    return () => {
      window.removeEventListener('mousedown', f);
      window.removeEventListener('blur', f);
    };
  }, [open, close]);
}
