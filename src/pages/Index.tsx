import { useState } from 'react';
import { GroupProvider, useGroups } from '@/context/GroupContext';
import { StudentRegistration } from '@/components/StudentRegistration';
import { StudentDashboard } from '@/components/StudentDashboard';
import { TeacherDashboard } from '@/components/TeacherDashboard';
import { ViewMode } from '@/types';

const AppContent = () => {
  const { currentStudent } = useGroups();
  const [viewMode, setViewMode] = useState<ViewMode>('student');

  if (viewMode === 'teacher') {
    return <TeacherDashboard onSwitchView={() => setViewMode('student')} />;
  }

  if (!currentStudent) {
    return <StudentRegistration onTeacherAccess={() => setViewMode('teacher')} />;
  }

  return <StudentDashboard />;
};

const Index = () => {
  return (
    <GroupProvider>
      <AppContent />
    </GroupProvider>
  );
};

export default Index;
