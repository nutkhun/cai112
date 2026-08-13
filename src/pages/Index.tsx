import { useState } from 'react';
import { GroupProvider, useGroups } from '@/context/GroupContext';
import { StudentRegistration } from '@/components/StudentRegistration';
import { StudentDashboard } from '@/components/StudentDashboard';
import { TeacherDashboard } from '@/components/TeacherDashboard';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ViewMode } from '@/types';

const AppContent = () => {
  const { currentStudent } = useGroups();
  const [viewMode, setViewMode] = useState<ViewMode>('student');
  const signedIn = viewMode === 'teacher' || !!currentStudent;

  return (
    <>
      {viewMode === 'teacher' ? (
        <TeacherDashboard onSwitchView={() => setViewMode('student')} />
      ) : !currentStudent ? (
        <StudentRegistration onTeacherAccess={() => setViewMode('teacher')} />
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
