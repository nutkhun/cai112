import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { Upload, FileText, Trash2, Download, Loader2, Users, User, Calendar, Clock, ChevronDown, ChevronUp, Link2, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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

interface AssignmentSectionProps {
  groupId?: string;
  /** Start opened - used when the card is the sole content of a mobile tab. */
  defaultExpanded?: boolean;
}

export const AssignmentSection = ({ groupId, defaultExpanded = false }: AssignmentSectionProps) => {
  const { currentStudent, getStudentById, getGroupById } = useGroups();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'group' | 'individual'>(groupId ? 'group' : 'individual');
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedAssignmentNumber, setSelectedAssignmentNumber] = useState<string>('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [groupProjectDialogOpen, setGroupProjectDialogOpen] = useState(false);
  const [selectedProjectType, setSelectedProjectType] = useState<string>('');
  const [pendingGroupFile, setPendingGroupFile] = useState<File | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [individualConfirmOpen, setIndividualConfirmOpen] = useState(false);
  const [pendingIndividualProject, setPendingIndividualProject] = useState<{ file: File; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupFileInputRef = useRef<HTMLInputElement>(null);

  // Teacher-defined extra assignments open for submission.
  const [customAssignments, setCustomAssignments] = useState<{ name: string; open_date: string | null; due_date: string | null; section: string | null }[]>([]);

  useEffect(() => {
    if (!currentStudent) return;
    const fetchCustoms = async () => {
      const { data } = await supabase.from('custom_assignments').select('*');
      if (!data) return;
      const today = new Date().toISOString().slice(0, 10);
      setCustomAssignments(
        data.filter((c: { section: string | null; open_date: string | null }) =>
          (!c.section || c.section === currentStudent.section) &&
          (!c.open_date || c.open_date <= today)
        )
      );
    };
    fetchCustoms();
    const channel = supabase
      .channel('custom-assignments-student')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_assignments' }, () => fetchCustoms())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStudent?.id, currentStudent?.section]);

  // Link submissions (Google Slides, Canva, etc.)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkChoice, setLinkChoice] = useState('');
  const [linkTarget, setLinkTarget] = useState<'group' | 'individual'>('individual');
  const [linkSaving, setLinkSaving] = useState(false);

  const group = groupId ? getGroupById(groupId) : null;
  const isLeader = group?.leaderId === currentStudent?.id;

  // Use student ID as fallback folder for students without groups
  const storageFolder = groupId || `individual-${currentStudent?.id}`;

  const individualFolder = `individual-${currentStudent?.id}`;

  const fetchAssignments = async () => {
    if (!storageFolder) {
      setLoading(false);
      return;
    }
    
    // Fetch assignments from both the current group folder AND the student's individual folder
    // This handles cases where a student uploaded assignments before joining a group
    let query = supabase
      .from('assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (groupId && individualFolder) {
      // Student is in a group - fetch group assignments + their individual ones from both folders
      query = query.or(`group_id.eq.${storageFolder},group_id.eq.${individualFolder}`);
    } else {
      query = query.eq('group_id', storageFolder);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching assignments:', error);
    } else {
      setAssignments((data || []) as Assignment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignments();

    // Group members see each other's uploads (and teacher deletions) live.
    const channel = supabase
      .channel(`assignments-live-${storageFolder}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => fetchAssignments())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [storageFolder]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentStudent) return;

    // For individual assignments, show the assignment number dialog
    setPendingFile(file);
    setAssignmentDialogOpen(true);
  };

  const handleGroupFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentStudent) return;

    // Check permissions for group assignments
    if (!isLeader) {
      toast.error('Only the group leader can upload group assignments');
      return;
    }

    // Show project type dialog
    setPendingGroupFile(file);
    setGroupProjectDialogOpen(true);
  };

  const handleConfirmAssignment = async () => {
    if (!pendingFile || !selectedAssignmentNumber || !currentStudent) {
      toast.error('Please select an assignment number');
      return;
    }

    // If Midterm or Final, show individual work confirmation first
    if (selectedAssignmentNumber === 'Midterm' || selectedAssignmentNumber === 'Final') {
      const projectType = selectedAssignmentNumber === 'Midterm' ? 'Midterm Presentation' : 'Final Project';
      setPendingIndividualProject({ file: pendingFile, type: projectType });
      setAssignmentDialogOpen(false);
      setIndividualConfirmOpen(true);
      return;
    }

    // Teacher-defined extra assignment: upload with its name as the prefix.
    if (selectedAssignmentNumber.startsWith('custom:')) {
      const customName = selectedAssignmentNumber.slice(7);
      await uploadFile(pendingFile, `${customName} - `, 'individual');
      setAssignmentDialogOpen(false);
      setPendingFile(null);
      setSelectedAssignmentNumber('');
      return;
    }

    await uploadFile(pendingFile, `Assignment ${selectedAssignmentNumber} - `, 'individual');
    
    // Assignment 0 is non-graded, skip auto-grading for it
    if (selectedAssignmentNumber !== '0') {
      // Auto-grade: Give full score (5) for uploading the assignment
      const assignmentName = `Assignment ${selectedAssignmentNumber}`;
      const { error: gradeError } = await supabase
        .from('grades')
        .upsert({
          student_id: currentStudent.id,
          assignment_name: assignmentName,
          assignment_type: 'individual',
          score: 5,
          max_score: 5,
        }, {
          onConflict: 'student_id,assignment_name'
        });

      if (gradeError) {
        console.error('Error auto-grading:', gradeError);
      }
    }

    setAssignmentDialogOpen(false);
    setPendingFile(null);
    setSelectedAssignmentNumber('');
  };

  const handleConfirmIndividualProject = async () => {
    if (!pendingIndividualProject || !currentStudent) return;

    await uploadFile(pendingIndividualProject.file, `${pendingIndividualProject.type} (Individual) - `, 'individual');
    
    setIndividualConfirmOpen(false);
    setPendingIndividualProject(null);
    setPendingFile(null);
    setSelectedAssignmentNumber('');
  };

  const handleConfirmGroupProject = async () => {
    if (!pendingGroupFile || !selectedProjectType) {
      toast.error('Please select a project type');
      return;
    }

    await uploadFile(pendingGroupFile, `${selectedProjectType} - `, 'group');
    setGroupProjectDialogOpen(false);
    setPendingGroupFile(null);
    setSelectedProjectType('');
  };

  const uploadFile = async (file: File, prefix: string, type: 'group' | 'individual') => {
    if (!currentStudent) return;

    // For individual assignments, always use the student's individual folder
    // This ensures assignments are tied to the student, not the group
    const uploadFolder = type === 'individual' ? `individual-${currentStudent.id}` : storageFolder;

    setUploading(true);
    const prefixedFileName = `${prefix}${file.name}`;
    const filePath = `${uploadFolder}/${type}/${currentStudent.id}/${Date.now()}-${prefixedFileName}`;

    try {
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('group-assignments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save record to database
      const { error: dbError } = await supabase
        .from('assignments')
        .insert({
          group_id: uploadFolder,
          file_name: prefixedFileName,
          file_path: filePath,
          file_size: file.size,
          uploaded_by: currentStudent.id,
          assignment_type: type,
        });

      if (dbError) throw dbError;

      toast.success(`${type === 'group' ? 'Group' : 'Individual'} assignment uploaded!`);
      fetchAssignments();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (groupFileInputRef.current) {
        groupFileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (assignment: Assignment) => {
    // Check permissions
    if (assignment.assignment_type === 'group' && !isLeader) {
      toast.error('Only the group leader can delete group assignments');
      return;
    }
    if (assignment.assignment_type === 'individual' && assignment.uploaded_by !== currentStudent?.id) {
      toast.error('You can only delete your own individual assignments');
      return;
    }

    try {
      // Link submissions have nothing in storage to remove.
      if (!isLinkSubmission(assignment)) {
        const { error: storageError } = await supabase.storage
          .from('group-assignments')
          .remove([assignment.file_path]);

        if (storageError) throw storageError;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('assignments')
        .delete()
        .eq('id', assignment.id);

      if (dbError) throw dbError;

      toast.success('Assignment deleted');
      fetchAssignments();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file');
    }
  };

  const isLinkSubmission = (a: Assignment) => /^https?:\/\//i.test(a.file_path);

  const handleDownload = async (assignment: Assignment) => {
    if (isLinkSubmission(assignment)) {
      window.open(assignment.file_path, '_blank');
      return;
    }
    const { data } = supabase.storage
      .from('group-assignments')
      .getPublicUrl(assignment.file_path);

    window.open(data.publicUrl, '_blank');
  };

  const handleSubmitLink = async () => {
    if (!currentStudent || !linkChoice) {
      toast.error('Please choose what this link is for');
      return;
    }
    let url = linkUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      new URL(url);
    } catch {
      toast.error('Please enter a valid link (e.g. https://docs.google.com/...)');
      return;
    }

    setLinkSaving(true);
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      let prefix: string;
      let type: 'group' | 'individual';
      if (linkTarget === 'group') {
        prefix = `${linkChoice} - `;
        type = 'group';
      } else if (linkChoice.startsWith('custom:')) {
        prefix = `${linkChoice.slice(7)} - `;
        type = 'individual';
      } else if (linkChoice === 'Midterm' || linkChoice === 'Final') {
        prefix = `${linkChoice === 'Midterm' ? 'Midterm Presentation' : 'Final Project'} (Individual) - `;
        type = 'individual';
      } else {
        prefix = `Assignment ${linkChoice} - `;
        type = 'individual';
      }
      const folder = type === 'individual' ? `individual-${currentStudent.id}` : storageFolder;

      const { error } = await supabase.from('assignments').insert({
        group_id: folder,
        file_name: `${prefix}Link: ${host}`,
        file_path: url,
        file_size: null,
        uploaded_by: currentStudent.id,
        assignment_type: type,
      });
      if (error) throw error;

      // Same auto-grade as file uploads for graded individual assignments.
      if (type === 'individual' && ['1', '2', '3'].includes(linkChoice)) {
        await supabase.from('grades').upsert({
          student_id: currentStudent.id,
          assignment_name: `Assignment ${linkChoice}`,
          assignment_type: 'individual',
          score: 5,
          max_score: 5,
        }, { onConflict: 'student_id,assignment_name' });
      }

      toast.success('Link submitted!');
      setLinkDialogOpen(false);
      setLinkUrl('');
      setLinkChoice('');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to submit link');
    } finally {
      setLinkSaving(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
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

  const getUploaderName = (uploaderId: string) => {
    const student = getStudentById(uploaderId);
    return student?.name || 'Unknown';
  };

  const groupAssignments = assignments.filter(a => a.assignment_type === 'group');
  const individualAssignments = assignments.filter(a => a.assignment_type === 'individual');
  const myIndividualAssignments = individualAssignments.filter(a => a.uploaded_by === currentStudent?.id);

  const canUpload = activeTab === 'group' ? isLeader : true;

  const renderAssignmentList = (items: Assignment[], showUploader: boolean = true) => {
    if (items.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-4">
          No {activeTab} assignments uploaded yet
        </p>
      );
    }

    return (
      <div className="space-y-2 max-h-[55vh] sm:max-h-[250px] overflow-y-auto scroll-contain">
        {items.map((assignment) => {
          const { date, time } = formatDateTime(assignment.created_at);
          const canDelete = assignment.assignment_type === 'group' 
            ? isLeader 
            : assignment.uploaded_by === currentStudent?.id;

          return (
            <div
              key={assignment.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
            >
              {isLinkSubmission(assignment)
                ? <Link2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                : <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                {/* Two lines on phones beats a truncated filename you can't read. */}
                <p className="text-sm font-medium break-words line-clamp-2 sm:truncate">{assignment.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(assignment.file_size)}
                  {showUploader && ` • by ${getUploaderName(assignment.uploaded_by)}`}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {time}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Download ${assignment.file_name}`}
                  className="h-10 w-10 p-0 md:h-7 md:w-7"
                  onClick={() => handleDownload(assignment)}
                >
                  <Download className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${assignment.file_name}`}
                    className="h-10 w-10 p-0 md:h-7 md:w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(assignment)}
                  >
                    <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="shadow-soft border-0 mt-4">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-lg">
            <FileText className="w-5 h-5 text-primary" />
            Assignment and Project Submission
            <Badge variant="secondary" className="text-xs">
              {assignments.length} file{assignments.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'group' | 'individual')}>
          {groupId ? (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="group" className="gap-2">
                <Users className="w-3.5 h-3.5" />
                Group ({groupAssignments.length})
              </TabsTrigger>
              <TabsTrigger value="individual" className="gap-2">
                <User className="w-3.5 h-3.5" />
                Individual ({myIndividualAssignments.length})
              </TabsTrigger>
            </TabsList>
          ) : (
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="individual" className="gap-2">
                <User className="w-3.5 h-3.5" />
                Individual ({myIndividualAssignments.length})
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="group" className="mt-4 space-y-3">
            {/* Upload button for group - leader only */}
            <div className="relative">
              <input
                ref={groupFileInputRef}
                type="file"
                onChange={handleGroupFileSelect}
                className="hidden"
                id="assignment-upload-group"
              />
              {isLeader ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => groupFileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload File
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => { setLinkTarget('group'); setLinkChoice(''); setLinkDialogOpen(true); }}
                    disabled={uploading}
                  >
                    <Link2 className="w-4 h-4" />
                    Submit a Link
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2 px-3 rounded-lg bg-muted/50">
                  Only the group leader can upload group assignments
                </p>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              renderAssignmentList(groupAssignments, true)
            )}
          </TabsContent>

          <TabsContent value="individual" className="mt-4 space-y-3">
            {/* Upload button for individual - any member */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                id="assignment-upload-individual"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload File
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => { setLinkTarget('individual'); setLinkChoice(''); setLinkDialogOpen(true); }}
                  disabled={uploading}
                >
                  <Link2 className="w-4 h-4" />
                  Submit a Link
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              renderAssignmentList(myIndividualAssignments, false)
            )}
          </TabsContent>
        </Tabs>

        {/* Link Submission Dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                Submit a Link
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Link URL</Label>
                <Input
                  placeholder="https://docs.google.com/presentation/... or Canva link"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  inputMode="url"
                />
                <p className="text-xs text-muted-foreground">
                  Make sure the link is shared so anyone with it can view.
                </p>
              </div>
              <div className="space-y-2">
                <Label>This link is for</Label>
                <Select value={linkChoice} onValueChange={setLinkChoice}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Choose assignment" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
                    {linkTarget === 'group' ? (
                      <>
                        <SelectItem value="Midterm Presentation">Midterm Presentation</SelectItem>
                        <SelectItem value="Final Project">Final Project</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="0">Assignment 0</SelectItem>
                        <SelectItem value="1">Assignment 1</SelectItem>
                        <SelectItem value="2">Assignment 2</SelectItem>
                        <SelectItem value="3">Assignment 3</SelectItem>
                        <SelectItem value="Midterm">Midterm Presentation (Individual)</SelectItem>
                        <SelectItem value="Final">Final Project (Individual)</SelectItem>
                        {customAssignments.map(c => (
                          <SelectItem key={c.name} value={`custom:${c.name}`}>{c.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitLink} disabled={linkSaving || !linkUrl.trim() || !linkChoice} className="gap-2">
                {linkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Submit Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assignment Number Selection Dialog */}
        <Dialog open={assignmentDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setPendingFile(null);
            setSelectedAssignmentNumber('');
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }
          setAssignmentDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Assignment Number</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>File to upload</Label>
                <p className="text-sm text-muted-foreground truncate">
                  {pendingFile?.name}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignment-number">Assignment Number</Label>
                <Select value={selectedAssignmentNumber} onValueChange={setSelectedAssignmentNumber}>
                  <SelectTrigger id="assignment-number" className="bg-background">
                    <SelectValue placeholder="Choose assignment number" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
                    <SelectItem value="0">Assignment 0 (Non-graded)</SelectItem>
                    <SelectItem value="1">Assignment 1</SelectItem>
                    <SelectItem value="2">Assignment 2</SelectItem>
                    <SelectItem value="3">Assignment 3</SelectItem>
                    <SelectItem value="Midterm">Midterm Presentation (Individual)</SelectItem>
                    <SelectItem value="Final">Final Project (Individual)</SelectItem>
                    {customAssignments.map(c => (
                      <SelectItem key={c.name} value={`custom:${c.name}`}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignmentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmAssignment} disabled={!selectedAssignmentNumber || uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Group Project Type Selection Dialog */}
        <Dialog open={groupProjectDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setPendingGroupFile(null);
            setSelectedProjectType('');
            if (groupFileInputRef.current) {
              groupFileInputRef.current.value = '';
            }
          }
          setGroupProjectDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Project Type</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>File to upload</Label>
                <p className="text-sm text-muted-foreground truncate">
                  {pendingGroupFile?.name}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-type">Project Type</Label>
                <Select value={selectedProjectType} onValueChange={setSelectedProjectType}>
                  <SelectTrigger id="project-type" className="bg-background">
                    <SelectValue placeholder="Choose project type" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
                    <SelectItem value="Midterm Presentation">Midterm Presentation</SelectItem>
                    <SelectItem value="Final Project">Final Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGroupProjectDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmGroupProject} disabled={!selectedProjectType || uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Individual Project Confirmation Dialog */}
        <Dialog open={individualConfirmOpen} onOpenChange={(open) => {
          if (!open) {
            setPendingIndividualProject(null);
            setPendingFile(null);
            setSelectedAssignmentNumber('');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
          setIndividualConfirmOpen(open);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>⚠️ Individual Submission Confirmation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                You are about to submit <strong>{pendingIndividualProject?.type}</strong> as <strong>individual work</strong>.
              </p>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">
                  By confirming, you acknowledge that:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                  <li>You will be working on this project individually by yourself</li>
                  <li>Your grade will be based solely on your individual submission</li>
                  <li>This cannot be changed to a group submission later</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Label>File to upload</Label>
                <p className="text-sm text-muted-foreground truncate">
                  {pendingIndividualProject?.file.name}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIndividualConfirmOpen(false);
                setPendingIndividualProject(null);
                setPendingFile(null);
                setSelectedAssignmentNumber('');
              }}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleConfirmIndividualProject} 
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  'I Confirm, Submit Individually'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
      )}
    </Card>
  );
};
