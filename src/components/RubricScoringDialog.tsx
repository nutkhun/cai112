import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';

const RUBRIC_CRITERIA = [
  { name: 'Depth of research and understanding of the topic', weight: 30 },
  { name: 'Use of data, statistics, and case studies', weight: 20 },
  { name: 'Analysis of industry impact', weight: 20 },
  { name: 'Clarity and organization of presentation', weight: 15 },
  { name: 'Slide design and visual communication', weight: 10 },
  { name: 'Engagement with the audience', weight: 5 },
];

interface RubricScoringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  assignmentType: 'Midterm Presentation' | 'Final Project';
  maxScore: number; // 30 for midterm, 40 for final
  onSave: (calculatedScore: number) => void;
}

export const RubricScoringDialog = ({
  open,
  onOpenChange,
  studentId,
  studentName,
  assignmentType,
  maxScore,
  onSave,
}: RubricScoringDialogProps) => {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [noteGroupId, setNoteGroupId] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const storageKey = `rubric:${studentId}:${assignmentType}`;
  // Same storage the grading table's sticky-note buttons use, so the note is
  // shared: group note for grouped students, personal note otherwise.
  const noteCategory = assignmentType === 'Midterm Presentation' ? 'midterm' : 'final';

  const saveNote = async (value: string) => {
    setNoteSaving(true);
    const trimmed = value.trim();
    const { error } = noteGroupId
      ? await supabase.from('group_notes').upsert(
          { group_id: noteGroupId, note: trimmed, category: noteCategory },
          { onConflict: 'group_id,category' }
        )
      : await supabase.from('student_notes').upsert(
          { student_id: studentId, note: trimmed, category: noteCategory },
          { onConflict: 'student_id,category' }
        );
    setNoteSaving(false);
    if (error) toast.error('Failed to save the note');
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // Load from DB first; fall back to localStorage cache
      const { data, error } = await supabase
        .from('rubric_scores')
        .select('scores')
        .eq('student_id', studentId)
        .eq('assignment_type', assignmentType)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.scores) {
        const dbScores = data.scores as Record<string, string>;
        setScores(dbScores);
        try { localStorage.setItem(storageKey, JSON.stringify(dbScores)); } catch {}
      } else {
        // No DB row — try to migrate from localStorage cache (past inputs)
        let cached: Record<string, string> = {};
        try {
          const saved = localStorage.getItem(storageKey);
          cached = saved ? JSON.parse(saved) : {};
        } catch {
          cached = {};
        }
        setScores(cached);
        // Persist cached values to DB so they're available across devices
        if (Object.keys(cached).length > 0) {
          await supabase
            .from('rubric_scores')
            .upsert(
              { student_id: studentId, assignment_type: assignmentType, scores: cached },
              { onConflict: 'student_id,assignment_type' }
            );
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, studentId, assignmentType, storageKey]);

  // Load the existing presentation note (group note when grouped).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: student } = await supabase
        .from('students')
        .select('group_id')
        .eq('id', studentId)
        .maybeSingle();
      if (cancelled) return;
      const gid = student?.group_id || null;
      setNoteGroupId(gid);
      const { data } = gid
        ? await supabase.from('group_notes').select('note').eq('group_id', gid).eq('category', noteCategory).maybeSingle()
        : await supabase.from('student_notes').select('note').eq('student_id', studentId).eq('category', noteCategory).maybeSingle();
      if (!cancelled) setNote(data?.note || '');
    })();
    return () => { cancelled = true; };
  }, [open, studentId, noteCategory]);

  const handleScoreChange = (criteriaName: string, value: string) => {
    if (value !== '') {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 100) return;
      if (!isNaN(num) && num < 0) return;
    }
    setScores(prev => ({ ...prev, [criteriaName]: value }));
  };

  const weightedTotal = RUBRIC_CRITERIA.reduce((sum, c) => {
    const score = parseFloat(scores[c.name] || '0') || 0;
    return sum + (score * c.weight) / 100;
  }, 0);

  const rawPercentage = weightedTotal; // already out of 100 due to weights summing to 100
  const calculatedScore = Math.round((rawPercentage / 100) * maxScore);

  const allFilled = RUBRIC_CRITERIA.every(c => scores[c.name] && scores[c.name] !== '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {assignmentType === 'Midterm Presentation' ? 'Midterm' : 'Final'} Rubric — {studentName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {RUBRIC_CRITERIA.map((criteria) => (
            <div key={criteria.name} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm leading-tight block">{criteria.name}</Label>
                <span className="text-xs text-muted-foreground">Weight: {criteria.weight}%</span>
              </div>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={scores[criteria.name] || ''}
                onChange={(e) => handleScoreChange(criteria.name, e.target.value)}
                className="w-20 h-8 text-center text-sm"
                placeholder="0-100"
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <Label className="flex items-center gap-1.5 text-sm">
            <StickyNote className="h-4 w-4 text-primary" />
            Presentation notes {noteGroupId ? '(shared for the whole group)' : ''}
            {noteSaving && <span className="text-xs text-muted-foreground">saving...</span>}
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => saveNote(note)}
            rows={3}
            placeholder="Jot observations while they present - saved automatically."
            className="resize-none text-sm"
          />
        </div>

        <div className="border-t pt-3 mt-2 space-y-1">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Weighted Total:</span>
            <span className="font-medium">{weightedTotal.toFixed(1)} / 100</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-sm">
              Converted Score ({weightedTotal.toFixed(1)}/100 × {maxScore}):
            </span>
            <Badge variant="default" className="font-mono text-base">
              {calculatedScore} / {maxScore}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              setSaving(true);
              await saveNote(note);
              try { localStorage.setItem(storageKey, JSON.stringify(scores)); } catch {}
              // Save rubric detail for every member of the group so all members stay in sync
              const { data: student } = await supabase
                .from('students')
                .select('group_id')
                .eq('id', studentId)
                .maybeSingle();
              let targetIds: string[] = [studentId];
              if (student?.group_id) {
                const { data: members } = await supabase
                  .from('students')
                  .select('id')
                  .eq('group_id', student.group_id);
                if (members && members.length > 0) {
                  targetIds = members.map((m: { id: string }) => m.id);
                }
              }
              const rows = targetIds.map((id) => ({
                student_id: id,
                assignment_type: assignmentType,
                scores,
              }));
              const { error } = await supabase
                .from('rubric_scores')
                .upsert(rows, { onConflict: 'student_id,assignment_type' });
              setSaving(false);
              if (error) {
                toast.error('Failed to save rubric scores: ' + error.message);
                return;
              }
              onSave(calculatedScore);
              onOpenChange(false);
            }}
            disabled={!allFilled || saving}
          >
            {saving ? 'Saving...' : 'Save Score'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
