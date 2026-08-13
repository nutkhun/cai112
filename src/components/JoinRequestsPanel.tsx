import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { UserPlus, Check, X, Clock, Bell } from 'lucide-react';
import { toast } from 'sonner';

interface JoinRequest {
  id: string;
  student_id: string;
  group_id: string;
  status: string;
  created_at: string;
}

interface JoinRequestsPanelProps {
  groupId: string;
}

export const JoinRequestsPanel = ({ groupId }: JoinRequestsPanelProps) => {
  const { getStudentById, addMemberToGroup, currentStudent, getGroupById } = useGroups();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [previousRequestIds, setPreviousRequestIds] = useState<Set<string>>(new Set());

  const group = getGroupById(groupId);
  const isLeader = group?.leaderId === currentStudent?.id;

  const fetchRequests = async (showNotification = false) => {
    const { data, error } = await supabase
      .from('join_requests')
      .select('*')
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Check for new requests and show notification
      if (showNotification && data.length > 0) {
        const newRequests = data.filter(r => !previousRequestIds.has(r.id));
        newRequests.forEach(request => {
          const student = getStudentById(request.student_id);
          if (student) {
            toast.info(`${student.name} wants to join your group!`, {
              icon: <UserPlus className="w-4 h-4" />,
            });
          }
        });
      }
      
      // Update previous IDs for next comparison
      setPreviousRequestIds(new Set(data.map(r => r.id)));
      setRequests(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests(false); // Initial fetch without notification

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`join-requests-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'join_requests',
          filter: `group_id=eq.${groupId}`
        },
        (payload) => {
          // Show notification for new request
          const student = getStudentById(payload.new.student_id as string);
          if (student && payload.new.status === 'pending') {
            toast.info(`${student.name} wants to join your group!`, {
              icon: <UserPlus className="w-4 h-4" />,
            });
          }
          fetchRequests(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'join_requests',
          filter: `group_id=eq.${groupId}`
        },
        () => {
          fetchRequests(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'join_requests',
          filter: `group_id=eq.${groupId}`
        },
        () => {
          fetchRequests(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, getStudentById]);

  const handleApprove = async (request: JoinRequest) => {
    try {
      // Check if group is full
      const group = getGroupById(groupId);
      if (group && group.members.length >= 4) {
        toast.error('Group is already full');
        return;
      }

      // Add member to group
      const success = await addMemberToGroup(request.student_id, groupId);
      
      if (success) {
        // Update request status
        await supabase
          .from('join_requests')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', request.id);

        toast.success('Member approved and added to group!');
        fetchRequests();
      } else {
        toast.error('Failed to add member');
      }
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('Failed to approve request');
    }
  };

  const handleReject = async (request: JoinRequest) => {
    try {
      await supabase
        .from('join_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', request.id);

      toast.success('Request rejected');
      fetchRequests();
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('Failed to reject request');
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <Card className="border-accent/30 bg-accent/5 mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" />
            Join Requests
          </CardTitle>
          <Badge variant="secondary" className="bg-accent/20 text-accent">
            {requests.length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((request) => {
          const student = getStudentById(request.student_id);
          if (!student) return null;

          return (
            <div
              key={request.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs bg-accent/10 text-accent">
                  {getInitials(student.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{student.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>ID: {student.studentId}</span>
                  <span>•</span>
                  <Clock className="w-3 h-3" />
                  <span>{formatTimeAgo(request.created_at)}</span>
                </div>
              </div>
              {isLeader ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 md:h-8 md:w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleReject(request)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 md:h-8 md:w-8 text-success hover:text-success hover:bg-success/10"
                    onClick={() => handleApprove(request)}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Awaiting leader
                </Badge>
              )}
            </div>
          );
        })}
        {!isLeader && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Only the group leader can approve requests
          </p>
        )}
      </CardContent>
    </Card>
  );
};
