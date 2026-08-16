import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { AlertTriangle, Calendar, X, Bell } from 'lucide-react';
import { format, differenceInDays, parseISO, startOfDay } from 'date-fns';

interface DueDate {
  id: string;
  assignment_name: string;
  assignment_type: string;
  due_date: string;
  section: string | null;
}

interface Assignment {
  id: string;
  group_id: string;
  file_name: string;
  assignment_type: string;
  uploaded_by: string;
}

export const DueDateNotifications = () => {
  const { currentStudent } = useGroups();
  const [notifications, setNotifications] = useState<{
    assignment: DueDate;
    daysUntilDue: number;
  }[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentStudent) return;

    const checkNotifications = async () => {
      // Fetch due dates for the student's section or all sections
      const { data: dueDates, error: dueDatesError } = await supabase
        .from('assignment_due_dates')
        .select('*')
        .or(`section.is.null,section.eq.${currentStudent.section}`);

      if (dueDatesError) {
        console.error('Error fetching due dates:', dueDatesError);
        setLoading(false);
        return;
      }

      // Fetch student's submitted assignments
      const { data: studentAssignments, error: assignmentsError } = await supabase
        .from('assignments')
        .select('*')
        .eq('uploaded_by', currentStudent.id);

      if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError);
      }

      // Fetch group assignments if student is in a group
      let groupAssignments: Assignment[] = [];
      if (currentStudent.groupId) {
        const { data: groupData } = await supabase
          .from('assignments')
          .select('*')
          .eq('group_id', currentStudent.groupId)
          .eq('assignment_type', 'group');

        groupAssignments = (groupData || []) as Assignment[];
      }

      const allSubmissions = [...(studentAssignments || []) as Assignment[], ...groupAssignments];

      // Warn from 3 days before the deadline through overdue, until submitted
      const today = startOfDay(new Date());
      const upcomingNotifications: { assignment: DueDate; daysUntilDue: number }[] = [];

      (dueDates || []).forEach((dueDate: DueDate) => {
        const dueDateParsed = startOfDay(parseISO(dueDate.due_date));
        const daysUntilDue = differenceInDays(dueDateParsed, today);

        if (daysUntilDue <= 3) {
          // Check if assignment is submitted
          const isSubmitted = allSubmissions.some((submission) => {
            // Handle Assignment 0, 1, 2 (individual)
            if (dueDate.assignment_name.startsWith('Assignment')) {
              return submission.file_name.startsWith(dueDate.assignment_name);
            }
            // Handle group assignments
            return submission.file_name.startsWith(dueDate.assignment_name);
          });

          // For group assignments, student must be in a group
          if (dueDate.assignment_type === 'group' && !currentStudent.groupId) {
            // Student not in group, show notification that they need a group
            upcomingNotifications.push({
              assignment: dueDate,
              daysUntilDue,
            });
          } else if (!isSubmitted) {
            upcomingNotifications.push({
              assignment: dueDate,
              daysUntilDue,
            });
          }
        }
      });

      setNotifications(upcomingNotifications);
      setLoading(false);
    };

    checkNotifications();

    // Subscribe to due dates changes
    const channel = supabase
      .channel('due-dates-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignment_due_dates',
        },
        () => {
          checkNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStudent]);

  const handleDismiss = (assignmentId: string) => {
    setDismissed((prev) => new Set([...prev, assignmentId]));
  };

  const visibleNotifications = notifications.filter(
    (n) => !dismissed.has(n.assignment.id)
  );

  if (loading || visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-4">
      {visibleNotifications.map(({ assignment, daysUntilDue }) => (
        <Alert
          key={assignment.id}
          variant="destructive"
          className={daysUntilDue < 0
            ? 'border-destructive bg-destructive/10'
            : 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-100'}
        >
          <Bell className={`h-4 w-4 ${daysUntilDue < 0 ? 'text-destructive' : 'text-amber-600'}`} />
          <AlertTitle className="flex items-center gap-2 font-display">
            <span>{daysUntilDue < 0 ? 'Assignment Overdue' : 'Assignment Due Reminder'}</span>
            <Badge
              variant={daysUntilDue <= 0 ? 'destructive' : 'default'}
              className={daysUntilDue <= 0 ? '' : 'bg-amber-500'}
            >
              {daysUntilDue < 0
                ? `${-daysUntilDue} day${daysUntilDue === -1 ? '' : 's'} late`
                : daysUntilDue === 0
                  ? 'Due Today!'
                  : daysUntilDue === 1
                    ? 'Due Tomorrow'
                    : `Due in ${daysUntilDue} days`}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">{assignment.assignment_name}</p>
                <p className="text-sm flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Due: {format(parseISO(assignment.due_date), 'EEEE, MMMM d, yyyy')}
                </p>
                <p className={`text-sm flex items-center gap-1.5 ${daysUntilDue < 0 ? 'text-destructive' : ''}`}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {daysUntilDue < 0
                    ? 'Your score is being deducted proportionally to how late you are - submit now to limit the loss.'
                    : 'Late submissions lose marks proportionally - submit before the deadline to keep your full score.'}
                </p>
                {assignment.assignment_type === 'group' && !currentStudent?.groupId && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    You need to join or create a group to submit this assignment
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDismiss(assignment.id)}
                className="shrink-0 h-10 w-10 p-0 md:h-8 md:w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
