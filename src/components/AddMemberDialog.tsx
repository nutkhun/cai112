import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useGroups } from '@/context/GroupContext';
import { UserPlus, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/types';

export const AddMemberDialog = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { currentStudent, getAvailableStudents, addMemberToGroup, getGroupById } = useGroups();

  const currentGroup = currentStudent?.groupId ? getGroupById(currentStudent.groupId) : null;
  const canAddMore = currentGroup && currentGroup.members.length < 4;

  // Filter out current student and only show students in the same section
  const availableStudents = getAvailableStudents().filter(
    s => s.id !== currentStudent?.id && s.section === currentStudent?.section
  );

  const filteredStudents = availableStudents.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.studentId.toLowerCase().includes(search.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleAddMember = async (student: Student) => {
    if (!currentStudent?.groupId) return;
    
    const success = await addMemberToGroup(student.id, currentStudent.groupId);
    if (success) {
      toast.success(`${student.name} added to your group!`);
    } else {
      toast.error('Could not add member');
    }
  };

  if (!currentGroup) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2" disabled={!canAddMore}>
          <UserPlus className="w-5 h-5" />
          Add Members
          {currentGroup && (
            <span className="text-muted-foreground">
              ({currentGroup.members.length}/4)
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add Group Members</DialogTitle>
          <DialogDescription>
            Select students to join your group ({currentGroup.members.length}/4 members)
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ID..."
            className="pl-10 h-11"
          />
        </div>

        <div className="h-[300px] overflow-y-auto mt-4">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {availableStudents.length === 0 
                ? "No available students to add"
                : "No students match your search"
              }
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStudents.map((student) => (
                <div 
                  key={student.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(student.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{student.name}</p>
                    <p className="text-sm text-muted-foreground">ID: {student.studentId}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="gradient"
                    onClick={() => handleAddMember(student)}
                    disabled={currentGroup.members.length >= 4}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
