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
import { StudentMobileNav, MobileNavItem } from './student/StudentMobileNav';
import { PresentationQueue } from './PresentationQueue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  LogOut,
  Users,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  ClipboardList,
  Mail,
  CalendarX,
  User,
} from 'lucide-react';
import { Student } from '@/types';
import { supabase } from '@/integrations/backend/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUnreadTeacherMessages } from '@/hooks/useUnreadTeacherMessages';
import { cn } from '@/lib/utils';

type StudentTab = 'group' | 'chat' | 'work' | 'inbox' | 'absence' | 'profile';

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
  const [mobileTab, setMobileTab] = useState<StudentTab>('group');
  const {
    currentStudent,
    groups,
    setCurrentStudent,
    getGroupById,
    setGroupLeader
  } = useGroups();
  const currentGroup = currentStudent?.groupId ? getGroupById(currentStudent.groupId) : null;

  const isMobile = useIsMobile();
  const unreadCount = useUnreadTeacherMessages(currentStudent);

  // Scroll to top when dashboard loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentStudent?.id]);

  // Switching mobile tab is a navigation - start each destination at the top.
  useEffect(() => {
    if (isMobile) window.scrollTo(0, 0);
  }, [mobileTab, isMobile]);

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

  // The Chat tab only exists once the student belongs to a group.
  const navItems: MobileNavItem<StudentTab>[] = [
    { id: 'group' as const, label: 'Group', icon: Users },
    // Group chat is hidden for now; re-add a 'chat' item here to restore it.
    { id: 'work' as const, label: 'Assignment', icon: ClipboardList },
    { id: 'inbox' as const, label: 'Inbox', icon: Mail, badge: unreadCount },
    { id: 'absence' as const, label: 'Absence', icon: CalendarX },
    { id: 'profile' as const, label: 'Profile', icon: User },
  ];

  // If the student leaves a group while sitting on the Chat tab, fall back home.
  useEffect(() => {
    if (!navItems.some(item => item.id === mobileTab)) {
      setMobileTab('group');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroup, mobileTab]);

  if (!currentStudent) return null;

  const manageGroupPanel = currentGroup && currentGroup.members.length < 4 && (
    <Collapsible open={manageGroupOpen} onOpenChange={setManageGroupOpen}>
      <Card className="shadow-soft border-0">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-display font-semibold text-base sm:text-lg">
                <Users className="w-5 h-5 text-primary shrink-0" />
                Manage Your Group
              </CardTitle>
              {manageGroupOpen ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
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
  );

  const joinGroupPanel = (
    <Collapsible open={joinGroupOpen} onOpenChange={setJoinGroupOpen}>
      <Card className="shadow-soft border-0 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-display font-semibold text-base sm:text-lg">
                <Users className="w-5 h-5 text-primary shrink-0" />
                Join Group
                {sectionGroups.filter(g => g.members.length < 4).length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {sectionGroups.filter(g => g.members.length < 4).length}
                  </Badge>
                )}
              </CardTitle>
              {joinGroupOpen ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
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
  );

  /** One destination at a time - the phone layout. */
  const renderMobileTab = () => {
    switch (mobileTab) {
      case 'group':
        return currentGroup ? (
          <div className="space-y-4 animate-fade-in">
            <DueDateNotifications />
            <GroupCard group={currentGroup} />
            {currentGroup.members.length >= 4 && <PresentationQueue groupId={currentGroup.id} />}
            {manageGroupPanel}
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <DueDateNotifications />
            <AvailableStudentsList onGroupCreated={handleGroupCreated} />
            {joinGroupPanel}
            <PendingInvitationsPanel />
          </div>
        );

      case 'chat':
        return currentGroup ? (
          <div className="animate-fade-in">
            <GroupChat groupId={currentGroup.id} fullHeight />
          </div>
        ) : null;

      case 'work':
        return (
          <div className="space-y-4 animate-fade-in">
            <AssignmentSection groupId={currentGroup?.id} defaultExpanded />
            <MaterialsSection />
          </div>
        );

      case 'inbox':
        return (
          <div className="space-y-4 animate-fade-in">
            <MessageCenter defaultExpanded />
          </div>
        );

      case 'absence':
        return (
          <div className="space-y-4 animate-fade-in">
            <AbsenceForm defaultExpanded />
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-4 animate-fade-in">
            <Card className="shadow-soft border-0">
              <CardContent className="flex items-center gap-3 p-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                    {getInitials(currentStudent.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{currentStudent.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs text-primary">
                      {currentStudent.studentId}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {currentStudent.section}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!currentGroup && <PendingInvitationsPanel />}

            <Button variant="outline" className="w-full gap-2" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              Log out
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  /** The original two-column layout, unchanged, for md and up. */
  const renderDesktop = () => (
    <>
      <DueDateNotifications />

      {currentGroup ? (/* Student is in a group - show only their group */
      <section className="animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-display font-semibold">Your Group</h2>
            <Badge variant="default">Active</Badge>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="w-full space-y-4 overflow-hidden">
              <GroupCard group={currentGroup} />
              {currentGroup.members.length >= 4 && <PresentationQueue groupId={currentGroup.id} />}
              <AssignmentSection groupId={currentGroup.id} />
            </div>
            <div className="space-y-4">
              <MessageCenter />
              <MaterialsSection />
              {manageGroupPanel}
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
              {joinGroupPanel}

              {/* Pending Invitations */}
              <PendingInvitationsPanel />

              {/* Absence Form */}
              <AbsenceForm />
            </div>
          </div>
        </div>)}
    </>
  );

  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border pt-safe">
        <div className="container mx-auto py-3 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <div className="p-2 rounded-xl bg-gradient-primary shrink-0">
                <Users className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                {/* Short lockup on phones, full name from md up. */}
                <h1 className="font-display font-bold text-base leading-tight md:hidden">
                  CAI112
                </h1>
                <h1 className="hidden font-display font-bold text-lg md:block">
                  CAI112 Student Management System
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              {/* Identity lives in the "More" tab on phones, so the header stays clean. */}
              <div className="hidden items-center gap-2 px-3 py-1.5 rounded-lg bg-muted md:flex">
                <span className="text-sm font-medium">
                  {currentStudent.name}
                </span>
                <Badge variant="secondary" className="text-xs text-primary">{currentStudent.studentId}</Badge>
                <Badge variant="secondary" className="text-xs">{currentStudent.section}</Badge>
              </div>

              <div className="flex min-w-0 flex-col items-end gap-0.5 md:hidden">
                <span className="max-w-full truncate text-sm font-medium">{currentStudent.name}</span>
                <Badge variant="secondary" className="text-xs">{currentStudent.section}</Badge>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="Log out"
                className="hidden md:inline-flex"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'container mx-auto py-4 md:py-6',
          // Clears the fixed bottom tab bar so the last card is never trapped.
          'pb-mobile-nav',
        )}
      >
        {isMobile ? renderMobileTab() : renderDesktop()}
      </main>

      {isMobile && (
        <StudentMobileNav<StudentTab> items={navItems} value={mobileTab} onChange={setMobileTab} />
      )}

      {/* Leader Selection Dialog - at root level so it doesn't unmount */}
      <LeaderSelectionDialog open={leaderDialogOpen} onOpenChange={setLeaderDialogOpen} groupName={pendingGroupForLeader?.name || ''} members={pendingGroupForLeader?.members || []} onSelectLeader={handleSelectLeader} />
    </div>;
};
