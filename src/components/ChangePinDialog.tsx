import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

interface ChangePinDialogProps {
  open: boolean;
  onPinChanged: (newPin: string) => void;
}

export const ChangePinDialog = ({ open, onPinChanged }: ChangePinDialogProps) => {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPin.length !== 4) {
      toast.error('Please enter a 4-digit PIN');
      return;
    }

    if (newPin === '0000') {
      toast.error('Please choose a different PIN than 0000');
      return;
    }

    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }

    onPinChanged(newPin);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Set Your New PIN
          </DialogTitle>
          <DialogDescription>
            For security, please change your default PIN to a personal 4-digit code.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label>New 4-Digit PIN</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={newPin}
                onChange={(value) => setNewPin(value)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Confirm PIN</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={confirmPin}
                onChange={(value) => setConfirmPin(value)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button 
            type="submit" 
            variant="gradient" 
            className="w-full"
            disabled={newPin.length !== 4 || confirmPin.length !== 4}
          >
            Save New PIN
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
