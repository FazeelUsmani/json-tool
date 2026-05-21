// `?debug=1` flag reader. Opt-in only — the Memory HUD and any future
// diagnostic surfaces mount only when this is true so production users
// pay zero cost (no polling, no extra components in the React tree).
//
// Read at mount time and re-read on `popstate` so back/forward navigation
// flips the flag without a full reload. SSR-safe: returns false when
// window is undefined (vite-react-ssg's static build pass runs in Node).
//
// If granular flags become useful later (e.g. ?debug=hud,events,perf)
// this becomes a one-line parser change — keep the value opaque for now
// to avoid premature scheme design.

import { useEffect, useState } from 'react';

function readFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1';
}

export function useDebugFlag(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => readFlag());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setEnabled(readFlag());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return enabled;
}
