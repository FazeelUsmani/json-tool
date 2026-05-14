import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function TopBar() {
  return (
    <header className="bg-background flex h-12 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <span className="text-foreground text-sm font-semibold tracking-tight">
          json-tool
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
            >
              100% client-side
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Your JSON never leaves your browser. CSP will enforce this in production.
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
