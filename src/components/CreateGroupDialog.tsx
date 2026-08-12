import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGroups } from '@/context/GroupContext';
import { Plus, Sparkles, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { LeaderSelectionDialog } from './LeaderSelectionDialog';
import { Student } from '@/types';

export const CreateGroupDialog = () => {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [leaderDialogOpen, setLeaderDialogOpen] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [createdGroupName, setCreatedGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<Student[]>([]);
  
  const { currentStudent, createGroup, getAvailableStudents, addMemberToGroup, setGroupLeader, students } = useGroups();

  const availableStudents = getAvailableStudents().filter(s => s.id !== currentStudent?.id);
  
  const filteredStudents = availableStudents.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.studentId.toLowerCase().includes(search.toLowerCase())
  );

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
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

      // Store data for leader selection dialog
      const savedGroupId = group.id;
      const savedGroupName = groupName.trim();
      
      // Reset form first
      setGroupName('');
      setSelectedMembers([]);
      setSearch('');
      
      // Close create dialog first
      setOpen(false);
      
      // Show success toast
      toast.success(`Group "${savedGroupName}" created! Now select a leader.`);
      
      // Set up leader selection dialog data
      setCreatedGroupId(savedGroupId);
      setCreatedGroupName(savedGroupName);
      setGroupMembers(members);
      
      // Delay opening leader dialog to ensure create dialog is fully closed
      setTimeout(() => {
        setLeaderDialogOpen(true);
      }, 150);
      
    } catch {
      toast.error('Could not create group');
    }
  };

  const handleSelectLeader = async (leaderId: string) => {
    if (!createdGroupId) return;
    await setGroupLeader(createdGroupId, leaderId);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setGroupName('');
      setSelectedMembers([]);
      setSearch('');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="gradient" size="lg" className="gap-2">
            <Plus className="w-5 h-5" />
            Create New Group
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Sparkles className="w-5 h-5 text-accent" />
              Create Your Group
            </DialogTitle>
            <DialogDescription>
              Name your group and select classmates to join (max 4 members total)
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">Group Name</Label>
              <Input
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., The Innovators, Team Alpha"
                className="h-11"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Select Classmates ({selectedMembers.length}/3 additional members)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or ID..."
                  className="pl-10 h-10"
                />
              </div>
              
              <div className="h-[200px] overflow-y-auto rounded-lg border border-border p-2">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {availableStudents.length === 0 
                      ? "No available classmates to add"
                      : "No classmates match your search"
                    }
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredStudents.map((student) => (
                      <div 
                        key={student.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          selectedMembers.includes(student.id) 
                            ? 'bg-primary/10' 
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => toggleMember(student.id)}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                          selectedMembers.includes(student.id) 
                            ? "bg-primary border-primary" 
                            : "border-muted-foreground"
                        )}>
                          {selectedMembers.includes(student.id) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(student.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {student.studentId}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gradient" className="flex-1">
                Create Group ({selectedMembers.length + 1} members)
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <LeaderSelectionDialog
        open={leaderDialogOpen}
        onOpenChange={setLeaderDialogOpen}
        groupName={createdGroupName}
        members={groupMembers}
        onSelectLeader={handleSelectLeader}
      />
    </>
  );
};
