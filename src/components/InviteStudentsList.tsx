import { useState, useEffect } from 'react';
import { useGroups } from '@/context/GroupContext';
import { supabase } from '@/integrations/backend/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/types';

interface InviteStudentsListProps {
  groupId: string;
  maxMembers?: number;
  currentMemberCount: number;
}

interface Invitation {
  id: string;
  invitee_id: string;
  status: string;
}

interface JoinRequest {
  id: string;
  student_id: string;
}

export const InviteStudentsList = ({ 
  groupId, 
  maxMembers = 4, 
  currentMemberCount 
}: InviteStudentsListProps) => {
  const [search, setSearch] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const { currentStudent, getAvailableStudents } = useGroups();

  const canInviteMore = currentMemberCount < maxMembers;

  // Fetch pending invitations and join requests for this group
  useEffect(() => {
    const fetchInvitations = async () => {
      const { data } = await supabase
        .from('group_invitations')
        .select('id, invitee_id, status')
        .eq('group_id', groupId)
        .eq('status', 'pending');
      
      if (data) {
        setInvitations(data);
      }
    };

    const fetchJoinRequests = async () => {
      const { data } = await supabase
        .from('join_requests')
        .select('id, student_id')
        .eq('group_id', groupId)
        .eq('status', 'pending');
      
      if (data) {
        setJoinRequests(data);
      }
    };

    fetchInvitations();
    fetchJoinRequests();

    // Subscribe to realtime changes for invitations
    const invitationsChannel = supabase
      .channel('group-invitations')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'group_invitations',
        filter: `group_id=eq.${groupId}`
      }, () => {
        fetchInvitations();
      })
      .subscribe();

    // Subscribe to realtime changes for join requests
    const joinRequestsChannel = supabase
      .channel('group-join-requests')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'join_requests',
        filter: `group_id=eq.${groupId}`
      }, () => {
        fetchJoinRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(invitationsChannel);
      supabase.removeChannel(joinRequestsChannel);
    };
  }, [groupId]);

  // Filter available students in the same section, excluding those with pending join requests
  const availableStudents = getAvailableStudents().filter(
    s => s.id !== currentStudent?.id && 
         s.section === currentStudent?.section &&
         !joinRequests.some(jr => jr.student_id === s.id)
  );

  const filteredStudents = availableStudents.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.studentId.toLowerCase().includes(search.toLowerCase())
  );


  const isInvited = (studentId: string) => {
    return invitations.some(inv => inv.invitee_id === studentId);
  };

  const handleInvite = async (student: Student) => {
    if (!currentStudent || !canInviteMore) return;

    try {
      const { data, error } = await supabase
        .from('group_invitations')
        .insert({
          group_id: groupId,
          inviter_id: currentStudent.id,
          invitee_id: student.id
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.info(`${student.name} has already been invited`);
        } else {
          throw error;
        }
        return;
      }

      // Update local state immediately
      if (data) {
        setInvitations(prev => [...prev, { id: data.id, invitee_id: data.invitee_id, status: data.status }]);
      }
      toast.success(`Invitation sent to ${student.name}`);
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error('Failed to send invitation');
    }
  };

  const handleUninvite = async (student: Student) => {
    const invitation = invitations.find(inv => inv.invitee_id === student.id);
    if (!invitation) return;

    // Update local state immediately for instant feedback
    setInvitations(prev => prev.filter(inv => inv.id !== invitation.id));

    try {
      const { error } = await supabase
        .from('group_invitations')
        .delete()
        .eq('id', invitation.id);

      if (error) {
        // Revert on error
        setInvitations(prev => [...prev, invitation]);
        throw error;
      }

      toast.success(`Invitation to ${student.name} cancelled`);
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  const handleClick = (student: Student, invited: boolean) => {
    if (invited) {
      handleUninvite(student);
    } else if (canInviteMore) {
      handleInvite(student);
    }
  };

  // If group is full, show message instead of student list
  if (!canInviteMore) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <Badge variant="secondary" className="text-sm">
            {currentMemberCount}/{maxMembers} members
          </Badge>
          <p className="text-sm text-muted-foreground mt-3">
            Group is full. Cannot invite more students.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Click on a student to invite them ({currentMemberCount}/{maxMembers} members)
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ID..."
          className="pl-10 h-10"
        />
      </div>

      <div className="max-h-[50vh] sm:max-h-[280px] overflow-y-auto scroll-contain space-y-2 pr-1">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            {availableStudents.length === 0 
              ? "No available students to invite"
              : "No students match your search"
            }
          </div>
        ) : (
          filteredStudents.map((student) => {
            const invited = isInvited(student.id);
            return (
              <div 
                key={student.id}
                onClick={() => handleClick(student, invited)}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer ${
                  invited 
                    ? 'bg-muted/30 hover:bg-destructive/10 border border-transparent hover:border-destructive/30' 
                    : 'bg-muted/50 hover:bg-primary/10 hover:border-primary/30 border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{student.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {student.studentId}</p>
                </div>
                {invited ? (
                  <Badge variant="secondary" className="gap-1 text-xs hover:bg-destructive/20 group">
                    <Clock className="w-3 h-3 group-hover:hidden" />
                    <X className="w-3 h-3 hidden group-hover:block" />
                    <span className="group-hover:hidden">Invited</span>
                    <span className="hidden group-hover:inline">Cancel</span>
                  </Badge>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Click to invite</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
