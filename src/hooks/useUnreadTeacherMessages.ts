import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/backend/client';
import { Student } from '@/types';

/**
 * Unread teacher-message count for the signed-in student.
 *
 * Powers the badge on the mobile "Inbox" tab. Mirrors the inbox filter used by
 * MessageCenter: private messages addressed to this student, plus announcements
 * sent to everyone or to this student's section.
 */
export function useUnreadTeacherMessages(student: Student | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!student) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const fetchUnread = async () => {
      const { data, error } = await supabase
        .from('teacher_messages')
        .select('id, message_type, recipient_student_id, recipient_section')
        .eq('sender_type', 'teacher')
        .eq('is_read', false)
        .or(
          `recipient_student_id.eq.${student.id},recipient_section.eq.${student.section},recipient_section.is.null`,
        );

      if (cancelled || error || !data) return;

      const relevant = data.filter(
        (msg) =>
          msg.recipient_student_id === student.id ||
          (msg.message_type === 'announcement' &&
            (!msg.recipient_section || msg.recipient_section === student.section)),
      );

      setUnreadCount(relevant.length);
    };

    fetchUnread();

    const channel = supabase
      .channel(`unread-teacher-messages-${student.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_messages' },
        () => fetchUnread(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [student]);

  return unreadCount;
}
