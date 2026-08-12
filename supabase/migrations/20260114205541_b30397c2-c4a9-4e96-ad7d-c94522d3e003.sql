-- Drop the old section check constraint
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_section_check;

-- Add new check constraint allowing only 257A
ALTER TABLE public.students ADD CONSTRAINT students_section_check CHECK (section = '257A');

-- Also update the default value for section
ALTER TABLE public.students ALTER COLUMN section SET DEFAULT '257A';