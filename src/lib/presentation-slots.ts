export interface PresentationSlot {
  id: string;
  exam_type: string;
  slot_date: string;
  slot_time: string;
  slot_end_time?: string | null;
  section: string | null;
  booked_group_id: string | null;
  queue_no: number | null;
}

export const SECTION_WINDOWS: Record<string, { start: string; end: string }> = {
  '458A': { start: '08:40', end: '11:00' },
  '457A': { start: '12:00', end: '14:20' },
  '458B': { start: '14:30', end: '16:50' },
};

export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Recover old generated schedules only when their numbered intervals agree.
// Queue differences preserve the duration even if an intermediate slot was deleted.
export function inferLegacyEndTime(slot: PresentationSlot, slots: PresentationSlot[]): string | null {
  if (!slot.queue_no) return null;
  const peers = slots.filter(other => other.exam_type === slot.exam_type && other.slot_date === slot.slot_date &&
    other.section === slot.section && other.queue_no != null).sort((a, b) => a.queue_no! - b.queue_no!);
  const intervals = peers.slice(1).map((next, index) =>
    (toMinutes(next.slot_time) - toMinutes(peers[index].slot_time)) / (next.queue_no! - peers[index].queue_no!));
  const duration = intervals[0];
  if (!intervals.length || ![10, 15, 20, 25, 30].includes(duration) || !intervals.every(value => value === duration)) return null;
  const end = toMinutes(slot.slot_time) + duration;
  const window = slot.section ? SECTION_WINDOWS[slot.section] : undefined;
  if (end >= 24 * 60 || (window && end > toMinutes(window.end))) return null;
  return toTime(end);
}

export const queueLabel = (slot: PresentationSlot) => slot.queue_no != null ? `QUEUE #${slot.queue_no}` : 'QUEUE —';
export const slotTimeRange = (slot: PresentationSlot) =>
  `${slot.slot_time.slice(0, 5)} – ${slot.slot_end_time ? slot.slot_end_time.slice(0, 5) : 'End time not set'}`;
