import { useState, useEffect } from 'react';
import { useGroups } from '@/context/GroupContext';
import { GroupCard } from './GroupCard';
import { GroupChat } from './GroupChat';
import { InviteStudentsList } from './InviteStudentsList';
import { PendingInvitationsPanel } from './PendingInvitationsPanel';
import { AvailableStudentsList } from './AvailableStudentsList';
import { AssignmentSection } from './AssignmentSection';
import { JoinRequestsPanel } from './JoinRequestsPanel';
import { LeaderSelectionDialog } from './LeaderSelectionDialog';
import { AbsenceForm } from './AbsenceForm';
import { MessageCenter } from './MessageCenter';
import { MaterialsSection } from './MaterialsSection';
import { DueDateNotifications } from './DueDateNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { LogOut, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Student } from '@/types';
import { supabase } from '@/integrations/supabase/client';

export const StudentDashboard = () => {
  const [leaderDialogOpen, setLeaderDialogOpen] = useState(false);
  const [joinGroupOpen, setJoinGroupOpen] = useState(true);
  const [manageGroupOpen, setManageGroupOpen] = useState(true);
  const [pendingGroupForLeader, setPendingGroupForLeader] = useState<{
    id: string;
    name: string;
    members: Student[];
  } | null>(null);
  const [invitedGroupIds, setInvitedGroupIds] = useState<string[]>([]);
  const {
    currentStudent,
    groups,
    setCurrentStudent,
    getGroupById,
    setGroupLeader
  } = useGroups();
  const currentGroup = currentStudent?.groupId ? getGroupById(currentStudent.groupId) : null;

  // Scroll to top when dashboard loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentStudent?.id]);

  // Fetch pending invitations to exclude from join group section
  useEffect(() => {
    if (!currentStudent) return;

    const fetchInvitedGroups = async () => {
      const { data } = await supabase
        .from('group_invitations')
        .select('group_id')
        .eq('invitee_id', currentStudent.id)
        .eq('status', 'pending');
      
      setInvitedGroupIds((data || []).map(inv => inv.group_id));
    };

    fetchInvitedGroups();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`invited-groups-${currentStudent.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'group_invitations',
        filter: `invitee_id=eq.${currentStudent.id}`
      }, () => {
        fetchInvitedGroups();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStudent]);
  const handleGroupCreated = (groupId: string, groupName: string, members: Student[]) => {
    setPendingGroupForLeader({
      id: groupId,
      name: groupName,
      members
    });
    setLeaderDialogOpen(true);
  };
  const handleSelectLeader = async (leaderId: string) => {
    if (!pendingGroupForLeader) return;
    await setGroupLeader(pendingGroupForLeader.id, leaderId);
  };
  // Filter groups to only show those with members in the same section, excluding groups with pending invitations
  const sectionGroups = groups.filter(g => 
    g.id !== currentStudent?.groupId && 
    g.members.some(m => m.section === currentStudent?.section) &&
    !invitedGroupIds.includes(g.id)
  );
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  const handleLogout = () => {
    setCurrentStudent(null);
  };
  if (!currentStudent) return null;
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-primary">
                <Users className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display font-bold text-lg">CAI112 Student Management System (SMS)</h1>
                
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                {/* Mobile: stacked layout */}
                <div className="flex flex-col text-xs sm:hidden">
                  <span className="font-medium">{currentStudent.name}</span>
                  <span className="text-primary">{currentStudent.studentId}</span>
                  <span className="text-muted-foreground">{currentStudent.section}</span>
                </div>
                {/* Desktop: inline layout */}
                <span className="text-sm font-medium hidden sm:inline">
                  {currentStudent.name}
                </span>
                <Badge variant="secondary" className="text-xs text-primary hidden sm:inline-flex">{currentStudent.studentId}</Badge>
                <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{currentStudent.section}</Badge>
              </div>
              
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Due Date Notifications */}
        <DueDateNotifications />
        
        {currentGroup ? (/* Student is in a group - show only their group */
      <section className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-display font-semibold">Your Group</h2>
              <Badge variant="default">Active</Badge>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="w-full overflow-hidden">
                <GroupCard group={currentGroup} />
                <GroupChat groupId={currentGroup.id} />
              </div>
              <div className="space-y-4">
                <MessageCenter />
                <MaterialsSection />
                {currentGroup.members.length < 4 && (
                  <Collapsible open={manageGroupOpen} onOpenChange={setManageGroupOpen}>
                    <Card className="shadow-soft border-0">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 font-display font-semibold text-lg">
                              <Users className="w-5 h-5 text-primary" />
                              Manage Your Group
                            </CardTitle>
                            {manageGroupOpen ? (
                              <ChevronUp className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 space-y-4">
                          <InviteStudentsList 
                            groupId={currentGroup.id} 
                            currentMemberCount={currentGroup.members.length}
                          />
                          <JoinRequestsPanel groupId={currentGroup.id} />
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}
                <AssignmentSection groupId={currentGroup.id} />
                <AbsenceForm />
              </div>
            </div>
          </section>) : (/* Student has no group - show available classmates and groups to join */
      <div className="space-y-6 animate-fade-in">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Left Column - Available Classmates and Assignment Section */}
              <div className="space-y-6">
                <section className="animate-slide-up">
                  <AvailableStudentsList onGroupCreated={handleGroupCreated} />
                </section>
                
                {/* Assignment Section for students without group */}
                <section className="animate-slide-up">
                  <AssignmentSection />
                </section>
              </div>

              {/* Right Column - Message Center, Join Group and Pending Invitations */}
              <div className="space-y-6">
                {/* Message Center */}
                <MessageCenter />
                
                {/* Materials Section */}
                <MaterialsSection />

                {/* Available Groups to Join */}
                <Collapsible open={joinGroupOpen} onOpenChange={setJoinGroupOpen}>
                  <Card className="shadow-soft border-0 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 font-display font-semibold text-lg">
                            <Users className="w-5 h-5 text-primary" />
                            Join Group
                            {sectionGroups.filter(g => g.members.length < 4).length > 0 && (
                              <Badge variant="secondary" className="ml-2">
                                {sectionGroups.filter(g => g.members.length < 4).length}
                              </Badge>
                            )}
                          </CardTitle>
                          {joinGroupOpen ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {sectionGroups.length > 0 ? (
                          <div className="space-y-3">
                            {sectionGroups.filter(g => g.members.length < 4).map(group => (
                              <GroupCard key={group.id} group={group} />
                            ))}
                            {sectionGroups.every(g => g.members.length >= 4) && (
                              <div className="text-center py-6 text-muted-foreground">
                                <p className="text-sm">All existing groups are full. Create your own!</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground">
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No groups have been created yet.</p>
                            <p className="text-xs">Select classmates to create one!</p>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Pending Invitations */}
                <PendingInvitationsPanel />

                {/* Absence Form */}
                <AbsenceForm />
              </div>
            </div>
          </div>)}
      </main>

      {/* Leader Selection Dialog - at root level so it doesn't unmount */}
      <LeaderSelectionDialog open={leaderDialogOpen} onOpenChange={setLeaderDialogOpen} groupName={pendingGroupForLeader?.name || ''} members={pendingGroupForLeader?.members || []} onSelectLeader={handleSelectLeader} />
    </div>;
};
