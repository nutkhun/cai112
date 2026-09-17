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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarClock, Plus, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { SECTION_WINDOWS, toMinutes, toTime, type PresentationSlot } from '@/lib/presentation-slots';
import { PresentationDateGroup, PresentationSlotIdentity } from './PresentationSlotDisplay';

export type { PresentationSlot } from '@/lib/presentation-slots';

const EXAM_TYPES = ['Midterm Presentation', 'Final Project'];

export const TeacherPresentationSlotsTab = () => {
  const { getGroupById } = useGroups();
  const [slots, setSlots] = useState<PresentationSlot[]>([]);
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [datesByExam, setDatesByExam] = useState<Record<string, Date[]>>({});
  const selectedDates = datesByExam[examType] ?? [];
  const slotDates = selectedDates.map(date => format(date, 'yyyy-MM-dd')).sort();
  const setSelectedDates = (dates: Date[]) => setDatesByExam(current => ({ ...current, [examType]: dates }));
  const [slotTime, setSlotTime] = useState('');
  const [slotEndTime, setSlotEndTime] = useState('');
  const [section, setSection] = useState('all');
  const [saving, setSaving] = useState(false);
  const [genSection, setGenSection] = useState('458A');
  const [genLength, setGenLength] = useState('15');
  const [generating, setGenerating] = useState(false);
  const busy = saving || generating;
  const classWindow = SECTION_WINDOWS[genSection];
  const slotsPerDay = Math.floor((toMinutes(classWindow.end) - toMinutes(classWindow.start)) / Number(genLength));

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
    if (busy) return;
    if (!slotDates.length || !slotTime || !slotEndTime || slotEndTime <= slotTime) {
      toast.error('Pick at least one date and an end time later than the start time');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('presentation_slots').insert(slotDates.map(slotDate => ({
      id: crypto.randomUUID(),
      exam_type: examType,
      slot_date: slotDate,
      slot_time: slotTime,
      slot_end_time: slotEndTime,
      section: section === 'all' ? null : section,
      booked_group_id: null,
      queue_no: Math.max(0, ...slots.filter(slot => slot.exam_type === examType && slot.slot_date === slotDate &&
        slot.section === (section === 'all' ? null : section)).map(slot => slot.queue_no ?? 0)) + 1,
    })));
    if (error) toast.error('Failed to add slot');
    else {
      if (data.length) toast.success(`Added ${data.length} slot${data.length === 1 ? '' : 's'}`);
      else toast.info('These slots already exist');
      fetchSlots();
    }
    setSaving(false);
  };

  const generateSlots = async () => {
    if (busy) return;
    if (!slotDates.length) {
      toast.error('Please pick at least one date first');
      return;
    }
    const win = SECTION_WINDOWS[genSection];
    const length = parseInt(genLength);
    const startMin = toMinutes(win.start);
    const endMin = toMinutes(win.end);

    // The backend also skips duplicates, including retries and concurrent requests.
    const existing = new Set(
      slots
        .filter(s => s.exam_type === examType && s.section === genSection)
        .map(s => `${s.slot_date}/${s.slot_time.slice(0, 5)}`)
    );

    const rows = [];
    for (const slotDate of slotDates) {
      let queue = 1;
      for (let t = startMin; t + length <= endMin; t += length) {
        const time = toTime(t);
        if (!existing.has(`${slotDate}/${time}`)) {
          rows.push({
            id: crypto.randomUUID(),
            exam_type: examType,
            slot_date: slotDate,
            slot_time: time,
            slot_end_time: toTime(t + length),
            section: genSection,
            booked_group_id: null,
            queue_no: queue,
          });
        }
        queue++;
      }
    }

    if (rows.length === 0) {
      toast.error('All slots in this window already exist');
      return;
    }

    setGenerating(true);
    const { data, error } = await supabase.from('presentation_slots').insert(rows);
    if (error) toast.error('Failed to generate slots');
    else {
      if (data.length) {
        const days = new Set(data.map((slot: PresentationSlot) => slot.slot_date)).size;
        toast.success(`Created ${data.length} slots across ${days} day${days === 1 ? '' : 's'} for ${genSection}`);
      } else toast.info('All selected slots already exist');
      fetchSlots();
    }
    setGenerating(false);
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
            Add Presentation Slots
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>For</Label>
              <Select value={examType} onValueChange={setExamType} disabled={busy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="presentation-dates">Presentation dates</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="presentation-dates" variant="outline" disabled={busy} className="w-full justify-start gap-2">
                    <CalendarClock className="h-4 w-4" />
                    {slotDates.length ? `${slotDates.length} day${slotDates.length === 1 ? '' : 's'} selected` : 'Choose one or more dates'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="multiple" selected={selectedDates} onSelect={dates => setSelectedDates(dates ?? [])} disabled={busy} initialFocus />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">Select each presentation day. Click a selected day again to remove it.</p>
              {slotDates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {slotDates.map(date => (
                    <Badge key={date} variant="secondary" className="gap-1">
                      {format(new Date(date + 'T00:00:00'), 'EEE, MMM d, yyyy')}
                      <button type="button" disabled={busy} aria-label={`Remove ${date}`} className="rounded p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => setSelectedDates(selectedDates.filter(day => format(day, 'yyyy-MM-dd') !== date))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelectedDates([])}>Clear dates</Button>
                </div>
              )}
            </div>
          </div>

          {/* Auto-generate a full class window */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Generate the whole class period on each selected day</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Section (class time)</Label>
                <Select value={genSection} onValueChange={setGenSection} disabled={busy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map(s => (
                      <SelectItem key={s} value={s}>
                        {s} · {SECTION_WINDOWS[s].start}-{SECTION_WINDOWS[s].end}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Presentation length</Label>
                <Select value={genLength} onValueChange={setGenLength} disabled={busy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['10', '15', '20', '25', '30'].map(m => (
                      <SelectItem key={m} value={m}>{m} minutes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generateSlots} disabled={busy || !slotDates.length} className="w-full gap-2">
                  <CalendarClock className="w-4 h-4" />
                  {generating ? 'Generating...' : `Generate up to ${slotsPerDay * slotDates.length} slots`}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {slotsPerDay} slots per day for {genSection}, every {genLength} minutes. Queue numbers restart each day. Existing slots and bookings are kept; duplicate times are skipped.
            </p>
          </div>

          {/* Manual single slot */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="presentation-time">Or add a slot · Start time</Label>
              <Input id="presentation-time" type="time" value={slotTime} disabled={busy} onChange={(e) => setSlotTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="presentation-end-time">End time</Label>
              <Input id="presentation-end-time" type="time" value={slotEndTime} min={slotTime || undefined} disabled={busy} onChange={(e) => setSlotEndTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection} disabled={busy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={addSlot} disabled={busy || !slotDates.length || !slotTime || !slotEndTime || slotEndTime <= slotTime} className="w-full gap-2">
                <Plus className="w-4 h-4" />
                {saving ? 'Adding...' : `Add ${slotDates.length} slot${slotDates.length === 1 ? '' : 's'}`}
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
            <CardContent className="space-y-5">
              {typeSlots.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No slots yet - add some above</p>
              ) : (
                [...new Set(typeSlots.map(slot => slot.slot_date))].map(date => {
                  const daySlots = typeSlots.filter(slot => slot.slot_date === date);
                  return (
                    <PresentationDateGroup key={date} date={date} examType={type} slots={daySlots}>
                      <div className="space-y-4">
                        {[...SECTIONS, null].map(sec => {
                          const sectionSlots = daySlots.filter(s => (sec === null ? !s.section : s.section === sec));
                          if (sectionSlots.length === 0) return null;
                          return (
                            <div key={sec ?? 'all'}>
                              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Badge variant="secondary" className="text-xs">{sec ?? 'All Sections'}</Badge>
                                {sec && SECTION_WINDOWS[sec] && (
                                  <span>{SECTION_WINDOWS[sec].start}-{SECTION_WINDOWS[sec].end}</span>
                                )}
                                <span className="normal-case">
                                  {sectionSlots.filter(s => s.booked_group_id).length}/{sectionSlots.length} booked
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {sectionSlots.map(slot => {
                                  const group = slot.booked_group_id ? getGroupById(slot.booked_group_id) : null;
                                  return (
                                    <div
                                      key={slot.id}
                                      className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                                        slot.booked_group_id ? 'border-success bg-success/10' : 'border-primary/30 bg-card'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <PresentationSlotIdentity slot={slot} />
                                        <div className="mt-2 flex flex-wrap items-center gap-[9px] text-sm text-muted-foreground sm:text-base">
                                          <Badge variant="secondary" className="px-[15px] py-[3px] text-sm sm:text-base">{slot.section || 'All'}</Badge>
                                          {slot.booked_group_id ? (
                                            <span className="flex items-center gap-1.5 truncate text-success">
                                              <Users className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                                              {group?.name || 'Booked'}
                                            </span>
                                          ) : (
                                            <span>Available</span>
                                          )}
                                        </div>
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
                            </div>
                          );
                        })}
                      </div>
                    </PresentationDateGroup>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
