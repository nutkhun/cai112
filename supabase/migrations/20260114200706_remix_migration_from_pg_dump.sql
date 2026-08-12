CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: delete_empty_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_empty_group() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  member_count INTEGER;
BEGIN
  -- Only proceed if the old group_id was not null (student was in a group)
  IF OLD.group_id IS NOT NULL THEN
    -- Count remaining members in the old group
    SELECT COUNT(*) INTO member_count
    FROM public.students
    WHERE group_id = OLD.group_id;
    
    -- If no members remain, delete the group
    IF member_count = 0 THEN
      DELETE FROM public.groups WHERE id = OLD.group_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: absence_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absence_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    absence_date date NOT NULL,
    reason text NOT NULL,
    document_path text NOT NULL,
    document_name text NOT NULL,
    document_size integer,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.absence_requests REPLICA IDENTITY FULL;


--
-- Name: assignment_due_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_due_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_name text NOT NULL,
    assignment_type text DEFAULT 'individual'::text NOT NULL,
    due_date date NOT NULL,
    section text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size integer,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assignment_type text DEFAULT 'group'::text NOT NULL,
    CONSTRAINT assignments_assignment_type_check CHECK ((assignment_type = ANY (ARRAY['group'::text, 'individual'::text])))
);


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    assignment_name text NOT NULL,
    assignment_type text NOT NULL,
    score numeric(5,2) DEFAULT 0 NOT NULL,
    max_score numeric(5,2) NOT NULL,
    graded_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grades_assignment_type_check CHECK ((assignment_type = ANY (ARRAY['individual'::text, 'group'::text])))
);


--
-- Name: group_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    inviter_id uuid NOT NULL,
    invitee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: group_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_path text,
    file_name text,
    file_type text,
    file_size integer,
    reply_to_id uuid
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    leader_id uuid
);


--
-- Name: join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    group_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size integer,
    section text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    student_id text NOT NULL,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    section text DEFAULT '358A'::text NOT NULL,
    pin text,
    index_number integer,
    CONSTRAINT students_section_check CHECK ((section = ANY (ARRAY['358A'::text, '358B'::text, '358C'::text, '358D'::text])))
);


--
-- Name: teacher_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_type text NOT NULL,
    sender_student_id uuid,
    recipient_student_id uuid,
    recipient_section text,
    message_type text NOT NULL,
    subject text,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_id uuid,
    CONSTRAINT teacher_messages_message_type_check CHECK ((message_type = ANY (ARRAY['announcement'::text, 'private'::text]))),
    CONSTRAINT teacher_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['teacher'::text, 'student'::text])))
);


--
-- Name: absence_requests absence_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_requests
    ADD CONSTRAINT absence_requests_pkey PRIMARY KEY (id);


--
-- Name: assignment_due_dates assignment_due_dates_assignment_name_section_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_due_dates
    ADD CONSTRAINT assignment_due_dates_assignment_name_section_key UNIQUE (assignment_name, section);


--
-- Name: assignment_due_dates assignment_due_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_due_dates
    ADD CONSTRAINT assignment_due_dates_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- Name: grades grades_student_id_assignment_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_assignment_name_key UNIQUE (student_id, assignment_name);


--
-- Name: group_invitations group_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_pkey PRIMARY KEY (id);


--
-- Name: group_messages group_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: join_requests join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_pkey PRIMARY KEY (id);


