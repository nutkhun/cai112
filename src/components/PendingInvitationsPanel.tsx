import { useState, useEffect } from 'react';
import { useGroups } from '@/context/GroupContext';
import { supabase } from '@/integrations/backend/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface Invitation {
  id: string;
  group_id: string;
  inviter_id: string;
  status: string;
  created_at: string;
  group_name?: string;
  inviter_name?: string;
}

export const PendingInvitationsPanel = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentStudent, joinGroup, getGroupById, getStudentById } = useGroups();

  useEffect(() => {
    if (!currentStudent) return;

    const fetchInvitations = async () => {
      const { data, error } = await supabase
        .from('group_invitations')
        .select('*')
        .eq('invitee_id', currentStudent.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching invitations:', error);
        return;
      }

      // Enrich with group and inviter names
      const enrichedInvitations = (data || []).map(inv => {
        const group = getGroupById(inv.group_id);
        const inviter = getStudentById(inv.inviter_id);
        return {
          ...inv,
          group_name: group?.name || 'Unknown Group',
          inviter_name: inviter?.name || 'Unknown'
        };
      });

      setInvitations(enrichedInvitations);
      setLoading(false);
    };

    fetchInvitations();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`my-invitations-${currentStudent.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'group_invitations',
        filter: `invitee_id=eq.${currentStudent.id}`
      }, (payload) => {
        // Show notification for new invitation
        const group = getGroupById(payload.new.group_id as string);
        const inviter = getStudentById(payload.new.inviter_id as string);
        if (group && inviter && payload.new.status === 'pending') {
          toast.info(`${inviter.name} invited you to join ${group.name}!`, {
            icon: <Mail className="w-4 h-4" />,
          });
        }
        fetchInvitations();
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'group_invitations',
        filter: `invitee_id=eq.${currentStudent.id}`
      }, () => {
        fetchInvitations();
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'group_invitations',
        filter: `invitee_id=eq.${currentStudent.id}`
      }, () => {
        fetchInvitations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStudent, getGroupById, getStudentById]);


  const handleAccept = async (invitation: Invitation) => {
    try {
      // Join the group
      const success = await joinGroup(currentStudent!.id, invitation.group_id);
      
      if (!success) {
        toast.error('Could not join group. It may be full.');
        return;
      }

      // Update invitation status
      await supabase
        .from('group_invitations')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', invitation.id);

      // Delete all other pending invitations for this student
      await supabase
        .from('group_invitations')
        .delete()
        .eq('invitee_id', currentStudent!.id)
        .eq('status', 'pending');

      toast.success(`You joined ${invitation.group_name}!`);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast.error('Failed to accept invitation');
    }
  };

  const handleDecline = async (invitation: Invitation) => {
    try {
      await supabase
        .from('group_invitations')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', invitation.id);

      toast.info('Invitation declined');
    } catch (error) {
      console.error('Error declining invitation:', error);
      toast.error('Failed to decline invitation');
    }
  };

  // Don't show section if loading or no invitations
  if (loading || invitations.length === 0) return null;

  return (
    <Card className="border-yellow-600/40 bg-yellow-900/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="w-4 h-4" />
          Group Invitations
          {invitations.length > 0 && (
            <Badge variant="default" className="ml-auto">{invitations.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((invitation) => (
          <div 
            key={invitation.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-background/80 border border-border"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{invitation.group_name}</p>
              <p className="text-xs text-muted-foreground">
                Invited by {invitation.inviter_name}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="default"
                onClick={() => handleAccept(invitation)}
                className="h-10 md:h-8 px-3"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleDecline(invitation)}
                className="h-10 md:h-8 px-3"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
