// Subscribes to the `dark` class on the document root and returns
// the current state. Tailwind's dark mode is class-based, not media-
// query based, so consumers that need to mirror it in non-Tailwind
// surfaces (Monaco's `theme` prop, third-party canvas, etc.) read
// this hook instead of duplicating the MutationObserver wiring.
//
// SSG-safe: returns false during prerender (no `document` global),
// then attaches the observer on hydration.

import { useEffect, useState } from 'react';

export function useDarkClass(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);
  return isDark;
}