--
-- Name: join_requests join_requests_student_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_student_id_group_id_key UNIQUE (student_id, group_id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_id_key UNIQUE (student_id);


--
-- Name: students students_student_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_student_id_unique UNIQUE (student_id);


--
-- Name: teacher_messages teacher_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_messages
    ADD CONSTRAINT teacher_messages_pkey PRIMARY KEY (id);


--
-- Name: group_invitations unique_pending_invitation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT unique_pending_invitation UNIQUE (group_id, invitee_id);


--
-- Name: idx_group_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_messages_created_at ON public.group_messages USING btree (created_at);


--
-- Name: idx_group_messages_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_messages_group_id ON public.group_messages USING btree (group_id);


--
-- Name: students check_empty_group_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_empty_group_on_delete AFTER DELETE ON public.students FOR EACH ROW EXECUTE FUNCTION public.delete_empty_group();


--
-- Name: students check_empty_group_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_empty_group_on_update AFTER UPDATE OF group_id ON public.students FOR EACH ROW WHEN ((old.group_id IS DISTINCT FROM new.group_id)) EXECUTE FUNCTION public.delete_empty_group();


--
-- Name: absence_requests update_absence_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_absence_requests_updated_at BEFORE UPDATE ON public.absence_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: assignment_due_dates update_assignment_due_dates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_assignment_due_dates_updated_at BEFORE UPDATE ON public.assignment_due_dates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: grades update_grades_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_grades_updated_at BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: materials update_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: absence_requests absence_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_requests
    ADD CONSTRAINT absence_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.students(id);


--
-- Name: grades grades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: group_invitations group_invitations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_invitations group_invitations_invitee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: group_invitations group_invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.group_messages(id) ON DELETE SET NULL;


--
-- Name: group_messages group_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: groups groups_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: join_requests join_requests_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: join_requests join_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: teacher_messages teacher_messages_recipient_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_messages
    ADD CONSTRAINT teacher_messages_recipient_student_id_fkey FOREIGN KEY (recipient_student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: teacher_messages teacher_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_messages
    ADD CONSTRAINT teacher_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.teacher_messages(id) ON DELETE SET NULL;


--
-- Name: teacher_messages teacher_messages_sender_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_messages
    ADD CONSTRAINT teacher_messages_sender_student_id_fkey FOREIGN KEY (sender_student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: absence_requests Anyone can create absence requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create absence requests" ON public.absence_requests FOR INSERT WITH CHECK (true);


--
-- Name: assignment_due_dates Anyone can create due dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create due dates" ON public.assignment_due_dates FOR INSERT WITH CHECK (true);


--
-- Name: grades Anyone can create grades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create grades" ON public.grades FOR INSERT WITH CHECK (true);


--
-- Name: groups Anyone can create groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create groups" ON public.groups FOR INSERT WITH CHECK (true);


--
-- Name: group_invitations Anyone can create invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create invitations" ON public.group_invitations FOR INSERT WITH CHECK (true);


--
-- Name: join_requests Anyone can create join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create join requests" ON public.join_requests FOR INSERT WITH CHECK (true);


--
-- Name: materials Anyone can create materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create materials" ON public.materials FOR INSERT WITH CHECK (true);


--
-- Name: teacher_messages Anyone can create messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create messages" ON public.teacher_messages FOR INSERT WITH CHECK (true);


--
-- Name: absence_requests Anyone can delete absence requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete absence requests" ON public.absence_requests FOR DELETE USING (true);


--
-- Name: assignments Anyone can delete assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete assignments" ON public.assignments FOR DELETE USING (true);


--
-- Name: assignment_due_dates Anyone can delete due dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete due dates" ON public.assignment_due_dates FOR DELETE USING (true);


--
-- Name: grades Anyone can delete grades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete grades" ON public.grades FOR DELETE USING (true);


--
-- Name: groups Anyone can delete groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete groups" ON public.groups FOR DELETE USING (true);


--
-- Name: group_invitations Anyone can delete invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete invitations" ON public.group_invitations FOR DELETE USING (true);


--
-- Name: join_requests Anyone can delete join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete join requests" ON public.join_requests FOR DELETE USING (true);


--
-- Name: materials Anyone can delete materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete materials" ON public.materials FOR DELETE USING (true);


--
-- Name: teacher_messages Anyone can delete messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete messages" ON public.teacher_messages FOR DELETE USING (true);


--
-- Name: students Anyone can delete students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete students" ON public.students FOR DELETE USING (true);


--
-- Name: group_messages Anyone can delete their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete their own messages" ON public.group_messages FOR DELETE USING (true);


--
-- Name: students Anyone can register as student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can register as student" ON public.students FOR INSERT WITH CHECK (true);


--
-- Name: group_messages Anyone can send group messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can send group messages" ON public.group_messages FOR INSERT WITH CHECK (true);


--
-- Name: absence_requests Anyone can update absence requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update absence requests" ON public.absence_requests FOR UPDATE USING (true);


--
-- Name: assignment_due_dates Anyone can update due dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update due dates" ON public.assignment_due_dates FOR UPDATE USING (true);


--
-- Name: grades Anyone can update grades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update grades" ON public.grades FOR UPDATE USING (true);


--
-- Name: group_invitations Anyone can update invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update invitations" ON public.group_invitations FOR UPDATE USING (true);


--
-- Name: join_requests Anyone can update join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update join requests" ON public.join_requests FOR UPDATE USING (true);


--
-- Name: materials Anyone can update materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update materials" ON public.materials FOR UPDATE USING (true);


--
-- Name: teacher_messages Anyone can update messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update messages" ON public.teacher_messages FOR UPDATE USING (true);


--
-- Name: students Anyone can update students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update students" ON public.students FOR UPDATE USING (true);


--
-- Name: assignments Anyone can upload assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can upload assignments" ON public.assignments FOR INSERT WITH CHECK (true);


--
-- Name: absence_requests Anyone can view absence requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view absence requests" ON public.absence_requests FOR SELECT USING (true);


--
-- Name: assignments Anyone can view assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view assignments" ON public.assignments FOR SELECT USING (true);


--
-- Name: assignment_due_dates Anyone can view due dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view due dates" ON public.assignment_due_dates FOR SELECT USING (true);


--
-- Name: grades Anyone can view grades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view grades" ON public.grades FOR SELECT USING (true);


--
-- Name: group_messages Anyone can view group messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view group messages" ON public.group_messages FOR SELECT USING (true);


--
-- Name: groups Anyone can view groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view groups" ON public.groups FOR SELECT USING (true);


--
-- Name: group_invitations Anyone can view invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view invitations" ON public.group_invitations FOR SELECT USING (true);


--
-- Name: join_requests Anyone can view join requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view join requests" ON public.join_requests FOR SELECT USING (true);


--
-- Name: materials Anyone can view materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view materials" ON public.materials FOR SELECT USING (true);


--
-- Name: teacher_messages Anyone can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view messages" ON public.teacher_messages FOR SELECT USING (true);


--
-- Name: students Anyone can view students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view students" ON public.students FOR SELECT USING (true);


--
-- Name: groups Group members can update their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can update their group" ON public.groups FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: absence_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: assignment_due_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignment_due_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: grades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

--
-- Name: group_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: group_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: join_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_messages ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;