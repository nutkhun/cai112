-- Change group_id from uuid to text to allow flexible identifiers like 'individual-{student_id}'
ALTER TABLE public.assignments ALTER COLUMN group_id TYPE text USING group_id::text;