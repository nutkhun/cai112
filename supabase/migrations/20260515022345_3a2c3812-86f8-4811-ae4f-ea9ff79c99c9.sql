
ALTER TABLE public.group_notes ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE public.group_notes DROP CONSTRAINT IF EXISTS group_notes_group_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS group_notes_group_id_category_key ON public.group_notes(group_id, category);
