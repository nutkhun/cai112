import { SECTIONS } from '@/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { useGroups } from '@/context/GroupContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { 
  Download, 
  Users, 
  User,
  ArrowLeft, 
  Crown, 
  UserCheck, 
  UsersRound, 
  FileText, 
  Search,
  Calendar,
  ExternalLink,
  ArrowUpDown,
  Filter,
  X,
  UserPlus,
  UserMinus,
  MoreHorizontal,
  ClipboardCheck,
  Save,
  KeyRound,
  Plus,
  Trash2,
  CheckSquare,
  MessageSquare,
  MessageCircle,
  Upload,
  FolderOpen,
  Check,
  StickyNote,
  Copy,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/backend/client';
import { AbsenceRequestsTab } from './AbsenceRequestsTab';
import { TeacherMessagesTab } from './TeacherMessagesTab';
import { TeacherMaterialsTab } from './TeacherMaterialsTab';
import { TeacherChatMonitorTab } from './TeacherChatMonitorTab';
import { TeacherDueDatesTab } from './TeacherDueDatesTab';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { RubricScoringDialog } from './RubricScoringDialog';
import { GroupNoteDialog } from './GroupNoteDialog';
import { useDataSync } from '@/hooks/useDataSync';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// Keep this array stable to prevent re-subscribing / re-fetch loops.
// Note: students/groups are refreshed via GroupContext realtime + refetchData().
// Grades are intentionally excluded to avoid realtime bursts during bulk grading.
const TEACHER_DASHBOARD_SYNC_TABLES: string[] = ['assignments', 'absence_requests'];

interface TeacherDashboardProps {
  onSwitchView: () => void;
}

interface Assignment {
  id: string;
  group_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
  assignment_type: 'group' | 'individual';
}

interface Grade {
  id: string;
  student_id: string;
  assignment_name: string;
  assignment_type: 'individual' | 'group';
  score: number;
  max_score: number;
}

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Failed to copy'),
    );
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 shrink-0 opacity-60 hover:opacity-100"
      title={`Copy ${label.toLowerCase()}`}
      onClick={handleCopy}
    >
      <Copy className="w-3.5 h-3.5" />
    </Button>
  );
};

