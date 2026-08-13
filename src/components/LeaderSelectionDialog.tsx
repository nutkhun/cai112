import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Crown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/types';

interface LeaderSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  members: Student[];
  onSelectLeader: (leaderId: string) => Promise<void>;
}

export const LeaderSelectionDialog = ({
  open,
  onOpenChange,
  groupName,
  members,
  onSelectLeader,
}: LeaderSelectionDialogProps) => {
  const [selectedLeader, setSelectedLeader] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleConfirm = async () => {
    if (!selectedLeader) {
      toast.error('Please select a group leader');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSelectLeader(selectedLeader);
      const leader = members.find(m => m.id === selectedLeader);
      toast.success(`${leader?.name} has been set as the group leader!`);
      onOpenChange(false);
    } catch {
      toast.error('Failed to set group leader');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Crown className="w-5 h-5 text-yellow-500" />
            Choose Group Leader
          </DialogTitle>
          <DialogDescription>
            Your group "{groupName}" has been created! Select a leader who will manage the group.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">Select one member as leader:</p>
          
          <div className="space-y-2 max-h-[50vh] sm:max-h-[250px] overflow-y-auto scroll-contain">
            {members.map((member) => (
              <div
                key={member.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border-2",
                  selectedLeader === member.id
                    ? "border-primary bg-primary/10"
                    : "border-transparent bg-muted/40 hover:bg-muted/60"
                )}
                onClick={() => setSelectedLeader(member.id)}
              >
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  selectedLeader === member.id
                    ? "bg-primary border-primary"
                    : "border-muted-foreground"
                )}>
                  {selectedLeader === member.id && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-sm bg-primary/10 text-primary font-medium">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">ID: {member.studentId}</p>
                </div>
                
                {selectedLeader === member.id && (
                  <Crown className="w-5 h-5 text-yellow-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Skip for Now
          </Button>
          <Button
            variant="gradient"
            className="flex-1 gap-2"
            onClick={handleConfirm}
            disabled={!selectedLeader || isSubmitting}
          >
            <Crown className="w-4 h-4" />
            {isSubmitting ? 'Setting...' : 'Confirm Leader'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
