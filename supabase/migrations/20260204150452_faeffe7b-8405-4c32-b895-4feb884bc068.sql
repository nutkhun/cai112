-- Enable realtime for assignments table so teachers see uploads instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;