export const TeacherDashboard = ({ onSwitchView }: TeacherDashboardProps) => {
  const { groups, students, getStudentById, joinGroup, leaveGroup, setGroupLeader, refetchData } = useGroups();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dueDatesList, setDueDatesList] = useState<{ assignment_name: string; due_date: string; section: string | null }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('students');

  // Data refresh function that fetches all data
  const refreshAllData = useCallback(async () => {
    await Promise.all([
      refetchData(),
      fetchAllAssignments(),
      fetchAllGrades(),
      fetchAbsenceCounts(),
      fetchUnreadMessages(),
      fetchDueDatesList()
    ]);
  }, [refetchData]);

  // Throttle refresh calls to avoid UI jitter when many realtime events arrive together.
  const refreshTimerRef = useRef<number | null>(null);
  const scheduleRefreshAllData = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshAllData();
    }, 250);
  }, [refreshAllData]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Use the data sync hook for automatic refresh + status indicator
  const { status: syncStatus, lastSyncTime, refresh: refreshSync, isRefreshing } = useDataSync({
    tables: TEACHER_DASHBOARD_SYNC_TABLES,
    onDataChange: scheduleRefreshAllData
  });

  
  // Student List filters
  const [studentSort, setStudentSort] = useState<'name' | 'id' | 'section' | 'group'>('name');
  const [studentSectionFilter, setStudentSectionFilter] = useState<string>('all');
  const [studentGroupFilter, setStudentGroupFilter] = useState<string>('all');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'grouped' | 'ungrouped'>('all');
  
  // Assignment filters
  const [assignmentSort, setAssignmentSort] = useState<'date' | 'name' | 'uploader' | 'type'>('date');
  const [assignmentTypeFilter, setAssignmentTypeFilter] = useState<'all' | 'group' | 'individual'>('all');
  const [assignmentNameFilter, setAssignmentNameFilter] = useState<string>('all');
  const [assignmentSectionFilter, setAssignmentSectionFilter] = useState<string>('all');
  const [assignmentGroupFilter, setAssignmentGroupFilter] = useState<string>('all');

  // Grading state
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradingInputs, setGradingInputs] = useState<Record<string, Record<string, string>>>({});
  const [gradingSectionFilter, setGradingSectionFilter] = useState<string>('all');
  const [gradingGroupFilter, setGradingGroupFilter] = useState<string>('all');
  const [gradingSearchQuery, setGradingSearchQuery] = useState('');
  const [gradingSort, setGradingSort] = useState<'name' | 'id' | 'section' | 'index'>('name');
  const [gradingMissingFilter, setGradingMissingFilter] = useState<string>('all');
  const [savingGrades, setSavingGrades] = useState(false);

  // Add student dialog state
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const [newStudentSection, setNewStudentSection] = useState<string>('457A');

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSection, setImportSection] = useState<string>('457A');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Bulk selection state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [bulkAssignGroupOpen, setBulkAssignGroupOpen] = useState(false);

  // Absence rate tracking
  const [absenceCounts, setAbsenceCounts] = useState<Record<string, number>>({});

  // Unread messages from students
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // Rubric scoring dialog state
  const [rubricDialogOpen, setRubricDialogOpen] = useState(false);
  const [rubricStudentId, setRubricStudentId] = useState<string>('');
  const [rubricStudentName, setRubricStudentName] = useState<string>('');
  const [rubricAssignmentType, setRubricAssignmentType] = useState<'Midterm Presentation' | 'Final Project'>('Midterm Presentation');

  // Group note dialog state
  const [groupNoteDialogOpen, setGroupNoteDialogOpen] = useState(false);
  const [groupNoteGroupId, setGroupNoteGroupId] = useState<string | null>(null);
  const [groupNoteGroupName, setGroupNoteGroupName] = useState<string>('');
  const [groupNoteCategory, setGroupNoteCategory] = useState<'general' | 'midterm' | 'final'>('general');
  const [groupNoteCategoryLabel, setGroupNoteCategoryLabel] = useState<string>('');
  const [groupNoteStudentId, setGroupNoteStudentId] = useState<string | null>(null);
  const [groupNoteStudentName, setGroupNoteStudentName] = useState<string>('');

  // Dropdown hover states
  const [studentsDropdownOpen, setStudentsDropdownOpen] = useState(false);
  const [academicsDropdownOpen, setAcademicsDropdownOpen] = useState(false);
  const [commsDropdownOpen, setCommsDropdownOpen] = useState(false);

  // Assignment score configurations
  const individualAssignmentScores: Record<string, number> = {
    'Assignment 1': 5,
    'Assignment 2': 5,
    'Assignment 3': 10,
    'Participation': 10,
  };
  const groupAssignmentScores: Record<string, number> = {
    'Midterm Presentation': 30,
    'Final Project': 40,
  };

  const zeroScoreRowClass = 'zero-score-row border-l-4 border-l-destructive';
  // Missing-score highlighting lives only in the Grading table, behind a toggle.
  const [highlightZeroScores, setHighlightZeroScores] = useState(false);

  // Click-to-sort on table headers. A non-null column overrides the sort
  // dropdown; picking from the dropdown clears it again.
  // Student list opens sorted by index number, low to high.
  const [studentSortCol, setStudentSortCol] = useState<string | null>('index');
  const [studentSortDir, setStudentSortDir] = useState<'asc' | 'desc'>('asc');
  const [gradingSortCol, setGradingSortCol] = useState<string | null>(null);
  const [gradingSortDir, setGradingSortDir] = useState<'asc' | 'desc'>('asc');

  const fetchUnreadMessages = async () => {
    const { count, error } = await supabase
      .from('teacher_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_type', 'student')
      .eq('is_read', false);

    if (!error && count !== null) {
      setUnreadMessageCount(count);
    }
  };

  // Note: Initial data fetch is handled by useDataSync hook
  // Real-time subscriptions are also handled by useDataSync for students, groups, assignments
  // We only need additional subscriptions for teacher_messages notification dot
  useEffect(() => {
    // Real-time subscription for teacher messages (to update notification dot)
    const messagesChannel = supabase
      .channel('teacher-messages-notification')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teacher_messages'
        },
        () => {
          fetchUnreadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  const fetchAbsenceCounts = async () => {
    const { data, error } = await supabase
      .from('absence_requests')
      .select('student_id')
      .eq('status', 'approved');

    if (!error && data) {
      const counts: Record<string, number> = {};
      data.forEach((request) => {
        counts[request.student_id] = (counts[request.student_id] || 0) + 1;
      });
      setAbsenceCounts(counts);
    }
  };

  const getAbsenceRate = (studentId: string): number => {
    const count = absenceCounts[studentId] || 0;
    return Math.round((count / 14) * 100);
  };

  const fetchAllAssignments = async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAssignments(data as Assignment[]);
    }
  };

  const fetchDueDatesList = async () => {
    const { data, error } = await supabase
      .from('assignment_due_dates')
      .select('*');
    if (!error && data) {
      setDueDatesList(data as { assignment_name: string; due_date: string; section: string | null }[]);
    }
  };

  const fetchAllGrades = async () => {
    const { data, error } = await supabase
      .from('grades')
      .select('*');

    if (!error && data) {
      const typedGrades = data as Grade[];
      setGrades(typedGrades);
      // Initialize grading inputs from existing grades
      const inputs: Record<string, Record<string, string>> = {};
      typedGrades.forEach((grade) => {
        if (!inputs[grade.student_id]) {
          inputs[grade.student_id] = {};
        }
        inputs[grade.student_id][grade.assignment_name] = grade.score.toString();
      });
      setGradingInputs(inputs);
    }
  };

  const handleGradeInputChange = (studentId: string, assignmentName: string, value: string, maxScore: number) => {
    // Validate input doesn't exceed max
    if (value !== '') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > maxScore) {
        toast.error(`Score cannot exceed ${maxScore}. Please enter a valid score.`);
        return;
      }
      if (!isNaN(numValue) && numValue < 0) {
        toast.error(`Score cannot be negative. Please enter a valid score.`);
        return;
      }
    }

    // Check if this is a group assignment
    const isGroupAssignment = assignmentName === 'Midterm Presentation' || assignmentName === 'Final Project';
    
    if (isGroupAssignment) {
      // Find the student's group
      const student = students.find(s => s.id === studentId);
      if (student?.groupId) {
        // Get all students in the same group
        const groupMembers = students.filter(s => s.groupId === student.groupId);
        
        // Update all group members with the same score
        setGradingInputs(prev => {
          const newInputs = { ...prev };
          groupMembers.forEach(member => {
            newInputs[member.id] = {
              ...(newInputs[member.id] || {}),
              [assignmentName]: value
            };
          });
          return newInputs;
        });
      } else {
        // Student not in a group, just update their score
        setGradingInputs(prev => ({
          ...prev,
          [studentId]: {
            ...(prev[studentId] || {}),
            [assignmentName]: value
          }
        }));
      }
    } else {
      // Individual assignment - only update this student
      setGradingInputs(prev => ({
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [assignmentName]: value
        }
      }));
    }
  };

  const saveGrade = async (studentId: string, assignmentName: string, assignmentType: 'individual' | 'group', maxScore: number) => {
    const inputValue = gradingInputs[studentId]?.[assignmentName];
    if (inputValue === undefined || inputValue === '') return;

    const score = parseFloat(inputValue);
    if (isNaN(score) || score < 0 || score > maxScore) {
      toast.error(`Score must be between 0 and ${maxScore}. Please enter a valid score.`);
      // Reset the input to empty
      setGradingInputs(prev => ({
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [assignmentName]: ''
        }
      }));
      return;
    }

    // Check if this is a group assignment
    const isGroupAssignment = assignmentName === 'Midterm Presentation' || assignmentName === 'Final Project';
    
    if (isGroupAssignment) {
      // Find the student's group
      const student = students.find(s => s.id === studentId);
      if (student?.groupId) {
        // Get all students in the same group
        const groupMembers = students.filter(s => s.groupId === student.groupId);
        
        // Save grade for all group members
        const gradesToUpsert = groupMembers.map(member => ({
          student_id: member.id,
          assignment_name: assignmentName,
          assignment_type: assignmentType,
          score: score,
          max_score: maxScore,
        }));

        const { error } = await supabase
          .from('grades')
          .upsert(gradesToUpsert, {
            onConflict: 'student_id,assignment_name'
          });

        if (error) {
          toast.error('Failed to save grade');
        } else {
          toast.success(`Score saved for all ${groupMembers.length} group members`);
          await fetchAllGrades();
        }
      } else {
        // Student not in a group
        const { error } = await supabase
          .from('grades')
          .upsert({
            student_id: studentId,
            assignment_name: assignmentName,
            assignment_type: assignmentType,
            score: score,
            max_score: maxScore,
          }, {
            onConflict: 'student_id,assignment_name'
          });

        if (error) {
          toast.error('Failed to save grade');
        } else {
          await fetchAllGrades();
        }
      }
    } else {
      // Individual assignment
      const { error } = await supabase
        .from('grades')
        .upsert({
          student_id: studentId,
          assignment_name: assignmentName,
          assignment_type: assignmentType,
          score: score,
          max_score: maxScore,
        }, {
          onConflict: 'student_id,assignment_name'
        });

      if (error) {
        toast.error('Failed to save grade');
      } else {
        await fetchAllGrades();
      }
    }
  };

  const saveAllGrades = async () => {
    setSavingGrades(true);
    const gradesToUpsert: {
      student_id: string;
      assignment_name: string;
      assignment_type: 'individual' | 'group';
      score: number;
      max_score: number;
    }[] = [];

    // Filter students by section if filter is applied
    const studentsToGrade = gradingSectionFilter === 'all' 
      ? students 
      : students.filter(s => s.section === gradingSectionFilter);

    studentsToGrade.forEach(student => {
      const studentInputs = gradingInputs[student.id];
      if (!studentInputs) return;

      // Individual assignments
      Object.entries(individualAssignmentScores).forEach(([name, maxScore]) => {
        const value = studentInputs[name];
        if (value !== undefined && value !== '') {
          const score = parseFloat(value);
          if (!isNaN(score) && score >= 0 && score <= maxScore) {
            gradesToUpsert.push({
              student_id: student.id,
              assignment_name: name,
              assignment_type: 'individual',
              score,
              max_score: maxScore,
            });
          }
        }
      });

      // Group assignments
      Object.entries(groupAssignmentScores).forEach(([name, maxScore]) => {
        const value = studentInputs[name];
        if (value !== undefined && value !== '') {
          const score = parseFloat(value);
          if (!isNaN(score) && score >= 0 && score <= maxScore) {
            gradesToUpsert.push({
              student_id: student.id,
              assignment_name: name,
              assignment_type: 'group',
              score,
              max_score: maxScore,
            });
          }
        }
      });
    });

    if (gradesToUpsert.length === 0) {
      toast.info('No grades to save');
      setSavingGrades(false);
      return;
    }

    const { error } = await supabase
      .from('grades')
      .upsert(gradesToUpsert, {
        onConflict: 'student_id,assignment_name'
      });

    if (error) {
      toast.error('Failed to save grades');
    } else {
      toast.success(`Saved ${gradesToUpsert.length} grades`);
      await fetchAllGrades();
    }
    setSavingGrades(false);
  };

  const getStudentGrade = (studentId: string, assignmentName: string): string => {
    return gradingInputs[studentId]?.[assignmentName] || '';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return '-';
    return groups.find(g => g.id === groupId)?.name || '-';
  };

  const getUploaderName = (uploaderId: string) => {
    const student = getStudentById(uploaderId);
    return student?.name || 'Unknown';
  };

  const getUploaderStudentId = (uploaderId: string) => {
    const student = getStudentById(uploaderId);
    return student?.studentId || '-';
  };

  const getUploaderSection = (uploaderId: string) => {
    const student = getStudentById(uploaderId);
    return student?.section || '-';
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  };

  const handleDownloadFile = async (assignment: Assignment) => {
    try {
      const { data, error } = await supabase.storage
        .from('group-assignments')
        .download(assignment.file_path);
      if (error || !data) throw error || new Error('Download failed');
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = assignment.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(`Download failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleDeleteAssignment = async (assignment: Assignment) => {
    if (!confirm(`Are you sure you want to delete "${assignment.file_name}"?`)) {
      return;
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('group-assignments')
      .remove([assignment.file_path]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignment.id);

    if (dbError) {
      toast.error('Failed to delete assignment');
      return;
    }

    // Also delete the corresponding grade if it's an individual assignment
    if (assignment.assignment_type === 'individual') {
      const assignmentPrefix = assignment.file_name.match(/^(Assignment \d)/)?.[1];
      if (assignmentPrefix) {
        await supabase
          .from('grades')
          .delete()
          .eq('student_id', assignment.uploaded_by)
          .eq('assignment_name', assignmentPrefix);
      }
    }

    toast.success('Assignment deleted');
    fetchAllAssignments();
  };

  const exportToExcel = (studentsToExport: typeof students) => {
    if (studentsToExport.length === 0) {
      toast.error('No students to export');
      return;
    }

    const data: Record<string, string>[] = [];
    
    studentsToExport.forEach((student) => {
      const studentGroup = groups.find(g => g.id === student.groupId);
      const details = getStudentAssignmentDetails(student.id, student.groupId);
      
      data.push({
        'Student Name': student.name,
        'Student ID': student.studentId,
        'Section': student.section,
        'Group': studentGroup?.name || 'Ungrouped',
        'Role': studentGroup && student.id === studentGroup.leaderId ? 'Leader' : studentGroup ? 'Member' : '-',
        'Submitted': details.submittedIndividual.concat(details.submittedGroup).join(', ') || '-',
        'Missed': details.missedIndividual.concat(details.missedGroup).join(', ') || '-',
        'Completion': `${details.completedCount}/${details.totalAssignments} (${details.percentage}%)`,
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    const colWidths = [
      { wch: 25 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 30 },
      { wch: 30 },
      { wch: 15 },
    ];
    worksheet['!cols'] = colWidths;

    // Use base64 data URL for sandbox compatibility
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`;
    
    const link = document.createElement('a');
    const datePrefix = format(new Date(), 'yyyy-MM-dd-HH-mm');
    link.href = dataUrl;
    link.download = `${datePrefix}-STUDENT-LIST.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    try {
      link.click();
    } catch (e) {
      window.open(dataUrl, '_blank');
    }
    
    document.body.removeChild(link);
    toast.success(`Exported ${studentsToExport.length} students to Excel`);
  };

  // Get groups available for a specific student (same section only)
  const getAvailableGroupsForStudent = (student: { section: string; groupId?: string }) => {
    return groups.filter(g => {
      // Get group section from first member
      const groupMembers = students.filter(s => s.groupId === g.id);
      if (groupMembers.length === 0) return false;
      if (groupMembers.length >= 4) return false; // Group is full
      const groupSection = groupMembers[0].section;
      return groupSection === student.section && g.id !== student.groupId;
    });
  };

  // Handle assigning student to a group
  const handleAssignToGroup = async (studentId: string, groupId: string) => {
    const success = await joinGroup(studentId, groupId);
    if (success) {
      const group = groups.find(g => g.id === groupId);
      toast.success(`Student assigned to ${group?.name || 'group'}`);
    } else {
      toast.error('Failed to assign student to group');
    }
  };

  // Handle removing student from group
  const handleRemoveFromGroup = async (studentId: string) => {
    await leaveGroup(studentId);
    toast.success('Student removed from group');
  };

  // Handle setting group leader
  const handleSetLeader = async (groupId: string, studentId: string) => {
    const success = await setGroupLeader(groupId, studentId);
    if (success) {
      toast.success('Group leader updated');
    } else {
      toast.error('Failed to update group leader');
    }
  };

  // Handle resetting student PIN
  const handleResetPin = async (studentId: string, studentName: string) => {
    const { error } = await supabase
      .from('students')
      .update({ pin: '0000' })
      .eq('id', studentId);

    if (error) {
      toast.error('Failed to reset PIN');
    } else {
      toast.success(`PIN reset to 0000 for ${studentName}`);
    }
  };

  // Handle adding a new student
  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !newStudentId.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    const { error } = await supabase
      .from('students')
      .insert({
        name: newStudentName.trim(),
        student_id: newStudentId.trim(),
        section: newStudentSection,
        pin: '0000'
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('Student ID already exists');
      } else {
        toast.error('Failed to add student');
      }
    } else {
      toast.success(`${newStudentName} added successfully`);
      setAddStudentOpen(false);
      setNewStudentName('');
      setNewStudentId('');
      setNewStudentSection('457A');
      // Trigger data refresh
      refreshSync();
    }
  };

  // Handle Excel import
  const handleExcelImport = async () => {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    setImporting(true);
    try {
      const data = await importFile.arrayBuffer();

      // University systems (e.g. BU's URSA) export "Excel" files that are
      // really HTML pages, often in Thai TIS-620 encoding. SheetJS reads
      // those as meaningless text lines, so give HTML its own parsing path.
      const sniff = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 4096));
      const looksLikeHtml = /^\s*</.test(sniff) && /<(!doctype|html|head|body|table)/i.test(sniff);

      let jsonData: Record<string, any>[];

      if (looksLikeHtml) {
        // Honour the file's declared charset; TIS-620 decodes via its
        // windows-874 superset, which browsers support.
        let charset = (sniff.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
        if (charset === 'tis-620' || charset === 'iso-8859-11') charset = 'windows-874';
        let text: string;
        try {
          text = new TextDecoder(charset).decode(data);
        } catch {
          text = new TextDecoder().decode(data);
        }

        // Collect every table row in the document - URSA splits the student
        // list across many single-row tables, so read them all as one list.
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const rows = Array.from(doc.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('td,th')).map((c) =>
            (c.textContent || '').replace(/ /g, ' ').trim()
          )
        );

        const headerIdx = rows.findIndex(
          (r) => r.some((c) => /student\s*_?\s*id/i.test(c)) && r.some((c) => /name/i.test(c))
        );
        if (headerIdx === -1) {
          toast.error('Could not find a header row with "Student ID" and "Name" in the file.');
          setImporting(false);
          return;
        }
        const headers = rows[headerIdx];
        jsonData = rows
          .slice(headerIdx + 1)
          .filter((r) => r.some((c) => c) && !r.some((c) => /student\s*_?\s*id/i.test(c)))
          .map((r) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => {
              if (h) obj[h] = r[i] ?? '';
            });
            return obj;
          });
      } else {
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
      }

      if (jsonData.length === 0) {
        toast.error('No data found in the Excel file');
        setImporting(false);
        return;
      }

      // Find column by exact key match first, then pattern match
      const findColumn = (row: Record<string, any>, exactKeys: string[], patterns: string[]): any => {
        const keys = Object.keys(row);
        
        // First try exact match (case-insensitive)
        for (const key of keys) {
          const lowerKey = key.toLowerCase().trim();
          if (exactKeys.includes(lowerKey)) {
            return row[key];
          }
        }
        
        // Then try pattern matching
        for (const key of keys) {
          const lowerKey = key.toLowerCase().trim();
          if (patterns.some(p => lowerKey.includes(p) || p.includes(lowerKey))) {
            return row[key];
          }
        }
        return null;
      };

      const studentsToInsert: { name: string; student_id: string; section: string; pin: string; index_number: number | null }[] = [];

      jsonData.forEach((row, idx) => {
        // Match exact column names from user's Excel: 'Student ID', 'Name', 'Index', 'Section'
        const name = findColumn(row, ['name'], ['full name', 'student name', 'ชื่อ']);
        const studentId = findColumn(row, ['student id'], ['studentid', 'student_id', 'รหัส']);
        const indexNumber = findColumn(row, ['index'], ['index number', 'index_number', 'no', 'no.', 'เลขที่', '#']);

        if (name && studentId && /\d/.test(String(studentId))) {
          // Normalize student ID (remove dashes), keep name with prefix intact
          const normalizedId = String(studentId).replace(/-/g, '').trim();
          const fullName = String(name).trim(); // Preserves prefixes like MISS, MR., etc.
          
          studentsToInsert.push({
            name: fullName,
            student_id: normalizedId,
            section: importSection,
            pin: '0000',
            index_number: indexNumber ? parseInt(String(indexNumber)) : null
          });
        }
      });

      if (studentsToInsert.length === 0) {
        toast.error('Could not find valid student data. Ensure columns have "name" and "id" headers.');
        setImporting(false);
        return;
      }

      // Insert students (upsert to handle duplicates)
      const { error } = await supabase
        .from('students')
        .upsert(studentsToInsert, {
          onConflict: 'student_id',
          ignoreDuplicates: false
        });

      if (error) {
        toast.error(`Import failed: ${error.message}`);
      } else {
        toast.success(`Imported ${studentsToInsert.length} students to section ${importSection}`);
        setImportDialogOpen(false);
        setImportFile(null);
        // Trigger data refresh
        refreshSync();
      }
    } catch (err) {
      toast.error('Failed to parse Excel file');
    }
    setImporting(false);
  };

  // Handle deleting a student
  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    // First remove from group if in one
    const student = students.find(s => s.id === studentId);
    if (student?.groupId) {
      await leaveGroup(studentId);
    }

    // Delete related data first
    await supabase.from('grades').delete().eq('student_id', studentId);
    await supabase.from('group_invitations').delete().or(`inviter_id.eq.${studentId},invitee_id.eq.${studentId}`);
    await supabase.from('join_requests').delete().eq('student_id', studentId);
    await supabase.from('group_messages').delete().eq('sender_id', studentId);
    await supabase.from('assignments').delete().eq('uploaded_by', studentId);

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (error) {
      toast.error('Failed to delete student');
    } else {
      toast.success(`${studentName} deleted successfully`);
      // Trigger data refresh
      refreshSync();
    }
  };

  // Bulk selection handlers
  const toggleSelectStudent = (studentId: string) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === sortedStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(sortedStudents.map(s => s.id)));
    }
  };

  const clearSelection = () => {
    setSelectedStudents(new Set());
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedStudents.size === 0) return;
    
    const selectedList = Array.from(selectedStudents);
    let successCount = 0;
    
    for (const studentId of selectedList) {
      const student = students.find(s => s.id === studentId);
      if (student) {
        if (student.groupId) {
          await leaveGroup(studentId);
        }
        await supabase.from('grades').delete().eq('student_id', studentId);
        await supabase.from('group_invitations').delete().or(`inviter_id.eq.${studentId},invitee_id.eq.${studentId}`);
        await supabase.from('join_requests').delete().eq('student_id', studentId);
        await supabase.from('group_messages').delete().eq('sender_id', studentId);
        await supabase.from('assignments').delete().eq('uploaded_by', studentId);
        
        const { error } = await supabase.from('students').delete().eq('id', studentId);
        if (!error) successCount++;
      }
    }
    
    toast.success(`Deleted ${successCount} student(s)`);
    clearSelection();
    // Trigger data refresh
    refreshSync();
  };

  const handleBulkResetPin = async () => {
    if (selectedStudents.size === 0) return;
    
    const { error } = await supabase
      .from('students')
      .update({ pin: '0000' })
      .in('id', Array.from(selectedStudents));

    if (error) {
      toast.error('Failed to reset PINs');
    } else {
      toast.success(`Reset PIN to 0000 for ${selectedStudents.size} student(s)`);
      clearSelection();
      // Trigger data refresh
      refreshSync();
    }
  };

  const handleBulkUnassignFromGroup = async () => {
    if (selectedStudents.size === 0) return;
    
    const studentsInGroups = Array.from(selectedStudents).filter(id => {
      const student = students.find(s => s.id === id);
      return student?.groupId;
    });
    
    if (studentsInGroups.length === 0) {
      toast.error('No selected students are in groups');
      return;
    }
    
    for (const studentId of studentsInGroups) {
      await leaveGroup(studentId);
    }
    
    toast.success(`Removed ${studentsInGroups.length} student(s) from groups`);
    clearSelection();
    // Trigger data refresh
    refreshSync();
  };

  const handleBulkAssignToGroup = async (groupId: string) => {
    if (selectedStudents.size === 0) return;
    
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    // Get current group member count
    const currentMembers = students.filter(s => s.groupId === groupId).length;
    const availableSlots = 5 - currentMembers;
    
    // Filter to only ungrouped students
    const ungroupedSelected = Array.from(selectedStudents).filter(id => {
      const student = students.find(s => s.id === id);
      return student && !student.groupId;
    });
    
    if (ungroupedSelected.length === 0) {
      toast.error('No ungrouped students selected');
      return;
    }
    
    if (ungroupedSelected.length > availableSlots) {
      toast.error(`Group only has ${availableSlots} available slot(s)`);
      return;
    }
    
    let successCount = 0;
    for (const studentId of ungroupedSelected) {
      const success = await joinGroup(studentId, groupId);
      if (success) successCount++;
    }
    
    toast.success(`Assigned ${successCount} student(s) to ${group.name}`);
    setBulkAssignGroupOpen(false);
    clearSelection();
    // Trigger data refresh
    refreshSync();
  };

  // Get available groups for bulk assignment (check if any selected ungrouped students can join)
  const getAvailableGroupsForBulkAssign = () => {
    const selectedStudentsList = Array.from(selectedStudents)
      .map(id => students.find(s => s.id === id))
      .filter(s => s && !s.groupId);
    
    if (selectedStudentsList.length === 0) return [];
    
    // Get sections of selected ungrouped students
    const selectedSections = new Set(selectedStudentsList.map(s => s?.section));
    
    return groups.filter(g => {
      const groupMembers = students.filter(s => s.groupId === g.id);
      if (groupMembers.length >= 4) return false;
      if (groupMembers.length === 0) return false;
      const groupSection = groupMembers[0].section;
      return selectedSections.has(groupSection);
    });
  };

  // Export grades to Excel
  const exportGradesToExcel = () => {
    // Apply the same filters and sorting as the grading table
    const filteredAndSortedStudents = [...students]
      .filter(s => {
        const matchesSearch = 
          s.name.toLowerCase().includes(gradingSearchQuery.toLowerCase()) ||
          s.studentId.toLowerCase().includes(gradingSearchQuery.toLowerCase());
        const matchesSection = gradingSectionFilter === 'all' || s.section === gradingSectionFilter;
        const matchesGroup = gradingGroupFilter === 'all' || 
          (gradingGroupFilter === 'ungrouped' ? !s.groupId : s.groupId === gradingGroupFilter);
        return matchesSearch && matchesSection && matchesGroup && matchesMissingFilter(s.id, s.groupId || null);
      })
      .sort((a, b) => (a.indexNumber ?? Number.MAX_SAFE_INTEGER) - (b.indexNumber ?? Number.MAX_SAFE_INTEGER));
    
    const data = filteredAndSortedStudents.map(student => {
      const studentGroup = groups.find(g => g.id === student.groupId);
      const a1 = parseFloat(getStudentGrade(student.id, 'Assignment 1')) || 0;
      const a2 = parseFloat(getStudentGrade(student.id, 'Assignment 2')) || 0;
      const a3 = parseFloat(getStudentGrade(student.id, 'Assignment 3')) || 0;
      const participation = parseFloat(getStudentGrade(student.id, 'Participation')) || 0;
      const midterm = parseFloat(getStudentGrade(student.id, 'Midterm Presentation')) || 0;
      const final = parseFloat(getStudentGrade(student.id, 'Final Project')) || 0;
      const totalIndividual = a1 + a2 + participation;
      const totalGroup = a3 + midterm + final;
      const grandTotal = totalIndividual + totalGroup;

      return {
        'Index': student.indexNumber || '',
        'Student Name': student.name,
        'Student ID': student.studentId,
        'Section': student.section,
        'Group': studentGroup?.name || 'Ungrouped',
        'Participation (10)': participation,
        'Assignment 1 (5)': a1,
        'Assignment 2 (5)': a2,
        'Assignment 3 (10)': a3,
        'Midterm Presentation (30)': midterm,
        'Final Project (40)': final,
        'Grand Total (100)': grandTotal,
        'Percentage': `${((grandTotal / 100) * 100).toFixed(1)}%`
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Grades');

    const colWidths = [
      { wch: 8 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 12 }
    ];
    worksheet['!cols'] = colWidths;

    // Use base64 data URL for sandbox compatibility
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`;
    
    const link = document.createElement('a');
    const datePrefix = format(new Date(), 'yyyy-MM-dd-HH-mm');
    link.href = dataUrl;
    link.download = `${datePrefix}-STUDENT-GRADES.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    try {
      link.click();
    } catch (e) {
      window.open(dataUrl, '_blank');
    }
    
    document.body.removeChild(link);
    toast.success(`Exported grades for ${filteredAndSortedStudents.length} students to Excel`);
  };

  // Export simplified grades (NO/FULLID/NAME/PARTI/ASSGN/PRESENT/FINALP)
  const exportSimpleGradesToExcel = () => {
    const filteredAndSortedStudents = [...students]
      .filter(s => {
        const matchesSearch =
          s.name.toLowerCase().includes(gradingSearchQuery.toLowerCase()) ||
          s.studentId.toLowerCase().includes(gradingSearchQuery.toLowerCase());
        const matchesSection = gradingSectionFilter === 'all' || s.section === gradingSectionFilter;
        const matchesGroup = gradingGroupFilter === 'all' ||
          (gradingGroupFilter === 'ungrouped' ? !s.groupId : s.groupId === gradingGroupFilter);
        return matchesSearch && matchesSection && matchesGroup && matchesMissingFilter(s.id, s.groupId || null);
      })
      .sort((a, b) => (a.indexNumber ?? Number.MAX_SAFE_INTEGER) - (b.indexNumber ?? Number.MAX_SAFE_INTEGER));

    const data = filteredAndSortedStudents.map(student => {
      const a1 = parseFloat(getStudentGrade(student.id, 'Assignment 1')) || 0;
      const a2 = parseFloat(getStudentGrade(student.id, 'Assignment 2')) || 0;
      const a3 = parseFloat(getStudentGrade(student.id, 'Assignment 3')) || 0;
      const participation = parseFloat(getStudentGrade(student.id, 'Participation')) || 0;
      const midterm = parseFloat(getStudentGrade(student.id, 'Midterm Presentation')) || 0;
      const final = parseFloat(getStudentGrade(student.id, 'Final Project')) || 0;
      return {
        'NO': student.indexNumber || '',
        'FULLID': student.studentId,
        'NAME': student.name,
        'PARTI': participation,
        'ASSGN': a1 + a2 + a3,
        'PRESENT': midterm,
        'FINALP': final,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Grades');
    worksheet['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }];

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`;
    const link = document.createElement('a');
    const datePrefix = format(new Date(), 'yyyy-MM-dd-HH-mm');
    link.href = dataUrl;
    link.download = `${datePrefix}-GRADES.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    try { link.click(); } catch (e) { window.open(dataUrl, '_blank'); }
    document.body.removeChild(link);
    toast.success(`Exported grades for ${filteredAndSortedStudents.length} students`);
  };

  const studentsInGroups = students.filter(s => s.groupId).length;
  const ungroupedStudents = students.filter(s => !s.groupId).length;

  // Per-section headcounts for the stats row.
  const sectionCounts = ['457A', '458A', '458B'].map(sec => ({
    section: sec,
    count: students.filter(s => s.section === sec).length,
  }));

  // Distinct students covered by a Midterm/Final submission: a group upload
  // covers every member of that group, an individual upload only the uploader.
  const handedInCount = (label: string) => {
    const covered = new Set<string>();
    assignments
      .filter(a => a.file_name.includes(label))
      .forEach(a => {
        if (a.assignment_type === 'group' && a.group_id) {
          groups.find(g => g.id === a.group_id)?.members.forEach(m => covered.add(m.id));
        } else if (a.uploaded_by) {
          covered.add(a.uploaded_by);
        }
      });
    return covered.size;
  };
  const midtermHandedIn = handedInCount('Midterm Presentation');
  const finalHandedIn = handedInCount('Final Project');

  // Late policy: 10% of the score deducted per started week past the due date.
  const getLateInfo = (student: Student, assignmentName: string) => {
    const due = dueDatesList.find(
      d => d.assignment_name === assignmentName && (!d.section || d.section === student.section)
    );
    if (!due) return null;
    // The whole due day still counts as on time.
    const deadline = new Date(due.due_date.slice(0, 10) + 'T23:59:59');
    const submission = assignments
      .filter(a => a.file_name.startsWith(assignmentName))
      .find(a =>
        a.uploaded_by === student.id ||
        (a.assignment_type === 'group' && !!a.group_id && a.group_id === student.groupId)
      );
    const reference = submission ? new Date(submission.created_at) : new Date();
    const msLate = reference.getTime() - deadline.getTime();
    if (msLate <= 0) return null;
    const daysLate = Math.ceil(msLate / 86400000);
    const weeksLate = Math.ceil(daysLate / 7);
    return {
      daysLate,
      weeksLate,
      deduction: Math.min(100, weeksLate * 10),
      submitted: !!submission,
    };
  };

  const lateHint = (student: Student, assignmentName: string) => {
    const info = getLateInfo(student, assignmentName);
    if (!info) return null;
    return (
      <p
        className="mt-0.5 text-[10px] font-medium leading-tight text-destructive"
        title={`${info.submitted ? 'Submitted' : 'Still missing'} ${info.daysLate} day${info.daysLate === 1 ? '' : 's'} past the due date. Policy: -10% per started week -> deduct ${info.deduction}% of the score.`}
      >
        {info.submitted ? '' : 'missing · '}{info.weeksLate}w late −{info.deduction}%
      </p>
    );
  };

  // Get unique sections from students
  const sections = [...SECTIONS];

  // Filter and sort students
  const filteredStudents = students.filter(student => {
    const q = searchQuery.trim().toLowerCase();
    const groupName = groups.find(g => g.id === student.groupId)?.name || '';
    const haystack = [
      student.name,
      student.studentId,
      student.section,
      groupName,
      student.indexNumber?.toString() ?? '',
    ].join(' ').toLowerCase();
    const matchesSearch = q === '' || haystack.includes(q);
    
    const matchesSection = studentSectionFilter === 'all' || student.section === studentSectionFilter;
    
    const matchesGroup = studentGroupFilter === 'all' || 
      (studentGroupFilter === 'ungrouped' ? !student.groupId : student.groupId === studentGroupFilter);
    
    const matchesStatus = studentStatusFilter === 'all' ||
      (studentStatusFilter === 'grouped' ? !!student.groupId : !student.groupId);
    
    return matchesSearch && matchesSection && matchesGroup && matchesStatus;
  });

  // Shared column accessor for header-click sorting in both tables.
  const columnSortValue = (s: Student, col: string): string | number => {
    const grade = (type: string) => parseFloat(getStudentGrade(s.id, type)) || 0;
    switch (col) {
      case 'index': return s.indexNumber ?? Number.MAX_SAFE_INTEGER;
      case 'name': return s.name;
      case 'id': return s.studentId;
      case 'section': return s.section;
      case 'group': return getGroupName(s.groupId) || '￿'; // ungrouped last
      case 'role': {
        const g = groups.find(gr => gr.id === s.groupId);
        return g ? (s.id === g.leaderId ? 'Leader' : 'Member') : '￿';
      }
      case 'participation': return grade('Participation');
      case 'a1': return grade('Assignment 1');
      case 'a2': return grade('Assignment 2');
      case 'a3': return grade('Assignment 3');
      case 'midterm': return grade('Midterm Presentation');
      case 'final': return grade('Final Project');
      case 'total':
        return grade('Assignment 1') + grade('Assignment 2') + grade('Assignment 3') +
          grade('Participation') + grade('Midterm Presentation') + grade('Final Project');
      case 'absence': return getAbsenceRate(s.id);
      default: return '';
    }
  };

  const compareByColumn = (a: Student, b: Student, col: string, dir: 'asc' | 'desc') => {
    const va = columnSortValue(a, col);
    const vb = columnSortValue(b, col);
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb));
    return (dir === 'asc' ? cmp : -cmp) || a.name.localeCompare(b.name);
  };

  const toggleSort = (
    col: string,
    activeCol: string | null,
    setCol: (c: string | null) => void,
    setDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  ) => {
    if (activeCol === col) {
      setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCol(col);
      setDir('asc');
    }
  };

  const SortHead = ({ label, col, activeCol, dir, onSort, className, title }: {
    label: string; col: string; activeCol: string | null; dir: 'asc' | 'desc';
    onSort: (col: string) => void; className?: string; title?: string;
  }) => (
    <TableHead
      className={`font-semibold cursor-pointer select-none ${className || ''}`}
      title={title}
      onClick={() => onSort(col)}
      aria-sort={activeCol === col ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {activeCol === col
          ? (dir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </TableHead>
  );

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (studentSortCol) return compareByColumn(a, b, studentSortCol, studentSortDir);
    switch (studentSort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'id':
        return a.studentId.localeCompare(b.studentId);
      case 'section':
        return a.section.localeCompare(b.section);
      case 'group':
        const groupA = getGroupName(a.groupId);
        const groupB = getGroupName(b.groupId);
        return groupA.localeCompare(groupB);
      default:
        return 0;
    }
  });

  // Individual assignment types (3 total)
  const individualAssignmentTypes = ['Assignment 1', 'Assignment 2', 'Assignment 3', 'Participation'];
  // Group assignment types (2 total)
  const groupAssignmentTypes = ['Midterm Presentation', 'Final Project'];

  // Get detailed assignment info for a student
  const getStudentAssignmentDetails = (studentId: string, groupId: string | null) => {
    const studentAssignments = assignments.filter(a => a.uploaded_by === studentId);
    
    // Check which individual assignments were submitted (by filename prefix)
    const submittedIndividual = individualAssignmentTypes.filter(type => 
      studentAssignments.some(a => a.file_name.startsWith(type) && a.assignment_type === 'individual')
    );
    const missedIndividual = individualAssignmentTypes.filter(type => !submittedIndividual.includes(type));
    
    // Count individual assignments without standard prefixes (legacy/unclassified)
    const unclassifiedIndividual = studentAssignments.filter(a => 
      a.assignment_type === 'individual' && 
      !individualAssignmentTypes.some(type => a.file_name.startsWith(type))
    );
    
    // Check which group assignments were submitted (by any group member if student is in a group)
    let submittedGroup: string[] = [];
    let missedGroup: string[] = [];
    let unclassifiedGroup: Assignment[] = [];
    
    if (groupId) {
      const groupAssignments = assignments.filter(a => a.group_id === groupId && a.assignment_type === 'group');
      submittedGroup = groupAssignmentTypes.filter(type =>
        groupAssignments.some(a => a.file_name.startsWith(type))
      );
      missedGroup = groupAssignmentTypes.filter(type => !submittedGroup.includes(type));
      
      // Count group assignments without standard prefixes
      unclassifiedGroup = groupAssignments.filter(a => 
        !groupAssignmentTypes.some(type => a.file_name.startsWith(type))
      );
    } else {
      missedGroup = [...groupAssignmentTypes]; // All missed if no group
    }
    
    const totalAssignments = individualAssignmentTypes.length + groupAssignmentTypes.length; // 6 total
    const classifiedCount = submittedIndividual.length + submittedGroup.length;
    const unclassifiedCount = unclassifiedIndividual.length + unclassifiedGroup.length;
    const completedCount = classifiedCount + Math.min(unclassifiedCount, missedIndividual.length + missedGroup.length);
    const percentage = Math.round((completedCount / totalAssignments) * 100);
    
    return {
      submittedIndividual,
      missedIndividual,
      submittedGroup,
      missedGroup,
      unclassifiedIndividual: unclassifiedIndividual.length,
      unclassifiedGroup: unclassifiedGroup.length,
      completedCount,
      totalAssignments,
      percentage
    };
  };

  // Check whether a student matches the current "missing submission" filter
  const matchesMissingFilter = (studentId: string, groupId: string | null) => {
    if (gradingMissingFilter === 'all') return true;
    const details = getStudentAssignmentDetails(studentId, groupId);
    // An assignment counts as submitted if either a file was uploaded
    // OR the teacher has entered a grade for it.
    const hasGrade = (name: string) => {
      const v = getStudentGrade(studentId, name);
      return v !== '' && v !== undefined && v !== null && !isNaN(parseFloat(v));
    };
    const checkTypes = [
      ...individualAssignmentTypes.filter(t => t !== 'Participation'),
      ...groupAssignmentTypes,
    ];
    const submittedSet = new Set([
      ...details.submittedIndividual,
      ...details.submittedGroup,
    ]);
    const missingTypes = checkTypes.filter(t => !submittedSet.has(t) && !hasGrade(t));
    if (gradingMissingFilter === 'any') return missingTypes.length > 0;
    return missingTypes.includes(gradingMissingFilter);
  };

  // Get the same filtered + sorted student list shown in the Grading table
  const getFilteredGradingStudents = () => {
    return students
      .filter(s => {
        const q = gradingSearchQuery.trim().toLowerCase();
        const studentGroupName = groups.find(g => g.id === s.groupId)?.name || '';
        const participation = getStudentGrade(s.id, 'Participation');
        const a1 = getStudentGrade(s.id, 'Assignment 1');
        const a2 = getStudentGrade(s.id, 'Assignment 2');
        const a3 = getStudentGrade(s.id, 'Assignment 3');
        const midterm = getStudentGrade(s.id, 'Midterm Presentation');
        const final_ = getStudentGrade(s.id, 'Final Project');
        const totalVal =
          (parseFloat(a1) || 0) +
          (parseFloat(a2) || 0) +
          (parseFloat(a3) || 0) +
          (parseFloat(participation) || 0) +
          (parseFloat(midterm) || 0) +
          (parseFloat(final_) || 0);
        const haystack = [
          s.indexNumber?.toString() ?? '',
          s.name,
          s.studentId,
          s.section,
          studentGroupName,
          participation, a1, a2, a3, midterm, final_,
          totalVal.toString(),
        ].join(' ').toLowerCase();
        const matchesSearch = q === '' || haystack.includes(q);
        const matchesSection = gradingSectionFilter === 'all' || s.section === gradingSectionFilter;
        const matchesGroup = gradingGroupFilter === 'all' ||
          (gradingGroupFilter === 'ungrouped' ? !s.groupId : s.groupId === gradingGroupFilter);
        return matchesSearch && matchesSection && matchesGroup && matchesMissingFilter(s.id, s.groupId || null);
      })
      .sort((a, b) => {
        if (gradingSortCol) return compareByColumn(a, b, gradingSortCol, gradingSortDir);
        switch (gradingSort) {
          case 'index':
            return (a.indexNumber || 999) - (b.indexNumber || 999);
          case 'id':
            return a.studentId.localeCompare(b.studentId);
          case 'section':
            return a.section.localeCompare(b.section) || a.name.localeCompare(b.name);
          case 'name':
          default:
            return a.name.localeCompare(b.name);
        }
      });
  };

  const copyFilteredStudentIds = async () => {
    const list = getFilteredGradingStudents();
    if (list.length === 0) {
      toast.error('No students to copy');
      return;
    }
    const text = list.map(s => s.studentId).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${list.length} student ID${list.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Copy failed');
    }
  };

  // Filter and sort assignments
  const filteredAssignments = assignments.filter(assignment => {
    const uploader = getStudentById(assignment.uploaded_by);
    
    const matchesSearch = 
      assignment.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getUploaderName(assignment.uploaded_by).toLowerCase().includes(searchQuery.toLowerCase()) ||
      getGroupName(assignment.group_id).toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = assignmentTypeFilter === 'all' || assignment.assignment_type === assignmentTypeFilter;
    
    // Filter by specific assignment name (extracted from file name prefix)
    const matchesName = assignmentNameFilter === 'all' || 
      assignment.file_name.toLowerCase().startsWith(assignmentNameFilter.toLowerCase());
    
    const matchesSection = assignmentSectionFilter === 'all' || uploader?.section === assignmentSectionFilter;
    
    const matchesGroup = assignmentGroupFilter === 'all' || assignment.group_id === assignmentGroupFilter;
    
    return matchesSearch && matchesType && matchesName && matchesSection && matchesGroup;
  });

  const sortedAssignments = [...filteredAssignments].sort((a, b) => {
    switch (assignmentSort) {
      case 'date':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'name':
        return a.file_name.localeCompare(b.file_name);
      case 'uploader':
        return getUploaderName(a.uploaded_by).localeCompare(getUploaderName(b.uploaded_by));
      case 'type':
        return a.assignment_type.localeCompare(b.assignment_type);
      default:
        return 0;
    }
  });

  const clearStudentFilters = () => {
    setStudentSectionFilter('all');
    setStudentGroupFilter('all');
    setStudentStatusFilter('all');
  };

  const clearAssignmentFilters = () => {
    setAssignmentTypeFilter('all');
    setAssignmentNameFilter('all');
    setAssignmentSectionFilter('all');
    setAssignmentGroupFilter('all');
  };

  const hasStudentFilters = studentSectionFilter !== 'all' || studentGroupFilter !== 'all' || studentStatusFilter !== 'all';
  const hasAssignmentFilters = assignmentTypeFilter !== 'all' || assignmentNameFilter !== 'all' || assignmentSectionFilter !== 'all' || assignmentGroupFilter !== 'all';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border pt-safe">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="icon" onClick={onSwitchView} aria-label="Back to student view">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="p-2 rounded-xl bg-gradient-accent">
                <UsersRound className="w-5 h-5 text-accent-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display font-bold text-lg">Teacher Dashboard</h1>
                <p className="text-sm text-foreground font-bold">CAI112 - Student Management System (SMS)</p>
              </div>
            </div>

            {/* Dropdown Navigation.
                The teacher dashboard is desktop-first, but the nav row must not
                blow out the page on a narrow window - let it scroll instead.
                Radix renders the menus in a portal, so nothing gets clipped. */}
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto scroll-contain bg-muted/40 rounded-lg p-1">
              {/* Students Dropdown */}
              <div 
                onMouseEnter={() => setStudentsDropdownOpen(true)}
                onMouseLeave={() => setStudentsDropdownOpen(false)}
              >
                <DropdownMenu open={studentsDropdownOpen} onOpenChange={setStudentsDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`gap-1.5 transition-all duration-200 hover:bg-muted active:scale-95 ${
                        (activeTab === 'students' || activeTab === 'absence') 
                          ? 'text-primary font-medium' 
                          : 'text-muted-foreground'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span className="hidden sm:inline">Students</span>
                      {(activeTab === 'students' || activeTab === 'absence') && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="animate-scale-in min-w-[160px]">
                    <DropdownMenuItem 
                      onClick={() => setActiveTab('students')}
                      className={`gap-2 ${activeTab === 'students' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <Users className="w-4 h-4" />
                      Student List
                      {activeTab === 'students' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setActiveTab('absence')}
                      className={`gap-2 ${activeTab === 'absence' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <Calendar className="w-4 h-4" />
                      Absence
                      {activeTab === 'absence' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="w-px h-5 bg-border/50" />

              {/* Academics Dropdown */}
              <div 
                onMouseEnter={() => setAcademicsDropdownOpen(true)}
                onMouseLeave={() => setAcademicsDropdownOpen(false)}
              >
                <DropdownMenu open={academicsDropdownOpen} onOpenChange={setAcademicsDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`gap-1.5 transition-all duration-200 hover:bg-muted active:scale-95 ${
                        (activeTab === 'assignments' || activeTab === 'grading' || activeTab === 'materials' || activeTab === 'duedates') 
                          ? 'text-primary font-medium' 
                          : 'text-muted-foreground'
                      }`}
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span className="hidden sm:inline">Academics</span>
                      {(activeTab === 'assignments' || activeTab === 'grading' || activeTab === 'materials' || activeTab === 'duedates') && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="animate-scale-in min-w-[210px]">
                    <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                      Set up · you → students
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setActiveTab('materials')}
                      className={`gap-2 ${activeTab === 'materials' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <FolderOpen className="w-4 h-4" />
                      Briefs & Materials
                      {activeTab === 'materials' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setActiveTab('duedates')}
                      className={`gap-2 ${activeTab === 'duedates' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <Calendar className="w-4 h-4" />
                      Due Dates
                      {activeTab === 'duedates' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                      Review · students → you
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setActiveTab('assignments')}
                      className={`gap-2 ${activeTab === 'assignments' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <FileText className="w-4 h-4" />
                      Submissions
                      {activeTab === 'assignments' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setActiveTab('grading')}
                      className={`gap-2 ${activeTab === 'grading' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      Grading
                      {activeTab === 'grading' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="w-px h-5 bg-border/50" />

              {/* Communication Dropdown */}
              <div 
                onMouseEnter={() => setCommsDropdownOpen(true)}
                onMouseLeave={() => setCommsDropdownOpen(false)}
              >
                <DropdownMenu open={commsDropdownOpen} onOpenChange={setCommsDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`relative gap-1.5 transition-all duration-200 hover:bg-muted active:scale-95 ${
                        (activeTab === 'messages' || activeTab === 'chat') 
                          ? 'text-primary font-medium' 
                          : 'text-muted-foreground'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span className="hidden sm:inline">Comms</span>
                      {(activeTab === 'messages' || activeTab === 'chat') && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                      {unreadMessageCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="animate-scale-in min-w-[160px]">
                    <DropdownMenuItem 
                      onClick={() => setActiveTab('messages')}
                      className={`gap-2 ${activeTab === 'messages' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Messages
                      {unreadMessageCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">{unreadMessageCount}</Badge>
                      )}
                      {activeTab === 'messages' && unreadMessageCount === 0 && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setActiveTab('chat')}
                      className={`gap-2 ${activeTab === 'chat' ? 'bg-primary/10 text-primary font-medium' : ''}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      Chat Monitor
                      {activeTab === 'chat' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden">
              <TabsList className="hidden" />
            </Tabs>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} className="gap-1.5">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAddStudentOpen(true)} className="gap-1.5">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Student</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 pb-safe">
        {/* Minimized Stats Row */}
        <div className="flex flex-wrap items-center gap-3 mb-4 px-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-medium">{students.length}</span>
            <span className="text-muted-foreground">Students</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4 text-success" />
            <span className="font-medium">{studentsInGroups}</span>
            <span className="text-muted-foreground">Grouped</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-accent" />
            <span className="font-medium">{ungroupedStudents}</span>
            <span className="text-muted-foreground">Ungrouped</span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <div className="flex items-center gap-2 text-sm hidden sm:flex">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-medium">{assignments.filter(a => a.file_name.includes('Assignment 1')).length}</span>
            <span className="text-muted-foreground">A1</span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <div className="flex items-center gap-2 text-sm hidden sm:flex">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-medium">{assignments.filter(a => a.file_name.includes('Assignment 2')).length}</span>
            <span className="text-muted-foreground">A2</span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <div className="flex items-center gap-2 text-sm hidden sm:flex">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-medium">{assignments.filter(a => a.file_name.includes('Assignment 3')).length}</span>
            <span className="text-muted-foreground">A3</span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <div className="flex items-center gap-2 text-sm hidden sm:flex">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            <span className="font-medium">{midtermHandedIn}</span>
            <span className="text-muted-foreground">Midterm</span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <div className="flex items-center gap-2 text-sm hidden sm:flex">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            <span className="font-medium">{finalHandedIn}</span>
            <span className="text-muted-foreground">Final</span>
          </div>
          {sectionCounts.map(({ section, count }) => (
            <span key={section} className="hidden items-center gap-1.5 text-sm sm:inline-flex">
              <span className="text-muted-foreground">•</span>
              <Badge variant="secondary" className="text-xs">{section}</Badge>
              <span className="font-medium">{count}</span>
            </span>
          ))}
        </div>

        {/* Section Title */}
        <h2 className="text-2xl font-bold font-display mb-4">
          {activeTab === 'students' && 'Student List'}
          {activeTab === 'absence' && 'Absence Requests'}
          {activeTab === 'assignments' && 'Student Submissions'}
          {activeTab === 'grading' && 'Grading'}
          {activeTab === 'materials' && 'Briefs & Materials'}
          {activeTab === 'duedates' && 'Due Dates'}
          {activeTab === 'messages' && 'Messages'}
          {activeTab === 'chat' && 'Chat Monitor'}
        </h2>

        {/* Tab Contents - Tabs component is in header */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          {/* Student List Tab */}
          <TabsContent value="students" className="animate-fade-in space-y-4 mt-0">
            {/* Search and Filters */}
            <Card className="shadow-soft border-0 sticky top-[65px] z-20 bg-card backdrop-blur-md">
              <CardContent className="p-4 space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, student ID, section, or group..."
                    className="pl-10 h-11"
                  />
                </div>

                {/* Filter Row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filters:</span>
                  </div>
                  
                  <Select value={studentSectionFilter} onValueChange={setStudentSectionFilter}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {sections.map(section => (
                        <SelectItem key={section} value={section}>{section}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={studentGroupFilter} onValueChange={setStudentGroupFilter}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      <SelectItem value="ungrouped">Ungrouped</SelectItem>
                      {groups.map(group => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={studentStatusFilter} onValueChange={(v) => setStudentStatusFilter(v as typeof studentStatusFilter)}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="grouped">Grouped</SelectItem>
                      <SelectItem value="ungrouped">Ungrouped</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex-1" />

                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                    <Select value={studentSort} onValueChange={(v) => { setStudentSort(v as typeof studentSort); setStudentSortCol(null); }}>
                      <SelectTrigger className="w-[120px] h-9">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="id">Student ID</SelectItem>
                        <SelectItem value="section">Section</SelectItem>
                        <SelectItem value="group">Group</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {hasStudentFilters && (
                    <Button variant="ghost" size="sm" onClick={clearStudentFilters} className="gap-1 h-9">
                      <X className="w-3 h-3" />
                      Clear
                    </Button>
                  )}
                </div>

                {/* Results Count and Bulk Actions */}
                <div className="flex items-center justify-between gap-4 flex-wrap pt-2 border-t border-border/50">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {sortedStudents.length} student{sortedStudents.length !== 1 ? 's' : ''} found
                    </p>
                    {selectedStudents.size > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckSquare className="w-3 h-3" />
                        {selectedStudents.size} selected
                      </Badge>
                    )}
                  </div>
                  
                  {selectedStudents.size > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <DropdownMenu open={bulkAssignGroupOpen} onOpenChange={setBulkAssignGroupOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <UserPlus className="w-4 h-4" />
                            Assign to Group
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {getAvailableGroupsForBulkAssign().length > 0 ? (
                            getAvailableGroupsForBulkAssign().map(group => (
                              <DropdownMenuItem
                                key={group.id}
                                onClick={() => handleBulkAssignToGroup(group.id)}
                              >
                                {group.name}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled>
                              No available groups for selected students
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkUnassignFromGroup}>
                        <UserMinus className="w-4 h-4" />
                        Unassign from Group
                      </Button>
                      
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkResetPin}>
                        <KeyRound className="w-4 h-4" />
                        Reset PIN
                      </Button>
                      
                      <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleBulkDelete}>
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                      
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Student Table */}
            {sortedStudents.length > 0 ? (
              <Card className="shadow-soft border-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {[
                          { label: 'Index', col: 'index', center: true },
                          { label: 'Name', col: 'name' },
                          { label: 'Student ID', col: 'id' },
                          { label: 'Section', col: 'section' },
                          { label: 'Group', col: 'group' },
                          { label: 'Role', col: 'role' },
                          { label: 'Participation', col: 'participation', center: true, title: 'Max: 10' },
                          { label: 'Asgn 1', col: 'a1', center: true, title: 'Max: 5' },
                          { label: 'Asgn 2', col: 'a2', center: true, title: 'Max: 5' },
                          { label: 'Asgn 3', col: 'a3', center: true, title: 'Max: 10' },
                          { label: 'Midterm', col: 'midterm', center: true, title: 'Max: 30' },
                          { label: 'Final', col: 'final', center: true, title: 'Max: 40' },
                          { label: 'Absence Rate', col: 'absence', center: true, title: '(Approved absences / 14) × 100' },
                        ].map(h => (
                          <SortHead
                            key={h.col}
                            label={h.label}
                            col={h.col}
                            activeCol={studentSortCol}
                            dir={studentSortDir}
                            onSort={(c) => toggleSort(c, studentSortCol, setStudentSortCol, setStudentSortDir)}
                            className={h.center ? 'text-center' : ''}
                            title={h.title}
                          />
                        ))}
                        <TableHead className="font-semibold w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedStudents.map((student) => {
                        const studentGroup = groups.find(g => g.id === student.groupId);
                        const isLeader = studentGroup && student.id === studentGroup.leaderId;

                        const rawScores = [
                          getStudentGrade(student.id, 'Assignment 1'),
                          getStudentGrade(student.id, 'Assignment 2'),
                          getStudentGrade(student.id, 'Assignment 3'),
                          getStudentGrade(student.id, 'Participation'),
                          getStudentGrade(student.id, 'Midterm Presentation'),
                          getStudentGrade(student.id, 'Final Project'),
                        ];
                        const hasZeroScore = rawScores.some(
                          (v) => !v || isNaN(parseFloat(v)) || parseFloat(v) === 0
                        );

                        return (
                          <TableRow 
                            key={student.id} 
                            className={`cursor-pointer ${selectedStudents.has(student.id) ? 'bg-primary/25 hover:bg-primary/30' : 'hover:bg-muted/30'}`}
                            onClick={() => toggleSelectStudent(student.id)}
                          >
                            <TableCell className="text-center">
                              <span className="text-sm text-muted-foreground">{student.indexNumber ?? '–'}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{student.name}</span>
                                <CopyButton value={student.name} label="Name" />
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <span>{student.studentId}</span>
                                <CopyButton value={student.studentId} label="Student ID" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{student.section}</Badge>
                            </TableCell>
                            <TableCell>
                              {studentGroup ? (
                                <span className="font-medium">{studentGroup.name}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isLeader ? (
                                <div className="flex items-center gap-1.5">
                                  <Crown className="w-4 h-4 text-accent" />
                                  <span className="text-accent font-medium">Leader</span>
                                </div>
                              ) : studentGroup ? (
                                <span className="text-muted-foreground">Member</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            {/* Participation */}
                            <TableCell className="text-center">
                              <span className="font-mono text-base text-foreground">
                                {parseFloat(getStudentGrade(student.id, 'Participation')) || 0}/10
                              </span>
                            </TableCell>
                            {/* Assignment 1 */}
                            <TableCell className="text-center">
                              <span className="font-mono text-base text-foreground">
                                {parseFloat(getStudentGrade(student.id, 'Assignment 1')) || 0}/5
                              </span>
                            </TableCell>
                            {/* Assignment 2 */}
                            <TableCell className="text-center">
                              <span className="font-mono text-base text-foreground">
                                {parseFloat(getStudentGrade(student.id, 'Assignment 2')) || 0}/5
                              </span>
                            </TableCell>
                            {/* Assignment 3 */}
                            <TableCell className="text-center">
                              <span className="font-mono text-base text-foreground">
                                {parseFloat(getStudentGrade(student.id, 'Assignment 3')) || 0}/10
                              </span>
                            </TableCell>
                            {/* Midterm Presentation */}
                            <TableCell className="text-center">
                              <span className="font-mono text-base text-foreground">
                                {parseFloat(getStudentGrade(student.id, 'Midterm Presentation')) || 0}/30
                              </span>
                            </TableCell>
                            {/* Final Project */}
                            <TableCell className="text-center">
                              <span className="font-mono text-base text-foreground">
                                {parseFloat(getStudentGrade(student.id, 'Final Project')) || 0}/40
                              </span>
                            </TableCell>
                            {/* Absence Rate */}
                            <TableCell className="text-center">
                              {(() => {
                                const rate = getAbsenceRate(student.id);
                                const colorClass = rate >= 50 ? 'text-red-400' : rate >= 25 ? 'text-accent' : 'text-green-400';
                                return (
                                  <span className={`font-mono text-base ${colorClass}`}>
                                    {rate}%
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {!student.groupId ? (
                                    // Student is ungrouped - show assign options
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        <UserPlus className="w-4 h-4 mr-2" />
                                        Assign to Group
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent>
                                        {getAvailableGroupsForStudent(student).length > 0 ? (
                                          getAvailableGroupsForStudent(student).map(group => (
                                            <DropdownMenuItem
                                              key={group.id}
                                              onClick={() => handleAssignToGroup(student.id, group.id)}
                                            >
                                              {group.name}
                                            </DropdownMenuItem>
                                          ))
                                        ) : (
                                          <DropdownMenuItem disabled>
                                            No available groups in {student.section}
                                          </DropdownMenuItem>
                                        )}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  ) : (
                                    // Student is in a group - show ungroup and leader options
                                    <>
                                      {!isLeader && (
                                        <DropdownMenuItem onClick={() => handleSetLeader(student.groupId!, student.id)}>
                                          <Crown className="w-4 h-4 mr-2" />
                                          Make Leader
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                          <UserPlus className="w-4 h-4 mr-2" />
                                          Move to Group
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          {getAvailableGroupsForStudent(student).length > 0 ? (
                                            getAvailableGroupsForStudent(student).map(group => (
                                              <DropdownMenuItem
                                                key={group.id}
                                                onClick={async () => {
                                                  await handleRemoveFromGroup(student.id);
                                                  await handleAssignToGroup(student.id, group.id);
                                                }}
                                              >
                                                {group.name}
                                              </DropdownMenuItem>
                                            ))
                                          ) : (
                                            <DropdownMenuItem disabled>
                                              No other groups in {student.section}
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        onClick={() => handleRemoveFromGroup(student.id)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <UserMinus className="w-4 h-4 mr-2" />
                                        Remove from Group
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleResetPin(student.id, student.name)}>
                                    <KeyRound className="w-4 h-4 mr-2" />
                                    Reset PIN
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteStudent(student.id, student.name)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Student
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : (
              <Card className="shadow-soft border-0">
                <CardContent className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted mb-4">
                    <Users className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <h3 className="font-display font-semibold mb-2">No Students Found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery || hasStudentFilters ? 'No students match your search or filters.' : 'No students have registered yet.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Assignment Tab */}
          <TabsContent value="assignments" className="animate-fade-in space-y-4">
            {/* Search and Filters */}
            <Card className="shadow-soft border-0">
              <CardContent className="p-4 space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by file name, student, or group..."
                    className="pl-10 h-11"
                  />
                </div>

                {/* Filter Row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filters:</span>
                  </div>
                  
                  <Select value={assignmentTypeFilter} onValueChange={(v) => setAssignmentTypeFilter(v as typeof assignmentTypeFilter)}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={assignmentNameFilter} onValueChange={setAssignmentNameFilter}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder="Assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignments</SelectItem>
                      <SelectItem value="Assignment 1">Assignment 1</SelectItem>
                      <SelectItem value="Assignment 2">Assignment 2</SelectItem>
                      <SelectItem value="Assignment 3">Assignment 3</SelectItem>
                      <SelectItem value="Participation">Participation</SelectItem>
                      <SelectItem value="Midterm Presentation">Midterm Presentation</SelectItem>
                      <SelectItem value="Final Project">Final Project</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={assignmentSectionFilter} onValueChange={setAssignmentSectionFilter}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {sections.map(section => (
                        <SelectItem key={section} value={section}>{section}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={assignmentGroupFilter} onValueChange={setAssignmentGroupFilter}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      {groups.map(group => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1" />

                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                    <Select value={assignmentSort} onValueChange={(v) => setAssignmentSort(v as typeof assignmentSort)}>
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date & Time</SelectItem>
                        <SelectItem value="name">File Name</SelectItem>
                        <SelectItem value="uploader">Uploaded By</SelectItem>
                        <SelectItem value="type">Type</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {hasAssignmentFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAssignmentFilters} className="gap-1 h-9">
                      <X className="w-3 h-3" />
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Results Count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {sortedAssignments.length} assignment{sortedAssignments.length !== 1 ? 's' : ''} found
              </p>
            </div>

            {/* Assignments Table */}
            {sortedAssignments.length > 0 ? (
              <Card className="shadow-soft border-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">File Name</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Uploaded By</TableHead>
                        <TableHead className="font-semibold">Group</TableHead>
                        <TableHead className="font-semibold hidden md:table-cell">Section</TableHead>
                        <TableHead className="font-semibold hidden md:table-cell">Size</TableHead>
                        <TableHead className="font-semibold">Date & Time</TableHead>
                        <TableHead className="font-semibold w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAssignments.map((assignment) => {
                        const dateTime = formatDateTime(assignment.created_at);
                        
                        return (
                          <TableRow key={assignment.id} className="hover:bg-muted/30">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-primary shrink-0" />
                                <span className="truncate max-w-[250px]">{assignment.file_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={assignment.assignment_type === 'group' ? 'default' : 'secondary'} 
                                className="text-xs"
                              >
                                {assignment.assignment_type === 'group' ? 'Group' : 'Individual'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{getUploaderName(assignment.uploaded_by)}</p>
                                <p className="text-xs text-muted-foreground">{getUploaderStudentId(assignment.uploaded_by)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{getGroupName(assignment.group_id)}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className="text-xs">
                                {getUploaderSection(assignment.uploaded_by)}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">
                              {formatFileSize(assignment.file_size)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col text-sm">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-muted-foreground" />
                                  {dateTime.date}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {dateTime.time}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDownloadFile(assignment)}
                                  title="Download"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteAssignment(assignment)}
                                  className="text-destructive hover:text-destructive"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : (
              <Card className="shadow-soft border-0">
                <CardContent className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted mb-4">
                    <FileText className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <h3 className="font-display font-semibold mb-2">No Assignments Found</h3>
                  <p className="text-muted-foreground">
                    {searchQuery || hasAssignmentFilters ? 'No assignments match your search or filters.' : 'No assignments have been uploaded yet.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Grading Tab */}
          <TabsContent value="grading" className="animate-fade-in space-y-4">
            <Card className="shadow-soft border-0 sticky top-[65px] z-20 bg-card backdrop-blur-md">
              <CardContent className="p-4 space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={gradingSearchQuery}
                    onChange={(e) => setGradingSearchQuery(e.target.value)}
                    placeholder="Search any column: name, ID, section, group, scores..."
                    className="pl-10 h-11"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filters:</span>
                    <Select value={gradingSectionFilter} onValueChange={setGradingSectionFilter}>
                      <SelectTrigger className="w-[120px] h-9">
                        <SelectValue placeholder="Section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sections</SelectItem>
                        {sections.map(section => (
                          <SelectItem key={section} value={section}>{section}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={gradingGroupFilter} onValueChange={setGradingGroupFilter}>
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder="Group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Groups</SelectItem>
                        <SelectItem value="ungrouped">Ungrouped</SelectItem>
                        {groups.map(group => (
                          <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={gradingMissingFilter} onValueChange={setGradingMissingFilter}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Missing submission" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Submissions</SelectItem>
                        <SelectItem value="any">Missing any</SelectItem>
                        <SelectItem value="Assignment 1">Missing A1</SelectItem>
                        <SelectItem value="Assignment 2">Missing A2</SelectItem>
                        <SelectItem value="Assignment 3">Missing A3</SelectItem>
                        <SelectItem value="Midterm Presentation">Missing Midterm</SelectItem>
                        <SelectItem value="Final Project">Missing Final</SelectItem>
                      </SelectContent>
                    </Select>
                    {(gradingSectionFilter !== 'all' || gradingGroupFilter !== 'all' || gradingMissingFilter !== 'all' || gradingSearchQuery || gradingSort !== 'name') && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setGradingSectionFilter('all');
                          setGradingGroupFilter('all');
                          setGradingMissingFilter('all');
                          setGradingSearchQuery('');
                          setGradingSort('name');
                        }}
                        className="h-9 gap-1 text-muted-foreground"
                      >
                        <X className="w-3 h-3" />
                        Clear
                      </Button>
                    )}
                    
                    <div className="flex items-center gap-2 ml-4">
                      <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                      <Select value={gradingSort} onValueChange={(v) => { setGradingSort(v as typeof gradingSort); setGradingSortCol(null); }}>
                        <SelectTrigger className="w-[120px] h-9">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="index">Index</SelectItem>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="id">ID</SelectItem>
                          <SelectItem value="section">Section</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="mr-2 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <Switch
                        checked={highlightZeroScores}
                        onCheckedChange={setHighlightZeroScores}
                        aria-label="Highlight missing scores"
                      />
                      Highlight missing scores
                    </label>
                    <Button
                      variant="outline"
                      onClick={copyFilteredStudentIds}
                      className="gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Student List
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={exportGradesToExcel}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      ExportRawGrade
                    </Button>
                    <Button
                      variant="outline"
                      onClick={exportSimpleGradesToExcel}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export Grade
                    </Button>
                    <Button 
                      variant="gradient" 
                      onClick={saveAllGrades} 
                      disabled={savingGrades}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {savingGrades ? 'Saving...' : 'Save All Grades'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Grading Table */}
            <Card className="shadow-soft border-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {[
                        { label: 'Index', col: 'index', className: 'text-center w-16' },
                        { label: 'Student', col: 'name', className: 'sticky left-0 bg-card z-10' },
                        { label: 'ID', col: 'id', className: 'text-center' },
                        { label: 'Section', col: 'section', className: 'text-center' },
                        { label: 'Group', col: 'group', className: 'text-center' },
                        { label: 'Participation', col: 'participation', className: 'text-center', title: 'Max: 10' },
                        { label: 'Asgn 1', col: 'a1', className: 'text-center', title: 'Max: 5' },
                        { label: 'Asgn 2', col: 'a2', className: 'text-center', title: 'Max: 5' },
                        { label: 'Asgn 3', col: 'a3', className: 'text-center', title: 'Max: 10' },
                        { label: 'Midterm', col: 'midterm', className: 'text-center', title: 'Max: 30' },
                        { label: 'Final', col: 'final', className: 'text-center', title: 'Max: 40' },
                        { label: 'Total', col: 'total', className: 'text-center' },
                      ].map(h => (
                        <SortHead
                          key={h.col}
                          label={h.label}
                          col={h.col}
                          activeCol={gradingSortCol}
                          dir={gradingSortDir}
                          onSort={(c) => toggleSort(c, gradingSortCol, setGradingSortCol, setGradingSortDir)}
                          className={h.className}
                          title={h.title}
                        />
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students
                      .filter(s => {
                        const q = gradingSearchQuery.trim().toLowerCase();
                        const studentGroupName = groups.find(g => g.id === s.groupId)?.name || '';
                        const participation = getStudentGrade(s.id, 'Participation');
                        const a1 = getStudentGrade(s.id, 'Assignment 1');
                        const a2 = getStudentGrade(s.id, 'Assignment 2');
                        const a3 = getStudentGrade(s.id, 'Assignment 3');
                        const midterm = getStudentGrade(s.id, 'Midterm Presentation');
                        const final_ = getStudentGrade(s.id, 'Final Project');
                        const totalVal =
                          (parseFloat(a1) || 0) +
                          (parseFloat(a2) || 0) +
                          (parseFloat(a3) || 0) +
                          (parseFloat(participation) || 0) +
                          (parseFloat(midterm) || 0) +
                          (parseFloat(final_) || 0);
                        const haystack = [
                          s.indexNumber?.toString() ?? '',
                          s.name,
                          s.studentId,
                          s.section,
                          studentGroupName,
                          participation,
                          a1,
                          a2,
                          a3,
                          midterm,
                          final_,
                          totalVal.toString(),
                        ].join(' ').toLowerCase();
                        const matchesSearch = q === '' || haystack.includes(q);
                        const matchesSection = gradingSectionFilter === 'all' || s.section === gradingSectionFilter;
                        const matchesGroup = gradingGroupFilter === 'all' || 
                          (gradingGroupFilter === 'ungrouped' ? !s.groupId : s.groupId === gradingGroupFilter);
                        return matchesSearch && matchesSection && matchesGroup && matchesMissingFilter(s.id, s.groupId || null);
                      })
                      .sort((a, b) => {
                        if (gradingSortCol) return compareByColumn(a, b, gradingSortCol, gradingSortDir);
                        switch (gradingSort) {
                          case 'index':
                            return (a.indexNumber || 999) - (b.indexNumber || 999);
                          case 'id':
                            return a.studentId.localeCompare(b.studentId);
                          case 'section':
                            return a.section.localeCompare(b.section) || a.name.localeCompare(b.name);
                          case 'name':
                          default:
                            return a.name.localeCompare(b.name);
                        }
                      })
                      .map((student, index) => {
                      const studentGroup = groups.find(g => g.id === student.groupId);
                      
                      // Calculate total score
                      const a1 = parseFloat(getStudentGrade(student.id, 'Assignment 1')) || 0;
                      const a2 = parseFloat(getStudentGrade(student.id, 'Assignment 2')) || 0;
                      const a3 = parseFloat(getStudentGrade(student.id, 'Assignment 3')) || 0;
                      const participation = parseFloat(getStudentGrade(student.id, 'Participation')) || 0;
                      const midterm = parseFloat(getStudentGrade(student.id, 'Midterm Presentation')) || 0;
                      const final_ = parseFloat(getStudentGrade(student.id, 'Final Project')) || 0;
                      const total = Math.round(a1 + a2 + a3 + participation + midterm + final_);
                      const maxTotal = 5 + 5 + 10 + 10 + 30 + 40; // 100

                      const rawScores = [
                        getStudentGrade(student.id, 'Assignment 1'),
                        getStudentGrade(student.id, 'Assignment 2'),
                        getStudentGrade(student.id, 'Assignment 3'),
                        getStudentGrade(student.id, 'Participation'),
                        getStudentGrade(student.id, 'Midterm Presentation'),
                        getStudentGrade(student.id, 'Final Project'),
                      ];
                      const hasZeroScore = rawScores.some(
                        (v) => !v || isNaN(parseFloat(v)) || parseFloat(v) === 0
                      );

                      return (
                        <TableRow key={student.id} className={highlightZeroScores && hasZeroScore ? zeroScoreRowClass : ''}>
                           <TableCell className="text-center">
                             <span className="text-sm text-muted-foreground">{student.indexNumber || index + 1}</span>
                           </TableCell>
                          <TableCell className="sticky left-0 bg-card z-10">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm">{student.name}</p>
                              <CopyButton value={student.name} label="Name" />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-sm text-muted-foreground">{student.studentId}</span>
                              <CopyButton value={student.studentId} label="Student ID" />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">{student.section}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {studentGroup ? (
                              <div className="flex items-center justify-center gap-1">
                                <span>{studentGroup.name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  title="Teacher note for this group"
                                  onClick={() => {
                                    setGroupNoteGroupId(studentGroup.id);
                                    setGroupNoteGroupName(studentGroup.name);
                                    setGroupNoteCategory('general');
                                    setGroupNoteCategoryLabel('');
                                    setGroupNoteDialogOpen(true);
                                  }}
                                >
                                  <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          {/* Participation */}
                          <TableCell className="text-center p-1">
                            <Input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={getStudentGrade(student.id, 'Participation')}
                              onChange={(e) => handleGradeInputChange(student.id, 'Participation', e.target.value, 10)}
                              onBlur={() => saveGrade(student.id, 'Participation', 'individual', 10)}
                              className="w-16 h-8 text-center text-sm mx-auto"
                              placeholder="0"
                            />
                            {lateHint(student, 'Participation')}
                          </TableCell>
                          {/* Individual Assignments */}
                          {['Assignment 1', 'Assignment 2'].map(name => (
                            <TableCell key={name} className="text-center p-1">
                              <Input
                                type="number"
                                min="0"
                                max="5"
                                step="0.5"
                                value={getStudentGrade(student.id, name)}
                                onChange={(e) => handleGradeInputChange(student.id, name, e.target.value, 5)}
                                onBlur={() => saveGrade(student.id, name, 'individual', 5)}
                                className="w-16 h-8 text-center text-sm mx-auto"
                                placeholder="0"
                              />
                              {lateHint(student, name)}
                            </TableCell>
                          ))}
                          {/* Assignment 3 */}
                          <TableCell className="text-center p-1">
                            <Input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={getStudentGrade(student.id, 'Assignment 3')}
                              onChange={(e) => handleGradeInputChange(student.id, 'Assignment 3', e.target.value, 10)}
                              onBlur={() => saveGrade(student.id, 'Assignment 3', 'individual', 10)}
                              className="w-16 h-8 text-center text-sm mx-auto"
                              placeholder="0"
                            />
                            {lateHint(student, 'Assignment 3')}
                          </TableCell>
                          {/* Midterm Presentation */}
                          <TableCell className="text-center p-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-mono text-sm w-12 text-center">
                                {Math.round(parseFloat(getStudentGrade(student.id, 'Midterm Presentation')) || 0)}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setRubricStudentId(student.id);
                                  setRubricStudentName(student.name);
                                  setRubricAssignmentType('Midterm Presentation');
                                  setRubricDialogOpen(true);
                                }}
                              >
                                Score
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title={studentGroup ? "Midterm note for this group" : "Midterm note for this student"}
                                onClick={() => {
                                  if (studentGroup) {
                                    setGroupNoteGroupId(studentGroup.id);
                                    setGroupNoteGroupName(studentGroup.name);
                                    setGroupNoteStudentId(null);
                                    setGroupNoteStudentName('');
                                  } else {
                                    setGroupNoteGroupId(null);
                                    setGroupNoteGroupName('');
                                    setGroupNoteStudentId(student.id);
                                    setGroupNoteStudentName(student.name);
                                  }
                                  setGroupNoteCategory('midterm');
                                  setGroupNoteCategoryLabel('Midterm');
                                  setGroupNoteDialogOpen(true);
                                }}
                              >
                                <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                            {lateHint(student, 'Midterm Presentation')}
                          </TableCell>
                          {/* Final Project */}
                          <TableCell className="text-center p-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-mono text-sm w-12 text-center">
                                {Math.round(parseFloat(getStudentGrade(student.id, 'Final Project')) || 0)}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setRubricStudentId(student.id);
                                  setRubricStudentName(student.name);
                                  setRubricAssignmentType('Final Project');
                                  setRubricDialogOpen(true);
                                }}
                              >
                                Score
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title={studentGroup ? "Final note for this group" : "Final note for this student"}
                                onClick={() => {
                                  if (studentGroup) {
                                    setGroupNoteGroupId(studentGroup.id);
                                    setGroupNoteGroupName(studentGroup.name);
                                    setGroupNoteStudentId(null);
                                    setGroupNoteStudentName('');
                                  } else {
                                    setGroupNoteGroupId(null);
                                    setGroupNoteGroupName('');
                                    setGroupNoteStudentId(student.id);
                                    setGroupNoteStudentName(student.name);
                                  }
                                  setGroupNoteCategory('final');
                                  setGroupNoteCategoryLabel('Final');
                                  setGroupNoteDialogOpen(true);
                                }}
                              >
                                <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                            {lateHint(student, 'Final Project')}
                          </TableCell>
                          {/* Total */}
                          <TableCell className="text-center">
                            <Badge 
                              variant={total >= maxTotal * 0.8 ? 'default' : total >= maxTotal * 0.5 ? 'secondary' : 'outline'}
                              className="font-mono text-base"
                            >
                              {total}/{maxTotal}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* Absence Tab */}
          <TabsContent value="absence" className="animate-fade-in">
            <AbsenceRequestsTab />
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="animate-fade-in">
            <TeacherMessagesTab />
          </TabsContent>

          {/* Chat Monitor Tab */}
          <TabsContent value="chat" className="animate-fade-in">
            <TeacherChatMonitorTab />
          </TabsContent>

          {/* Materials Tab */}
          <TabsContent value="materials" className="animate-fade-in">
            <TeacherMaterialsTab />
          </TabsContent>

          {/* Due Dates Tab */}
          <TabsContent value="duedates" className="animate-fade-in">
            <TeacherDueDatesTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* Add Student Dialog */}
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add New Student</DialogTitle>
            <DialogDescription>
              Enter student details to add them to the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="studentName">Full Name</Label>
              <Input
                id="studentName"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Enter student name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
                placeholder="Enter student ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentSection">Section</Label>
              <Select value={newStudentSection} onValueChange={setNewStudentSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="457A">457A</SelectItem>
                  <SelectItem value="458A">458A</SelectItem>
                  <SelectItem value="458B">458B</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStudentOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleAddStudent}>
              <Plus className="w-4 h-4 mr-2" />
              Add Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Students Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Import Students from Excel</DialogTitle>
            <DialogDescription>
              Upload an Excel file or a URSA class-list export (.xls) with student data.
              Expected columns: Name, Student ID, Index (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="importSection">Target Section</Label>
              <Select value={importSection} onValueChange={setImportSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="457A">457A</SelectItem>
                  <SelectItem value="458A">458A</SelectItem>
                  <SelectItem value="458B">458B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="excelFile">Excel File</Label>
              <Input
                id="excelFile"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
              {importFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {importFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportFile(null); }}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleExcelImport} disabled={!importFile || importing}>
              <Upload className="w-4 h-4 mr-2" />
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rubric Scoring Dialog */}
      <RubricScoringDialog
        open={rubricDialogOpen}
        onOpenChange={setRubricDialogOpen}
        studentId={rubricStudentId}
        studentName={rubricStudentName}
        assignmentType={rubricAssignmentType}
        maxScore={rubricAssignmentType === 'Midterm Presentation' ? 30 : 40}
        onSave={async (calculatedScore) => {
          const maxScore = rubricAssignmentType === 'Midterm Presentation' ? 30 : 40;
          const scoreStr = calculatedScore.toString();
          handleGradeInputChange(rubricStudentId, rubricAssignmentType, scoreStr, maxScore);
          // Directly save the grade
          const assignmentType = 'group' as const;
          const student = students.find(s => s.id === rubricStudentId);
          if (student?.groupId) {
            const groupMembers = students.filter(s => s.groupId === student.groupId);
            const gradesToUpsert = groupMembers.map(member => ({
              student_id: member.id,
              assignment_name: rubricAssignmentType,
              assignment_type: assignmentType,
              score: calculatedScore,
              max_score: maxScore,
            }));
            const { error } = await supabase
              .from('grades')
              .upsert(gradesToUpsert, { onConflict: 'student_id,assignment_name' });
            if (error) {
              toast.error('Failed to save grade');
            } else {
              toast.success(`Score saved for all ${groupMembers.length} group members`);
              await fetchAllGrades();
            }
          } else {
            const { error } = await supabase
              .from('grades')
              .upsert({
                student_id: rubricStudentId,
                assignment_name: rubricAssignmentType,
                assignment_type: assignmentType,
                score: calculatedScore,
                max_score: maxScore,
              }, { onConflict: 'student_id,assignment_name' });
            if (error) {
              toast.error('Failed to save grade');
            } else {
              toast.success('Score saved successfully');
              await fetchAllGrades();
            }
          }
        }}
      />

      {/* Group Note Dialog */}
      <GroupNoteDialog
        open={groupNoteDialogOpen}
        onOpenChange={setGroupNoteDialogOpen}
        groupId={groupNoteGroupId}
        groupName={groupNoteGroupName}
        category={groupNoteCategory}
        categoryLabel={groupNoteCategoryLabel}
        studentId={groupNoteStudentId}
        studentName={groupNoteStudentName}
      />
    </div>
  );
};
