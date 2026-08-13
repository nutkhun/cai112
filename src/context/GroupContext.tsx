import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Student, Group, Section } from '@/types';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';

interface GroupContextType {
  students: Student[];
  groups: Group[];
  currentStudent: Student | null;
  loading: boolean;
  refetchData: () => Promise<void>;
  addStudent: (name: string, studentId: string, section: Section, pin: string) => Promise<{ student: Student; requiresPinChange: boolean } | { error: string } | null>;
  updateStudentPin: (studentId: string, newPin: string) => Promise<boolean>;
  setCurrentStudent: (student: Student | null) => void;
  createGroup: (name: string, creatorId: string) => Promise<Group | null>;
  joinGroup: (studentId: string, groupId: string) => Promise<boolean>;
  leaveGroup: (studentId: string) => Promise<void>;
  addMemberToGroup: (studentId: string, groupId: string) => Promise<boolean>;
  setGroupLeader: (groupId: string, leaderId: string) => Promise<boolean>;
  requestToJoinGroup: (studentId: string, groupId: string) => Promise<boolean>;
  hasPendingRequest: (studentId: string, groupId: string) => Promise<boolean>;
  getAvailableStudents: () => Student[];
  getStudentById: (id: string) => Student | undefined;
  getGroupById: (id: string) => Group | undefined;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export const GroupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [studentsRes, groupsRes] = await Promise.all([
        supabase.from('students').select('*'),
        supabase.from('groups').select('*')
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (groupsRes.error) throw groupsRes.error;

      const mappedStudents: Student[] = (studentsRes.data || []).map(s => ({
        id: s.id,
        name: s.name,
        studentId: s.student_id,
        section: s.section as Section,
        groupId: s.group_id || undefined,
        indexNumber: s.index_number || undefined
      }));

      const mappedGroups: Group[] = (groupsRes.data || []).map(g => ({
        id: g.id,
        name: g.name,
        createdBy: g.created_by,
        leaderId: g.leader_id || undefined,
        members: mappedStudents.filter(s => s.groupId === g.id)
      }));

      setStudents(mappedStudents);
      setGroups(mappedGroups);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and realtime subscription
  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Update currentStudent when students change
  useEffect(() => {
    if (currentStudent) {
      const updated = students.find(s => s.id === currentStudent.id);
      if (updated && (updated.groupId !== currentStudent.groupId)) {
        setCurrentStudent(updated);
      }
    }
  }, [students, currentStudent]);

  const addStudent = useCallback(async (name: string, studentId: string, section: Section, pin: string): Promise<{ student: Student; requiresPinChange: boolean } | { error: string } | null> => {
    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      return { error: 'PIN must be exactly 4 digits.' };
    }

    // Helper function to normalize name by removing MISS/MR. prefix
    const normalizeName = (n: string) => {
      return n.toLowerCase().replace(/^(miss\s+|mr\.\s*)/i, '').trim();
    };

    // Students sign in with their last name only. Accept the full name too,
    // so nobody gets locked out by typing more than asked.
    const matchesStoredName = (entered: string, stored: string) => {
      const enteredNorm = normalizeName(entered).replace(/\s+/g, ' ');
      const storedNorm = normalizeName(stored).replace(/\s+/g, ' ');
      const storedLast = storedNorm.split(' ').pop() ?? '';
      return enteredNorm === storedLast || enteredNorm === storedNorm;
    };

    // Try to fetch from database first to check if student exists (case-insensitive)
    const { data: existingData } = await supabase
      .from('students')
      .select('*')
      .ilike('student_id', studentId)
      .maybeSingle();

    if (existingData) {
      // Student exists in DB - validate credentials
      // For PIN: treat NULL in database as "0000" (default PIN for first-time login)
      const storedPin = existingData.pin || '0000';
      
      // Compare last names (full name also accepted), without MISS/MR. prefix
      if (!matchesStoredName(name, existingData.name) ||
          existingData.section !== section ||
          storedPin !== pin) {
        return { error: 'Login failed. Last Name, Student ID, Section, or PIN does not match our records.' };
      }
      const student: Student = {
        id: existingData.id,
        name: existingData.name,
        studentId: existingData.student_id,
        section: existingData.section as Section,
        groupId: existingData.group_id || undefined
      };
      // Check if PIN is default (null or "0000") and requires change
      const requiresPinChange = !existingData.pin || existingData.pin === '0000';
      // Only set currentStudent if PIN change is not required
      if (!requiresPinChange) {
        setCurrentStudent(student);
      }
      return { student, requiresPinChange };
    }

    // Student ID not found - do not allow new registrations
    return { error: 'Student ID not found. Please check your Student ID and try again. Contact your teacher if you believe this is an error.' };
  }, []);

  const updateStudentPin = useCallback(async (studentId: string, newPin: string): Promise<boolean> => {
    const { error } = await supabase
      .from('students')
      .update({ pin: newPin })
      .eq('id', studentId);

    if (error) {
      console.error('Error updating PIN:', error);
      return false;
    }
    return true;
  }, []);

  const createGroup = useCallback(async (name: string, creatorId: string): Promise<Group | null> => {
    const { data, error } = await supabase
      .from('groups')
      .insert({ name, created_by: creatorId })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      return null;
    }

    // Update creator's group_id
    await supabase
      .from('students')
      .update({ group_id: data.id })
      .eq('id', creatorId);

    const creator = students.find(s => s.id === creatorId);
    const newGroup: Group = {
      id: data.id,
      name: data.name,
      createdBy: data.created_by,
      members: creator ? [{ ...creator, groupId: data.id }] : []
    };

    return newGroup;
  }, [students]);

