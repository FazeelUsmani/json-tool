import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useViewStore } from '@/state/viewStore';

// 100ms debounce: search is O(N) over the flat array. At 1.2M rows a sync
// re-search on each keystroke stutters; debouncing keeps typing snappy.
const QUERY_DEBOUNCE_MS = 100;

export function TreeSearch({
  matchCount,
  currentMatch,
  onJump,
}: {
  matchCount: number;
  currentMatch: number;
  onJump: (direction: 'next' | 'prev') => void;
}) {
  const query = useViewStore((s) => s.query);
  const setQuery = useViewStore((s) => s.setQuery);
  const stubSearchProgress = useViewStore((s) => s.stubSearchProgress);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(localQuery), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [localQuery, setQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onJump(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      setLocalQuery('');
    }
  };

  return (
    <div className="bg-background flex items-center gap-2 border-b px-3 py-1.5">
      <div className="relative flex-1">
        <Input
          data-tree-search
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search keys / values… (press / to focus)"
          className="h-7 text-xs"
        />
        {localQuery && (
          <button
            type="button"
            onClick={() => setLocalQuery('')}
            title="Clear search (Esc)"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      {query && (
        <>
          <span className="text-muted-foreground text-xs tabular-nums">
            {matchCount === 0 ? '0' : currentMatch + 1} / {matchCount}
          </span>
          {stubSearchProgress && (
            <span
              className="text-muted-foreground flex items-center gap-1 text-xs tabular-nums"
              title={`Scanning collapsed stubs: ${stubSearchProgress.scanned.toLocaleString()} of ${stubSearchProgress.total.toLocaleString()}`}
            >
              <Loader2 className="size-3 animate-spin" />
              {formatScanProgress(stubSearchProgress)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onJump('prev')}
            disabled={matchCount === 0}
            title="Previous (Shift+Enter)"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onJump('next')}
            disabled={matchCount === 0}
            title="Next (Enter)"
          >
            <ChevronDown />
          </Button>
        </>
      )}
    </div>
  );
}

// Compact "in-progress" label for the worker scan. Shows percent for
// large scans where raw counts are hard to read at a glance. Doesn't
// cap at 99 — when the worker reports scanned===total the brief 100%
// state is what we want before .then clears the progress entirely;
// capping made "stuck at 99%" the user-visible state until the
// spinner vanished.
function formatScanProgress(p: { scanned: number; total: number }): string {
  if (p.total === 0) return '';
  if (p.total < 1000) return `${p.scanned}/${p.total}`;
  const pct = Math.min(100, Math.floor((p.scanned / p.total) * 100));
  return `${pct}%`;
}
