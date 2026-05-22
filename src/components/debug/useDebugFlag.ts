// `?debug=1` flag reader. Opt-in only — the Memory HUD and any future
// diagnostic surfaces mount only when this is true so production users
// pay zero cost (no polling, no extra components in the React tree).
//
// Hydration discipline: initial state is ALWAYS false so SSR (which
// renders without window) and the client's first render agree on the
// React tree. The actual flag read happens inside useEffect after
// mount — a state update at that point safely re-renders with the
// HUD if ?debug=1 is set, without triggering React error #418
// (hydration mismatch). One frame's delay before the HUD appears in
// debug mode, which is invisible to users (they only see it after
// hydration completes anyway).
//
// popstate listener catches back/forward navigation flipping the flag
// without a full reload.

import { useEffect, useState } from 'react';

function readFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1';
}

export function useDebugFlag(): boolean {
  // Start false to match SSR. Real value lands in the post-mount effect.
  const [enabled, setEnabled] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEnabled(readFlag());
    const handler = () => setEnabled(readFlag());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return enabled;
}