  const joinGroup = useCallback(async (studentId: string, groupId: string): Promise<boolean> => {
    // Fetch fresh group data to check member count
    const { data: groupMembers } = await supabase
      .from('students')
      .select('id')
      .eq('group_id', groupId);
    
    if (groupMembers && groupMembers.length >= 4) return false;

    // Fetch fresh student data to check if already in a group
    const { data: studentData } = await supabase
      .from('students')
      .select('group_id')
      .eq('id', studentId)
      .maybeSingle();
    
    if (!studentData || studentData.group_id) return false;

    const { error } = await supabase
      .from('students')
      .update({ group_id: groupId })
      .eq('id', studentId);

    if (error) {
      console.error('Error joining group:', error);
      return false;
    }

    return true;
  }, []);

  const leaveGroup = useCallback(async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student?.groupId) return;

    const groupId = student.groupId;
    const group = groups.find(g => g.id === groupId);

    const { error } = await supabase
      .from('students')
      .update({ group_id: null })
      .eq('id', studentId);

    if (error) {
      console.error('Error leaving group:', error);
      return;
    }

    // Delete group if it's now empty
    if (group && group.members.length <= 1) {
      await supabase.from('groups').delete().eq('id', groupId);
    }
  }, [students, groups]);

  const addMemberToGroup = useCallback(async (studentId: string, groupId: string): Promise<boolean> => {
    return joinGroup(studentId, groupId);
  }, [joinGroup]);

  const setGroupLeader = useCallback(async (groupId: string, leaderId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('groups')
      .update({ leader_id: leaderId })
      .eq('id', groupId);

    if (error) {
      console.error('Error setting group leader:', error);
      return false;
    }
    return true;
  }, []);

  const requestToJoinGroup = useCallback(async (studentId: string, groupId: string): Promise<boolean> => {
    // Check if there's already a pending request
    const { data: existing } = await supabase
      .from('join_requests')
      .select('id')
      .eq('student_id', studentId)
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return false; // Request already exists
    }

    const { error } = await supabase
      .from('join_requests')
      .insert({ student_id: studentId, group_id: groupId });

    if (error) {
      console.error('Error creating join request:', error);
      return false;
    }

    return true;
  }, []);

  const hasPendingRequest = useCallback(async (studentId: string, groupId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('join_requests')
      .select('id')
      .eq('student_id', studentId)
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .maybeSingle();

    return !!data;
  }, []);

  const getAvailableStudents = useCallback(() => {
    return students.filter(s => !s.groupId);
  }, [students]);

  const getStudentById = useCallback((id: string) => {
    return students.find(s => s.id === id);
  }, [students]);

  const getGroupById = useCallback((id: string) => {
    return groups.find(g => g.id === id);
  }, [groups]);

  return (
    <GroupContext.Provider value={{
      students,
      groups,
      currentStudent,
      loading,
      refetchData: fetchData,
      addStudent,
      updateStudentPin,
      setCurrentStudent,
      createGroup,
      joinGroup,
      leaveGroup,
      addMemberToGroup,
      setGroupLeader,
      requestToJoinGroup,
      hasPendingRequest,
      getAvailableStudents,
      getStudentById,
      getGroupById,
    }}>
      {children}
    </GroupContext.Provider>
  );
};

export const useGroups = () => {
  const context = useContext(GroupContext);
  if (!context) throw new Error('useGroups must be used within GroupProvider');
  return context;
};