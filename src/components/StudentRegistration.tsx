import { useRef, useState } from 'react';
import { readStudentLogin } from '@/lib/student-login';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGroups } from '@/context/GroupContext';
import { Users, User, IdCard, GraduationCap, BookOpen, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Section, Student } from '@/types';
import { ChangePinDialog } from './ChangePinDialog';

const TEACHER_PIN = '5616';

interface StudentRegistrationProps {
  onTeacherAccess: () => void;
}
export const StudentRegistration = ({
  onTeacherAccess
}: StudentRegistrationProps) => {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [section, setSection] = useState<Section | ''>('');
  const [pin, setPin] = useState('');
  const [showPinChangeDialog, setShowPinChangeDialog] = useState(false);
  const [pendingStudent, setPendingStudent] = useState<Student | null>(null);
  const [showTeacherPinDialog, setShowTeacherPinDialog] = useState(false);
  const [teacherPin, setTeacherPin] = useState('');
  const [showLoginErrorDialog, setShowLoginErrorDialog] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const {
    addStudent,
    updateStudentPin,
    setCurrentStudent
  } = useGroups();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    // Include the values displayed by browser/password-manager autofill.
    const credentials = readStudentLogin(new FormData(e.currentTarget as HTMLFormElement));
    if ('error' in credentials) {
      toast.error(credentials.error);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await addStudent(credentials.name, credentials.studentId, credentials.section, credentials.pin);
      if (!result || 'error' in result) {
        setLoginError(result && 'error' in result ? result.error : 'Sign in could not be completed. Please try again.');
        setShowLoginErrorDialog(true);
      } else if (result.requiresPinChange) {
        setPendingStudent(result.student);
        setShowPinChangeDialog(true);
      } else {
        toast.success(`Welcome, ${result.student.name}!`);
      }
    } catch {
      setLoginError('Sign in could not be completed. Please check your connection and try again.');
      setShowLoginErrorDialog(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const handlePinChanged = async (newPin: string) => {
    if (!pendingStudent) return;
    const success = await updateStudentPin(pendingStudent.id, newPin);
    if (success) {
      toast.success(`Welcome, ${pendingStudent.name}! Your PIN has been updated.`);
      setShowPinChangeDialog(false);
      // Now set the current student to proceed to dashboard
      setCurrentStudent(pendingStudent);
      setPendingStudent(null);
    } else {
      toast.error('Failed to update PIN. Please try again.');
    }
  };

  const handleTeacherPinSubmit = () => {
    if (teacherPin === TEACHER_PIN) {
      setShowTeacherPinDialog(false);
      setTeacherPin('');
      onTeacherAccess();
    } else {
      toast.error('Invalid teacher PIN');
      setTeacherPin('');
    }
  };

  const handleTeacherAccessClick = () => {
    setShowTeacherPinDialog(true);
  };
  return <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-background pt-safe pb-safe">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-primary mb-3 sm:mb-4">
            <Users className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-2">
            <span className="block">CAI112</span>
            <span className="block text-xl sm:text-3xl">Student Management System (SMS)</span>
          </h1>
        </div>

        <Card className="shadow-elevated border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-display">Student Login</CardTitle>
            <CardDescription>Enter your details to sign in. First-time users use 0000 as a PIN code and will set it later after login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Last Name
                </Label>
                <Input id="name" name="lastName" autoComplete="family-name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your last name" className="h-11" disabled={submitting} />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="studentId" className="flex items-center gap-2">
                  <IdCard className="w-4 h-4 text-muted-foreground" />
                  Student ID
                </Label>
                <Input id="studentId" name="studentId" autoComplete="username" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="Enter your student ID" className="h-11" disabled={submitting} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="section" className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  Section
                </Label>
                <Select name="section" value={section} onValueChange={value => setSection(value as Section)} disabled={submitting}>
                  <SelectTrigger id="section" className="h-11">
                    <SelectValue placeholder="Select your section" />
                  </SelectTrigger>
                <SelectContent>
                    <SelectItem value="457A">457A</SelectItem>
                    <SelectItem value="458A">458A</SelectItem>
                    <SelectItem value="458B">458B</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-pin" className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  4-Digit PIN
                </Label>
                <div className="flex justify-center">
                  <InputOTP id="student-pin" name="pin" autoComplete="current-password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin} onChange={setPin} disabled={submitting}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={handleTeacherAccessClick} className="text-muted-foreground hover:text-foreground gap-2">
            <GraduationCap className="w-4 h-4" />
            Teacher Access
          </Button>
        </div>
      </div>

      <Dialog open={showLoginErrorDialog} onOpenChange={setShowLoginErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-destructive" />
              Login not successful
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              {loginError}
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full" onClick={() => setShowLoginErrorDialog(false)}>
            Try Again
          </Button>
        </DialogContent>
      </Dialog>

      <ChangePinDialog open={showPinChangeDialog} onPinChanged={handlePinChanged} />

      <Dialog open={showTeacherPinDialog} onOpenChange={setShowTeacherPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              Teacher Access
            </DialogTitle>
            <DialogDescription>
              Enter the 4-digit teacher PIN to access the dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <InputOTP
              maxLength={4}
              value={teacherPin}
              onChange={(value) => {
                setTeacherPin(value);
                if (value.length === 4) {
                  setTimeout(() => {
                    if (value === TEACHER_PIN) {
                      setShowTeacherPinDialog(false);
                      setTeacherPin('');
                      onTeacherAccess();
                    } else {
                      toast.error('Invalid teacher PIN');
                      setTeacherPin('');
                    }
                  }, 100);
                }
              }}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
};
