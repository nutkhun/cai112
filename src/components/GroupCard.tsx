import { useState, useEffect } from 'react';
import { Group } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useGroups } from '@/context/GroupContext';
import { Users, UserMinus, UserPlus, Crown, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface GroupCardProps {
  group: Group;
  showActions?: boolean;
}

export const GroupCard = ({ group, showActions = true }: GroupCardProps) => {
  const { currentStudent, leaveGroup, requestToJoinGroup, hasPendingRequest, setGroupLeader } = useGroups();
  const [pendingRequest, setPendingRequest] = useState(false);
  const [checkingRequest, setCheckingRequest] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const isInGroup = currentStudent?.groupId === group.id;
  const isFull = group.members.length >= 4;
  const canRequest = currentStudent && !currentStudent.groupId && !isFull;
  const isLeader = group.leaderId === currentStudent?.id;

  // Check if current student has a pending request for this group
  useEffect(() => {
    const checkPending = async () => {
      if (currentStudent && !currentStudent.groupId) {
        setCheckingRequest(true);
        const hasPending = await hasPendingRequest(currentStudent.id, group.id);
        setPendingRequest(hasPending);
        setCheckingRequest(false);
      }
    };
    checkPending();
  }, [currentStudent, group.id, hasPendingRequest]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleLeave = async () => {
    if (currentStudent) {
      await leaveGroup(currentStudent.id);
      toast.success('You left the group');
    }
  };

  const handleRequestJoin = async () => {
    if (currentStudent) {
      setRequesting(true);
      const success = await requestToJoinGroup(currentStudent.id, group.id);
      if (success) {
        setPendingRequest(true);
        toast.success(`Request sent to join "${group.name}". Waiting for approval.`);
      } else {
        toast.error('Could not send join request');
      }
      setRequesting(false);
    }
  };

  const handleSetLeader = async (memberId: string) => {
    const success = await setGroupLeader(group.id, memberId);
    if (success) {
      toast.success('Group leader updated');
    } else {
      toast.error('Could not update leader');
    }
  };

  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">{group.name}</h3>
            <Badge variant={isFull ? "secondary" : "default"} className="text-xs">
              {group.members.length}/4 members
            </Badge>
          </div>
        </div>

        {isInGroup ? (
          <div className="space-y-2">
            {group.members.map((member) => (
              <div 
                key={member.id} 
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {member.name}
                    {member.id === group.leaderId && <Crown className="w-4 h-4 text-accent" />}
                  </p>
                  <p className="text-xs text-muted-foreground">ID: {member.studentId}</p>
                </div>
                {member.id !== group.leaderId && (
                  <button
                    onClick={() => handleSetLeader(member.id)}
                    className="opacity-40 hover:opacity-100 transition-opacity"
                    title={`Make ${member.name} the leader`}
                  >
                    <Crown className="w-4 h-4 text-muted-foreground hover:text-accent" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Member details are hidden until you join this group.
          </p>
        )}

        {showActions && (
          isInGroup ? (
            <Button variant="destructive" className="w-full" onClick={handleLeave}>
              <UserMinus className="w-4 h-4 mr-2" />
              Leave Group
            </Button>
          ) : canRequest ? (
            pendingRequest ? (
              <Button variant="outline" className="w-full" disabled>
                <Clock className="w-4 h-4 mr-2" />
                Request Pending
              </Button>
            ) : (
              <Button 
                variant="gradient" 
                className="w-full" 
                onClick={handleRequestJoin}
                disabled={requesting || checkingRequest}
              >
                {requesting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                {requesting ? 'Sending Request...' : 'Request to Join'}
              </Button>
            )
          ) : null
        )}
      </CardContent>
    </Card>
  );
};
