import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface Slot {
  id: string;
  exam_type: string;
  slot_date: string;
  slot_time: string;
  section: string | null;
  booked_group_id: string | null;
}

const EXAM_TYPES = ['Midterm Presentation', 'Final Project'];

/**
 * Booking board for presentation time slots. Students only see whether a slot
 * is free, taken by another group (anonymous), or held by their own group.
 * Clicking a free slot books it for the whole group and releases any slot the
 * group held for the same exam; clicking their own slot releases it.
 */
export const PresentationQueue = ({ groupId }: { groupId: string }) => {
  const { currentStudent } = useGroups();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);

  const fetchSlots = async () => {
    const { data } = await supabase.from('presentation_slots').select('*');
    if (data) {
      const sorted = (data as Slot[]).sort((a, b) =>
        (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time));
      setSlots(sorted);
    }
  };

  useEffect(() => {
    fetchSlots();
    const channel = supabase
      .channel('presentation-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presentation_slots' }, () => fetchSlots())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const visibleSlots = slots.filter(
    s => !s.section || s.section === currentStudent?.section
  );

  const book = async (slot: Slot) => {
    if (busy) return;
    setBusy(true);
    try {
      if (slot.booked_group_id === groupId) {
        // Clicking our own slot releases it.
        const { error } = await supabase
          .from('presentation_slots')
          .update({ booked_group_id: null })
          .eq('id', slot.id);
        if (error) throw error;
        toast.success('Slot released');
      } else if (!slot.booked_group_id) {
        // Claim only if still free (protects against two groups racing).
        const { error } = await supabase
          .from('presentation_slots')
          .update({ booked_group_id: groupId })
          .eq('id', slot.id)
          .is('booked_group_id', null);
        if (error) throw error;
        // Release any other slot we held for the same exam type.
        await supabase
          .from('presentation_slots')
          .update({ booked_group_id: null })
          .eq('exam_type', slot.exam_type)
          .eq('booked_group_id', groupId)
          .neq('id', slot.id);
        toast.success(`Booked ${format(new Date(slot.slot_date + 'T00:00:00'), 'EEE, MMM d')} at ${slot.slot_time}`);
      }
      await fetchSlots();
    } catch {
      toast.error('Could not update the booking - the slot may have just been taken.');
      fetchSlots();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-soft border-0">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 font-display font-semibold text-base sm:text-lg">
          <CalendarClock className="w-5 h-5 text-primary" />
          Presentation Queue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {EXAM_TYPES.map(type => {
          const typeSlots = visibleSlots.filter(s => s.exam_type === type);
          const mySlot = typeSlots.find(s => s.booked_group_id === groupId);
          return (
            <div key={type}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {type}
                {mySlot && (
                  <Badge className="border-0 bg-success/15 text-[10px] text-success">
                    Your slot: {format(new Date(mySlot.slot_date + 'T00:00:00'), 'MMM d')} · {mySlot.slot_time}
                  </Badge>
                )}
              </p>
              {typeSlots.length === 0 ? (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  No slots posted yet - your teacher will open booking here.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {typeSlots.map(slot => {
                    const mine = slot.booked_group_id === groupId;
                    const taken = !!slot.booked_group_id && !mine;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={taken || busy}
                        onClick={() => book(slot)}
                        title={mine ? 'Tap to release your booking' : taken ? 'Unavailable' : 'Tap to book for your group'}
                        className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                          mine
                            ? 'border-success bg-success/10'
                            : taken
                              ? 'cursor-not-allowed border-border bg-muted/60 opacity-60'
                              : 'border-primary/30 bg-card hover:bg-primary/5'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="font-medium">
                            {format(new Date(slot.slot_date + 'T00:00:00'), 'EEE, MMM d')}
                          </span>
                          {mine ? <Check className="h-3.5 w-3.5 text-success" /> : taken ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                        </span>
                        <span className="text-muted-foreground">{slot.slot_time}</span>
                        <span className={`block font-medium ${mine ? 'text-success' : taken ? 'text-muted-foreground' : 'text-primary'}`}>
                          {mine ? 'Your group' : taken ? 'Unavailable' : 'Available'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Anyone in your group can book. Picking a new slot moves your booking; who booked which slot stays private.
        </p>
      </CardContent>
    </Card>
  );
};
