import { SECTIONS } from '@/types';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { 
  Search, 
  Upload, 
  FileText, 
  Download,
  Trash2,
  Filter,
  X,
  Plus,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { TeacherDueDatesTab } from './TeacherDueDatesTab';

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  section: string | null;
  category: string | null;
  assignment_name: string | null;
  created_at: string;
}

/** Upload categories; assignment-like ones can carry a due date. */
export const MATERIAL_CATEGORIES = [
  { value: 'lecture', label: 'Material (weekly lecture files)', badge: 'Material', dueDateFor: null as string | null, badgeClass: 'bg-muted text-foreground' },
  { value: 'assignment', label: 'Assignment (A1-A3 or extra)', badge: 'Assignment', dueDateFor: 'choose', badgeClass: 'bg-primary/15 text-primary' },
  { value: 'midterm', label: 'Project - Midterm Brief', badge: 'Midterm', dueDateFor: 'Midterm Presentation', badgeClass: 'bg-amber-500/15 text-amber-600' },
  { value: 'final', label: 'Project - Final Brief', badge: 'Final', dueDateFor: 'Final Project', badgeClass: 'bg-destructive/15 text-destructive' },
];

const ASSIGNMENT_NAMES = ['Assignment 0', 'Assignment 1', 'Assignment 2', 'Assignment 3'];
const NEW_ASSIGNMENT = '__new__';

