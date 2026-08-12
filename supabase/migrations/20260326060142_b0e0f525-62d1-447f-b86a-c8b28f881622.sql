-- Fix existing individual assignments that were incorrectly stored with group_id instead of individual folder
UPDATE public.assignments 
SET group_id = 'individual-' || uploaded_by::text 
WHERE assignment_type = 'individual' 
AND group_id NOT LIKE 'individual-%';