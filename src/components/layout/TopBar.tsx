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
            <Badge variant="outline" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Your JSON stays local
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            We never see your data — parsing, search, schema inference,
            repair all run in your browser. URL loads fetch directly
            from the source you specify; we don't proxy or log
            anything. Plausible is enabled for anonymous aggregate
            analytics only (no JSON content, no user identifiers, no
            third-party trackers). View the CSP headers.
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
