-- Remove the foreign key constraint on group_id to allow individual student assignments
-- The group_id column is used as a folder identifier, not always a real group reference

ALTER TABLE public.assignments DROP CONSTRAINT assignments_group_id_fkey;

-- Add a comment explaining the column usage
COMMENT ON COLUMN public.assignments.group_id IS 'Used as folder identifier - can be group UUID or individual-{student_id} format';