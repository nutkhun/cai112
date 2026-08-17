import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { SECTIONS } from '@/types';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarClock, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

export interface PresentationSlot {
  id: string;
  exam_type: string;
  slot_date: string;
  slot_time: string;
  section: string | null;
  booked_group_id: string | null;
}

const EXAM_TYPES = ['Midterm Presentation', 'Final Project'];

export const TeacherPresentationSlotsTab = () => {
  const { getGroupById } = useGroups();
  const [slots, setSlots] = useState<PresentationSlot[]>([]);
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [slotDate, setSlotDate] = useState('');
  const [slotTime, setSlotTime] = useState('');
  const [section, setSection] = useState('all');
  const [saving, setSaving] = useState(false);

  const fetchSlots = async () => {
    const { data } = await supabase
      .from('presentation_slots')
      .select('*')
      .order('slot_date', { ascending: true });
    if (data) {
      const sorted = (data as PresentationSlot[]).sort((a, b) =>
        (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time));
      setSlots(sorted);
    }
  };

  useEffect(() => {
    fetchSlots();
    const channel = supabase
      .channel('presentation-slots-teacher')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presentation_slots' }, () => fetchSlots())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addSlot = async () => {
    if (!slotDate || !slotTime) {
      toast.error('Please pick a date and time');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('presentation_slots').insert({
      id: crypto.randomUUID(),
      exam_type: examType,
      slot_date: slotDate,
      slot_time: slotTime,
      section: section === 'all' ? null : section,
      booked_group_id: null,
    });
    if (error) toast.error('Failed to add slot');
    else {
      toast.success('Slot added');
      fetchSlots();
    }
    setSaving(false);
  };

  const deleteSlot = async (slot: PresentationSlot) => {
    const { error } = await supabase.from('presentation_slots').delete().eq('id', slot.id);
    if (error) toast.error('Failed to delete slot');
    else fetchSlots();
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-display">
            <Plus className="w-5 h-5 text-primary" />
            Add Presentation Slot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="space-y-2">
              <Label>For</Label>
              <Select value={examType} onValueChange={setExamType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={addSlot} disabled={saving || !slotDate || !slotTime} className="w-full gap-2">
                <Plus className="w-4 h-4" />
                Add Slot
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {EXAM_TYPES.map(type => {
        const typeSlots = slots.filter(s => s.exam_type === type);
        return (
          <Card key={type} className="shadow-soft border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-display">
                <CalendarClock className="w-5 h-5 text-primary" />
                {type} Slots
                <Badge variant="secondary" className="ml-1">
                  {typeSlots.filter(s => s.booked_group_id).length}/{typeSlots.length} booked
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {typeSlots.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No slots yet - add some above</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {typeSlots.map(slot => {
                    const group = slot.booked_group_id ? getGroupById(slot.booked_group_id) : null;
                    return (
                      <div
                        key={slot.id}
                        className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                          slot.booked_group_id ? 'border-success/40 bg-success/5' : 'bg-muted/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {format(new Date(slot.slot_date + 'T00:00:00'), 'EEE, MMM d')} · {slot.slot_time}
                          </p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px]">{slot.section || 'All'}</Badge>
                            {slot.booked_group_id ? (
                              <span className="flex items-center gap-1 truncate text-success">
                                <Users className="h-3 w-3" />
                                {group?.name || 'Booked'}
                              </span>
                            ) : (
                              <span>Available</span>
                            )}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive"
                          onClick={() => deleteSlot(slot)}
                          title={slot.booked_group_id ? 'Delete slot (frees the booking)' : 'Delete slot'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
