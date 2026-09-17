import type { ReactNode } from 'react';
import { format } from 'date-fns';
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

export function PresentationDateGroup({ date, examType, slots, children }: {
  date: string; examType: string; slots: PresentationSlot[]; children: ReactNode;
}) {
  const dateLabel = format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy');
  return (
    <section aria-label={`${examType} — ${dateLabel}`} className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground sm:text-base">{dateLabel}</h4>
        <Badge variant="secondary" className="text-xs font-normal">
          {slots.filter(slot => !slot.booked_group_id).length} of {slots.length} available
        </Badge>
      </div>
      {children}
    </section>
  );
}
