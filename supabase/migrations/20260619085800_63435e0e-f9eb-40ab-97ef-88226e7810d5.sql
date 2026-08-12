CREATE TABLE public.rubric_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, assignment_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_scores TO anon, authenticated;
GRANT ALL ON public.rubric_scores TO service_role;

ALTER TABLE public.rubric_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rubric scores" ON public.rubric_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can create rubric scores" ON public.rubric_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rubric scores" ON public.rubric_scores FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete rubric scores" ON public.rubric_scores FOR DELETE USING (true);

CREATE TRIGGER update_rubric_scores_updated_at
  BEFORE UPDATE ON public.rubric_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();