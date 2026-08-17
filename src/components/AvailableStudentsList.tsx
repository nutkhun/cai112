import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGroups } from '@/context/GroupContext';
import { Search, Users, UserCheck, Check, Plus, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/types';

interface AvailableStudentsListProps {
  onGroupCreated: (groupId: string, groupName: string, members: Student[]) => void;
}

export const AvailableStudentsList = ({ onGroupCreated }: AvailableStudentsListProps) => {
  const [search, setSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  
  const {
    currentStudent,
    getAvailableStudents,
    createGroup,
    addMemberToGroup,
    getStudentById,
    students
  } = useGroups();
  // Filter students to only show those in the same section and not the current student
  // Use both id and studentId to ensure we never show ourselves
  const availableStudents = getAvailableStudents().filter(
    s => s.id !== currentStudent?.id && 
         s.studentId !== currentStudent?.studentId && 
         s.section === currentStudent?.section
  );
  const filteredStudents = availableStudents.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.studentId.toLowerCase().includes(search.toLowerCase()));
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  const toggleMember = (studentId: string) => {
    setSelectedMembers(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId);
      }
      if (prev.length >= 3) {
        toast.error('Maximum 3 additional members (4 total including you)');
        return prev;
      }
      return [...prev, studentId];
    });
  };
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    if (!currentStudent) {
      toast.error('You must be registered to create a group');
      return;
    }
    try {
      const group = await createGroup(groupName.trim(), currentStudent.id);
      if (!group) {
        toast.error('Could not create group');
        return;
      }

      // Add selected members to the group
      for (const memberId of selectedMembers) {
        await addMemberToGroup(memberId, group.id);
      }

      // Build members list - ensure currentStudent is always included
      const members: Student[] = [currentStudent];
      for (const memberId of selectedMembers) {
        const student = students.find(s => s.id === memberId);
        if (student) {
          members.push(student);
        }
      }

      // Store data for callback
      const savedGroupId = group.id;
      const savedGroupName = groupName.trim();
      
      // Reset form
      setGroupName('');
      setSelectedMembers([]);
      setShowNameDialog(false);
      
      // Show success toast
      toast.success(`Group "${savedGroupName}" created! Now select a leader.`);
      
      // Notify parent to open leader selection dialog
      onGroupCreated(savedGroupId, savedGroupName, members);
      
    } catch {
      toast.error('Could not create group');
    }
  };
  const clearSelection = () => {
    setSelectedMembers([]);
  };
  const selectedStudentNames = selectedMembers.map(id => getStudentById(id)?.name).filter(Boolean).slice(0, 2);
  return <>
      <Card className="shadow-soft border-0">
        <CardHeader className="pb-3">
          {/* Stacked on phones: this title is long, and squeezing a badge beside
              it on a 390px screen left ~2 words per line. */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg font-display flex items-start gap-2">
              <UserCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <span>Select Classmates to create your group for Midterm Presentation and Final Project</span>
            </CardTitle>
            <Badge variant="secondary" className="text-xs shrink-0">
              {availableStudents.length} available
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search classmates..." className="pl-10 h-10" />
          </div>

          {selectedMembers.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-dashed"
              onClick={() => setShowNameDialog(true)}
            >
              <UserCheck className="w-4 h-4" />
              Present alone? Create a group of one (just you)
            </Button>
          )}

          {filteredStudents.length === 0 ? <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {availableStudents.length === 0 ? "All classmates are in groups" : "No classmates match your search"}
              </p>
            </div> : <div className={cn("grid gap-2 max-h-[50vh] sm:max-h-[300px] overflow-y-auto scroll-contain", selectedMembers.length > 0 && "pb-20")}>
              {filteredStudents.map(student => {
            const isSelected = selectedMembers.includes(student.id);
            return <div key={student.id} onClick={() => toggleMember(student.id)} className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all", isSelected ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/50 hover:bg-muted")}>
                    <div className={cn("h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors", isSelected ? "bg-primary border-primary" : "border-muted-foreground/50")}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{student.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {student.studentId}</p>
                    </div>
                  </div>;
          })}
            </div>}
        </CardContent>
      </Card>

      {/* Floating action bar when members are selected */}
      {/* Sits above the mobile tab bar on phones, and in its original spot on desktop. */}
      {selectedMembers.length > 0 && <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md md:w-auto animate-fade-in">
          <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-2xl bg-card shadow-elevated border border-border backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden xs:flex -space-x-2">
                {selectedMembers.slice(0, 3).map(id => {
              const student = getStudentById(id);
              return student ? <Avatar key={id} className="h-8 w-8 border-2 border-card">
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {getInitials(student.name)}
                      </AvatarFallback>
                    </Avatar> : null;
            })}
              </div>
              <span className="whitespace-nowrap text-sm font-medium">
                {selectedMembers.length} selected
              </span>
            </div>
            <div className="hidden md:block w-px h-6 bg-border" />
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="sm" onClick={clearSelection} aria-label="Clear selection" className="px-2">
                <X className="w-4 h-4" />
              </Button>
              <Button variant="gradient" size="sm" onClick={() => setShowNameDialog(true)} className="gap-1.5 sm:gap-2">
                <Plus className="w-4 h-4" />
                Create
                <span className="hidden sm:inline">Group</span>
              </Button>
            </div>
          </div>
        </div>}

      {/* Name group dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Sparkles className="w-5 h-5 text-accent" />
              Name Your Group
            </DialogTitle>
            <DialogDescription>
              You + {selectedStudentNames.join(', ')}
              {selectedMembers.length > 2 && ` and ${selectedMembers.length - 2} more`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="groupName">Group Name</Label>
              <Input id="groupName" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g., The Innovators, Team Alpha" className="h-11" autoFocus onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateGroup();
              }
            }} />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowNameDialog(false)}>
                Back
              </Button>
              <Button variant="gradient" className="flex-1" onClick={handleCreateGroup}>
                Create ({selectedMembers.length + 1} members)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>;
};