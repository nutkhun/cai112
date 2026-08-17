import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { SECTIONS } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Calendar, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';

interface StudentRow {
  id: string;
  name: string;
  student_id: string;
  section: string;
  index_number: number | null;
}

interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
}

export const TeacherAttendanceTab = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = async () => {
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('attendance').select('*'),
    ]);
    if (s) setStudents(s as StudentRow[]);
    if (a) setAttendance(a as AttendanceRow[]);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('attendance-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const presentToday = new Set(attendance.filter(a => a.date === date).map(a => a.student_id));
  const totalFor = (studentId: string) => attendance.filter(a => a.student_id === studentId).length;

  const toggle = async (student: StudentRow) => {
    setSaving(student.id);
    const existing = attendance.find(a => a.student_id === student.id && a.date === date);
    if (existing) {
      const { error } = await supabase.from('attendance').delete().eq('id', existing.id);
      if (error) toast.error('Failed to remove attendance');
      else setAttendance(prev => prev.filter(a => a.id !== existing.id));
    } else {
      const row = { id: crypto.randomUUID(), student_id: student.id, date };
      const { error } = await supabase.from('attendance').insert(row);
      if (error) toast.error('Failed to mark attendance');
      else setAttendance(prev => [...prev, row as AttendanceRow]);
    }
    setSaving(null);
  };

  const filtered = students.filter(s => {
    if (sectionFilter !== 'all' && s.section !== sectionFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.student_id.includes(q);
  });

  const presentCount = filtered.filter(s => presentToday.has(s.id)).length;

  return (
    <div className="space-y-4">
      <Card className="shadow-soft border-0 sticky top-[65px] z-20 bg-card backdrop-blur-md">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Punch in a name or student ID..."
                className="h-11 pl-10"
              />
            </div>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="h-11 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {SECTIONS.map(sec => (
                  <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 w-[160px]"
              />
            </div>
            {(search || sectionFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSectionFilter('all'); }} className="gap-1">
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserCheck className="h-4 w-4 text-success" />
            <span className="font-medium text-foreground">{presentCount}</span> of {filtered.length} shown marked present on {format(new Date(date + 'T00:00:00'), 'EEE, MMM d yyyy')}
            <span>· tick a name to mark attendance; tick again to undo</span>
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-soft border-0">
        <CardContent className="p-2">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No students match</p>
          ) : (
            <div className="divide-y">
              {filtered.map(s => {
                const present = presentToday.has(s.id);
                const total = totalFor(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 ${present ? 'bg-success/5' : ''}`}
                  >
                    <Checkbox
                      checked={present}
                      disabled={saving === s.id}
                      onCheckedChange={() => toggle(s)}
                    />
                    <span className="w-8 text-center text-xs text-muted-foreground">{s.index_number ?? '–'}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{s.student_id}</span>
                    <Badge variant="secondary" className="text-[10px]">{s.section}</Badge>
                    <Badge className={`border-0 text-[10px] font-semibold ${total > 0 ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      +{total}
                    </Badge>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