export const TeacherMaterialsTab = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetSection, setTargetSection] = useState<string>('all');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState<string>('lecture');
  const [linkedAssignment, setLinkedAssignment] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [customs, setCustoms] = useState<{ name: string; max_score: number }[]>([]);
  const [newAssignmentName, setNewAssignmentName] = useState('');
  const [newAssignmentMax, setNewAssignmentMax] = useState('10');

  const fetchCustoms = async () => {
    const { data } = await supabase.from('custom_assignments').select('*');
    if (data) setCustoms(data as { name: string; max_score: number }[]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };
  const sections = [...SECTIONS];

  const [allDueDates, setAllDueDates] = useState<{ assignment_name: string; due_date: string; section: string | null }[]>([]);

  useEffect(() => {
    fetchMaterials();
    fetchAllDueDates();
    fetchCustoms();

    const channel = supabase
      .channel('teacher-materials-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, () => fetchMaterials())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_due_dates' }, () => fetchAllDueDates())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAllDueDates = async () => {
    const { data } = await supabase.from('assignment_due_dates').select('*');
    if (data) setAllDueDates(data);
  };

  const dueDateFor = (material: Material) => {
    if (!material.assignment_name) return null;
    const matches = allDueDates.filter(d => d.assignment_name === material.assignment_name);
    const due = matches.find(d => d.section === material.section) || matches.find(d => !d.section) || matches[0];
    return due ? due.due_date : null;
  };

  const fetchMaterials = async () => {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMaterials(data);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    // Creating a brand-new assignment straight from this dialog.
    let effectiveAssignment = linkedAssignment;
    if (category === 'assignment' && linkedAssignment === NEW_ASSIGNMENT) {
      const name = newAssignmentName.trim();
      if (!name) {
        toast.error('Please name the new assignment');
        return;
      }
      if ([...ASSIGNMENT_NAMES, 'Midterm Presentation', 'Final Project'].some(n => n.toLowerCase() === name.toLowerCase()) ||
          customs.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        toast.error('An assignment with this name already exists');
        return;
      }
      const max = parseFloat(newAssignmentMax);
      if (isNaN(max) || max <= 0) {
        toast.error('Max score must be a positive number');
        return;
      }
      const { error: caError } = await supabase.from('custom_assignments').insert({
        id: crypto.randomUUID(),
        name,
        max_score: max,
        open_date: null,
        due_date: dueDate || null,
        section: targetSection === 'all' ? null : targetSection,
      });
      if (caError) {
        toast.error('Failed to create the new assignment');
        return;
      }
      effectiveAssignment = name;
    }

    setUploading(true);

    try {
      // Upload file to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${selectedFile.name}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('materials')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Save material record
      const { error: insertError } = await supabase
        .from('materials')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          section: targetSection === 'all' ? null : targetSection,
          category,
          assignment_name:
            category === 'assignment' ? effectiveAssignment || null :
            category === 'midterm' ? 'Midterm Presentation' :
            category === 'final' ? 'Final Project' : null
        });

      if (insertError) throw insertError;

      // Assignment-like uploads can set their due date in the same step.
      const catDef = MATERIAL_CATEGORIES.find(c => c.value === category);
      const dueAssignment = catDef?.dueDateFor === 'choose' ? effectiveAssignment : catDef?.dueDateFor;
      if (dueAssignment && dueDate) {
        const section = targetSection === 'all' ? null : targetSection;
        const { data: existing } = await supabase
          .from('assignment_due_dates')
          .select('*')
          .eq('assignment_name', dueAssignment);
        const match = (existing || []).find((d: { section: string | null }) => d.section === section);
        const isGroup = dueAssignment === 'Midterm Presentation' || dueAssignment === 'Final Project';
        const { error: dueError } = match
          ? await supabase.from('assignment_due_dates').update({ due_date: dueDate }).eq('id', match.id)
          : await supabase.from('assignment_due_dates').insert({
              assignment_name: dueAssignment,
              assignment_type: isGroup ? 'group' : 'individual',
              due_date: dueDate,
              section,
            });
        if (dueError) {
          toast.error('Material saved, but setting the due date failed - set it under Due Dates.');
        } else {
          toast.success(`Uploaded, due date for ${dueAssignment} set to ${dueDate}`);
        }
      } else {
        toast.success('Material uploaded successfully');
      }

      setUploadDialogOpen(false);
      resetUploadForm();
      fetchMaterials();
      fetchAllDueDates();
      fetchCustoms();
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    }

    setUploading(false);
  };

  const resetUploadForm = () => {
    setTitle('');
    setDescription('');
    setTargetSection('all');
    setSelectedFile(null);
    setCategory('lecture');
    setLinkedAssignment('');
    setDueDate('');
    setNewAssignmentName('');
    setNewAssignmentMax('10');
  };

  const handleDownload = async (material: Material) => {
    const { data } = supabase.storage
      .from('materials')
      .getPublicUrl(material.file_path);

    if (data?.publicUrl) {
      const link = document.createElement('a');
      link.href = data.publicUrl;
      link.download = material.file_name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDelete = async (material: Material) => {
    // Delete from storage
    await supabase.storage
      .from('materials')
      .remove([material.file_path]);

    // Delete record
    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', material.id);

    if (error) {
      toast.error('Failed to delete material');
    } else {
      toast.success('Material deleted');
      fetchMaterials();
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = 
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSection = sectionFilter === 'all' ||
      m.section === sectionFilter ||
      m.section === null;

    const matchesCategory = categoryFilter === 'all' || (m.category || 'lecture') === categoryFilter;

    return matchesSearch && matchesSection && matchesCategory;
  });

  const hasFilters = sectionFilter !== 'all' || searchQuery !== '' || categoryFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <Card className="shadow-soft border-0 sticky top-[65px] z-20 bg-card backdrop-blur-md">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials..."
                className="pl-10 h-11"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {MATERIAL_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.badge}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sectionFilter} onValueChange={setSectionFilter}>
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

              {hasFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSectionFilter('all');
                    setSearchQuery('');
                    setCategoryFilter('all');
                  }}
                  className="gap-1 h-9"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </div>

            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="gradient" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Upload Material
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Course Material</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category *</label>
                    <Select value={category} onValueChange={(v) => { setCategory(v); setLinkedAssignment(''); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MATERIAL_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {category === 'assignment' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Which assignment is this for? *</label>
                      <Select value={linkedAssignment} onValueChange={setLinkedAssignment}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select assignment" />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNMENT_NAMES.map(name => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                          {customs.map(c => (
                            <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                          ))}
                          <SelectItem value={NEW_ASSIGNMENT}>+ Create a new assignment...</SelectItem>
                        </SelectContent>
                      </Select>
                      {linkedAssignment === NEW_ASSIGNMENT && (
                        <div className="grid grid-cols-[1fr_110px] gap-2 rounded-lg border bg-muted/30 p-2">
                          <Input
                            placeholder="New assignment name, e.g. Assignment 4"
                            value={newAssignmentName}
                            onChange={(e) => setNewAssignmentName(e.target.value)}
                          />
                          <Input
                            type="number"
                            min="1"
                            step="0.5"
                            value={newAssignmentMax}
                            onChange={(e) => setNewAssignmentMax(e.target.value)}
                            title="Max score"
                            placeholder="Max"
                          />
                          <p className="col-span-2 text-xs text-muted-foreground">
                            Created on upload - students can then submit it like A1-A3, and you grade it out of this max score.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {category !== 'lecture' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Due date (optional - set it right here)</label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Saving with a due date updates the deadline students see and the late-deduction tracking.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title *</label>
                    <Input
                      placeholder="Enter material title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description (optional)</label>
                    <Textarea
                      placeholder="Enter description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Section</label>
                    <Select value={targetSection} onValueChange={setTargetSection}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sections</SelectItem>
                        {sections.map(section => (
                          <SelectItem key={section} value={section}>{section}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">File *</label>
                    <div 
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        isDragging ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        id="material-file"
                        className="hidden"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                      <label
                        htmlFor="material-file"
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <Upload className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                        {selectedFile ? (
                          <div>
                            <p className="font-medium">{selectedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(selectedFile.size)}
                            </p>
                          </div>
                        ) : (
                          <p className={isDragging ? 'text-primary font-medium' : 'text-muted-foreground'}>
                            {isDragging ? 'Drop file here' : 'Click to select file or drag and drop'}
                          </p>
                        )}
                      </label>
                    </div>
                  </div>

                  <Button 
                    onClick={handleUpload} 
                    disabled={uploading || !title.trim() || !selectedFile || (category === 'assignment' && (!linkedAssignment || (linkedAssignment === NEW_ASSIGNMENT && !newAssignmentName.trim())))}
                    className="w-full gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading...' : 'Upload Material'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Materials List */}
      {filteredMaterials.length === 0 ? (
        <Card className="shadow-soft border-0">
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No materials uploaded yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Upload Material" to add course materials
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredMaterials.map(material => (
            <Card key={material.id} className="shadow-soft border-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{material.title}</h4>
                      {material.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {material.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {(() => {
                          const cat = MATERIAL_CATEGORIES.find(c => c.value === (material.category || 'lecture')) || MATERIAL_CATEGORIES[0];
                          const label = material.assignment_name
                            ? material.assignment_name.replace('Midterm Presentation', 'Midterm').replace('Final Project', 'Final')
                            : cat.badge;
                          return <Badge className={`text-xs border-0 ${cat.badgeClass}`}>{label}</Badge>;
                        })()}
                        {(() => {
                          const due = dueDateFor(material);
                          if (!due) return null;
                          const overdue = new Date(due.slice(0, 10) + 'T23:59:59') < new Date();
                          return (
                            <Badge className={`text-xs border-0 font-semibold ${overdue ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-600'}`}>
                              Due {format(new Date(due.slice(0, 10) + 'T00:00:00'), 'EEE, MMM d')}
                            </Badge>
                          );
                        })()}
                        <Badge variant="outline" className="text-xs">
                          {material.file_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(material.file_size)}
                        </span>
                        <Badge 
                          variant={material.section ? 'secondary' : 'default'}
                          className="text-xs"
                        >
                          {material.section || 'All Sections'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(material.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(material)}
                      className="gap-1"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(material)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Advanced: adjust deadlines and manage extra assignments without re-uploading */}
      <Collapsible>
        <Card className="shadow-soft border-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                Deadlines & extra assignments (advanced) - adjust due dates without re-uploading
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 pt-2">
              <TeacherDueDatesTab />
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
