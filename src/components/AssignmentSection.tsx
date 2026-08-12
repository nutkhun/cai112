import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useGroups } from '@/context/GroupContext';
import { Upload, FileText, Trash2, Download, Loader2, Users, User, Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';
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
}

export const AssignmentSection = ({ groupId }: AssignmentSectionProps) => {
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [individualConfirmOpen, setIndividualConfirmOpen] = useState(false);
  const [pendingIndividualProject, setPendingIndividualProject] = useState<{ file: File; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupFileInputRef = useRef<HTMLInputElement>(null);

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
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('group-assignments')
        .remove([assignment.file_path]);

      if (storageError) throw storageError;

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

  const handleDownload = async (assignment: Assignment) => {
    const { data } = supabase.storage
      .from('group-assignments')
      .getPublicUrl(assignment.file_path);

    window.open(data.publicUrl, '_blank');
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
      <div className="space-y-2 max-h-[250px] overflow-y-auto">
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
              <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{assignment.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(assignment.file_size)}
                  {showUploader && ` • by ${getUploaderName(assignment.uploaded_by)}`}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                  className="h-7 w-7 p-0"
                  onClick={() => handleDownload(assignment)}
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(assignment)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
            Assignment Section
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
                <Button
                  variant="outline"
                  className="w-full gap-2"
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
                      Upload Group Assignment
                    </>
                  )}
                </Button>
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
              <Button
                variant="outline"
                className="w-full gap-2"
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
                    Upload My Assignment
                  </>
                )}
              </Button>
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
