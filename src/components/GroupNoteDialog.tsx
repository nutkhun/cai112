import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2,
  Lock,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Highlighter,
  Eraser,
} from 'lucide-react';

interface GroupNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  groupName: string;
  category?: 'general' | 'midterm' | 'final';
  categoryLabel?: string;
  studentId?: string | null;
  studentName?: string;
}

const TEXT_COLORS = [
  { label: 'Default', value: 'inherit' },
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Pink', value: '#db2777' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: 'transparent' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
];

const FONT_SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Medium', value: '4' },
  { label: 'Large', value: '5' },
  { label: 'X-Large', value: '6' },
  { label: 'XX-Large', value: '7' },
];

export const GroupNoteDialog = ({ open, onOpenChange, groupId, groupName, category = 'general', categoryLabel, studentId, studentName }: GroupNoteDialogProps) => {
  const isStudentMode = !groupId && !!studentId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialHtml, setInitialHtml] = useState<string>('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || (!groupId && !studentId)) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setInitialHtml('');
      const query = isStudentMode
        ? supabase.from('student_notes').select('note').eq('student_id', studentId!).eq('category', category).maybeSingle()
        : supabase.from('group_notes').select('note').eq('group_id', groupId!).eq('category', category).maybeSingle();
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        toast.error('Failed to load note');
        setInitialHtml('');
      } else {
        const value = data?.note || '';
        // Backward-compat: if the stored note is plain text, wrap newlines as <br>
        const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);
        const html = looksLikeHtml ? value : value.replace(/\n/g, '<br>');
        setInitialHtml(html);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [open, groupId, studentId, category, isStudentMode]);

  // Inject loaded HTML into the contentEditable once it's mounted
  useEffect(() => {
    if (!loading && editorRef.current) {
      editorRef.current.innerHTML = initialHtml;
    }
  }, [loading, initialHtml]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const handleSave = async () => {
    if (!groupId && !studentId) return;
    const note = editorRef.current?.innerHTML ?? '';
    setSaving(true);
    const { error } = isStudentMode
      ? await supabase.from('student_notes').upsert({ student_id: studentId!, note, category }, { onConflict: 'student_id,category' })
      : await supabase.from('group_notes').upsert({ group_id: groupId!, note, category }, { onConflict: 'group_id,category' });
    setSaving(false);
    if (error) {
      toast.error('Failed to save note');
      return;
    }
    toast.success('Note saved');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {categoryLabel ? `${categoryLabel} Note` : 'Note'} — {isStudentMode ? studentName : groupName}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <Lock className="w-3 h-3" />
            Private to teacher. Students cannot see this.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1.5">
              <Toggle size="sm" aria-label="Bold" onPressedChange={() => exec('bold')}>
                <Bold className="h-4 w-4" />
              </Toggle>
              <Toggle size="sm" aria-label="Italic" onPressedChange={() => exec('italic')}>
                <Italic className="h-4 w-4" />
              </Toggle>
              <Toggle size="sm" aria-label="Underline" onPressedChange={() => exec('underline')}>
                <Underline className="h-4 w-4" />
              </Toggle>
              <Toggle size="sm" aria-label="Strikethrough" onPressedChange={() => exec('strikeThrough')}>
                <Strikethrough className="h-4 w-4" />
              </Toggle>

              <div className="mx-1 h-6 w-px bg-border" />

              <Select onValueChange={(v) => exec('fontSize', v)}>
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select onValueChange={(v) => exec('foreColor', v)}>
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="Text color" />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm border"
                          style={{ background: c.value === 'inherit' ? 'transparent' : c.value }}
                        />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select onValueChange={(v) => exec('hiliteColor', v)}>
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue placeholder={
                    <span className="flex items-center gap-1.5">
                      <Highlighter className="h-3.5 w-3.5" /> Highlight
                    </span>
                  } />
                </SelectTrigger>
                <SelectContent>
                  {HIGHLIGHT_COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm border"
                          style={{ background: c.value }}
                        />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mx-1 h-6 w-px bg-border" />

              <Toggle size="sm" aria-label="Bulleted list" onPressedChange={() => exec('insertUnorderedList')}>
                <List className="h-4 w-4" />
              </Toggle>
              <Toggle size="sm" aria-label="Numbered list" onPressedChange={() => exec('insertOrderedList')}>
                <ListOrdered className="h-4 w-4" />
              </Toggle>

              <div className="mx-1 h-6 w-px bg-border" />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => exec('removeFormat')}
                title="Clear formatting"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </div>

            {/* Editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Write notes about this group (progress, behavior, follow-ups…)"
              className="group-note-editor min-h-[200px] max-h-[420px] overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              onPaste={(e) => {
                // Paste as plain text to avoid messy external HTML
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
              }}
            />
            <style>{`
              .group-note-editor:empty:before {
                content: attr(data-placeholder);
                color: hsl(var(--muted-foreground));
                pointer-events: none;
              }
              .group-note-editor ul { list-style: disc; padding-left: 1.5rem; }
              .group-note-editor ol { list-style: decimal; padding-left: 1.5rem; }
            `}</style>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};