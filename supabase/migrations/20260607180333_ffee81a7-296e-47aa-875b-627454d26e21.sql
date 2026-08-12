REVOKE EXECUTE ON FUNCTION public.delete_empty_group() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_empty_group() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_empty_group() FROM authenticated;

ALTER PUBLICATION supabase_realtime DROP TABLE public.students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students
  (id, student_id, name, section, group_id, index_number, created_at);