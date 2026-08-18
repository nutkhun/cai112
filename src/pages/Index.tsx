import { useState } from 'react';
import { GroupProvider, useGroups } from '@/context/GroupContext';
import { StudentRegistration } from '@/components/StudentRegistration';
import { StudentDashboard } from '@/components/StudentDashboard';
import { TeacherDashboard } from '@/components/TeacherDashboard';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ViewMode } from '@/types';

const TEACHER_SESSION_KEY = 'cai112-teacher-session';

const AppContent = () => {
  const { currentStudent } = useGroups();
  // The teacher stays signed in across reloads until they leave via the back
  // button; the PIN is only asked again after that.
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    localStorage.getItem(TEACHER_SESSION_KEY) === 'on' ? 'teacher' : 'student'
  );
  const signedIn = viewMode === 'teacher' || !!currentStudent;

  const enterTeacher = () => {
    localStorage.setItem(TEACHER_SESSION_KEY, 'on');
    setViewMode('teacher');
  };
  const leaveTeacher = () => {
    localStorage.removeItem(TEACHER_SESSION_KEY);
    setViewMode('student');
  };

  return (
    <>
      {viewMode === 'teacher' ? (
        <TeacherDashboard onSwitchView={leaveTeacher} />
      ) : !currentStudent ? (
        <StudentRegistration onTeacherAccess={enterTeacher} />
      ) : (
        <StudentDashboard />
      )}
      <InstallPrompt signedIn={signedIn} />
    </>
  );
};

const Index = () => {
  return (
    <GroupProvider>
      <AppContent />
    </GroupProvider>
  );
};

export default Index;
