CREATE TABLE public.student_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  category TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX student_notes_student_category_idx ON public.student_notes(student_id, category);

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view student notes" ON public.student_notes FOR SELECT USING (true);
CREATE POLICY "Anyone can create student notes" ON public.student_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update student notes" ON public.student_notes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete student notes" ON public.student_notes FOR DELETE USING (true);

CREATE TRIGGER update_student_notes_updated_at
BEFORE UPDATE ON public.student_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();