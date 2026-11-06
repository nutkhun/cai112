import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { queueLabel, slotTimeRange, type PresentationSlot } from '@/lib/presentation-slots';

export function PresentationSlotIdentity({ slot }: { slot: PresentationSlot }) {
  return (
    <span className="block">
      <span className="block text-sm font-bold tracking-wide text-primary sm:text-base">{queueLabel(slot)}</span>
      <span className="mt-1 block text-sm font-medium tabular-nums text-foreground sm:text-base">{slotTimeRange(slot)}</span>
    </span>
  );
}

// Remember which days the viewer collapsed (per browser). Storage can be unavailable, so never let it break rendering.
const COLLAPSED_KEY = 'presentation-days-collapsed';
function readCollapsed(): string[] {
  try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'); } catch { return []; }
}
function writeCollapsed(id: string, collapsed: boolean) {
  try {
    const set = new Set(readCollapsed());
    if (collapsed) set.add(id); else set.delete(id);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

export function PresentationDateGroup({ date, examType, slots, children }: {
  date: string; examType: string; slots: PresentationSlot[]; children: ReactNode;
}) {
  const dateLabel = format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy');
  const storageId = `${examType}|${date}`;
  const [open, setOpen] = useState(() => !readCollapsed().includes(storageId));
  const onOpenChange = (next: boolean) => { setOpen(next); writeCollapsed(storageId, !next); };
  return (
    <Collapsible asChild open={open} onOpenChange={onOpenChange}>
      <section aria-label={`${examType} — ${dateLabel}`} className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
        <CollapsibleTrigger
          className={`group flex w-full flex-wrap items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${open ? 'mb-3' : ''}`}
        >
          {/* The day is the primary landmark the teacher scans for - give it heading weight. */}
          <span className="flex items-center gap-2">
            <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90 sm:h-6 sm:w-6" />
            <h4 className="font-display text-lg font-bold text-foreground sm:text-2xl">{dateLabel}</h4>
          </span>
          <Badge variant="secondary" className="text-sm font-normal">
            {slots.filter(slot => !slot.booked_group_id).length} of {slots.length} available
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
