CREATE TABLE public.group_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.group_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group notes"
ON public.group_notes FOR SELECT USING (true);

CREATE POLICY "Anyone can create group notes"
ON public.group_notes FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update group notes"
ON public.group_notes FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete group notes"
ON public.group_notes FOR DELETE USING (true);

CREATE TRIGGER update_group_notes_updated_at
BEFORE UPDATE ON public.group_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_group_notes_group_id ON public.group_notes(group_id);