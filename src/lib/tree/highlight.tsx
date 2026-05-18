import type { ReactNode } from 'react';

// Wraps each case-insensitive substring match of `needle` in <mark>. Empty
// needle is a fast-path that returns the input string unchanged. Lives in
// lib/ rather than alongside TreeNode so it's a pure function with its own
// unit tests — TreeNode is a render-coupling site.

export function highlight(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lowerNeedle, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={key++}
        className="rounded-sm bg-yellow-200/70 px-0.5 dark:bg-yellow-600/40"
      >
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    i = idx + needle.length;
  }
  return parts;
}
