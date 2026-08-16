import { SECTIONS } from '@/types';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/backend/client';
import { Calendar, Save, Trash2, Plus, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface DueDate {
  id: string;
  assignment_name: string;
  assignment_type: string;
  due_date: string;
  section: string | null;
  created_at: string;
  updated_at: string;
}

const ASSIGNMENT_OPTIONS = [
  { name: 'Assignment 0', type: 'individual' },
  { name: 'Assignment 1', type: 'individual' },
  { name: 'Assignment 2', type: 'individual' },
  { name: 'Assignment 3', type: 'individual' },
  { name: 'Midterm Presentation', type: 'group' },
  { name: 'Final Project', type: 'group' },
];


export const TeacherDueDatesTab = () => {
  const [dueDates, setDueDates] = useState<DueDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New due date form state
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');

  const fetchDueDates = async () => {
    const { data, error } = await supabase
      .from('assignment_due_dates')
      .select('*')
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching due dates:', error);
    } else {
      setDueDates(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDueDates();

    // Real-time subscription
    const channel = supabase
      .channel('due-dates-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignment_due_dates',
        },
        () => {
          fetchDueDates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAddDueDate = async () => {
    if (!selectedAssignment || !selectedDate) {
      toast.error('Please select an assignment and due date');
      return;
    }

    setSaving(true);

    const assignmentOption = ASSIGNMENT_OPTIONS.find(a => a.name === selectedAssignment);
    const section = selectedSection === 'all' ? null : selectedSection;

    // Check if this due date already exists
    const existingDueDate = dueDates.find(
      d => d.assignment_name === selectedAssignment && d.section === section
    );

    if (existingDueDate) {
      // Update existing
      const { error } = await supabase
        .from('assignment_due_dates')
        .update({ due_date: selectedDate })
        .eq('id', existingDueDate.id);

      if (error) {
        toast.error('Failed to update due date');
      } else {
        toast.success('Due date updated');
        resetForm();
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('assignment_due_dates')
        .insert({
          assignment_name: selectedAssignment,
          assignment_type: assignmentOption?.type || 'individual',
          due_date: selectedDate,
          section: section,
        });

      if (error) {
        toast.error('Failed to add due date');
        console.error('Insert error:', error);
      } else {
        toast.success('Due date added');
        resetForm();
      }
    }

    setSaving(false);
  };

  const handleDeleteDueDate = async (id: string) => {
    const { error } = await supabase
      .from('assignment_due_dates')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete due date');
    } else {
      toast.success('Due date removed');
    }
  };

  const resetForm = () => {
    setSelectedAssignment('');
    setSelectedDate('');
    setSelectedSection('all');
  };

  const getAssignmentBadgeVariant = (type: string): "default" | "secondary" => {
    return type === 'group' ? 'default' : 'secondary';
  };

  const formatDueDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM d, yyyy');
  };

  const isOverdue = (dateStr: string) => {
    return new Date(dateStr) < new Date();
  };

  const isDueSoon = (dateStr: string) => {
    const dueDate = new Date(dateStr);
    const now = new Date();
    const daysDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff <= 3;
  };

  return (
    <div className="space-y-6">
      {/* Add Due Date Card */}
      <Card className="shadow-soft border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-display">
            <Plus className="w-5 h-5 text-primary" />
            Set Assignment Due Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Assignment</Label>
              <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assignment" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_OPTIONS.map((option) => (
                    <SelectItem key={option.name} value={option.name}>
                      {option.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({option.type})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>

            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {SECTIONS.map((section) => (
                    <SelectItem key={section} value={section}>
                      {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleAddDueDate}
                disabled={saving || !selectedAssignment || !selectedDate}
                className="w-full gap-2"
              >
                <Save className="w-4 h-4" />
                Save Due Date
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Due Dates Table */}
      <Card className="shadow-soft border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-display">
            <Calendar className="w-5 h-5 text-primary" />
            Assignment Due Dates
            <Badge variant="secondary" className="ml-2">
              {dueDates.length} set
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : dueDates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No due dates set yet</p>
              <p className="text-xs">Add due dates above to notify students</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dueDates.map((dueDate) => (
                    <TableRow key={dueDate.id}>
                      <TableCell className="font-medium">
                        {dueDate.assignment_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getAssignmentBadgeVariant(dueDate.assignment_type)}>
                          {dueDate.assignment_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDueDate(dueDate.due_date)}</TableCell>
                      <TableCell>
                        {dueDate.section || 'All Sections'}
                      </TableCell>
                      <TableCell>
                        {isOverdue(dueDate.due_date) ? (
                          <Badge variant="destructive">Overdue</Badge>
                        ) : isDueSoon(dueDate.due_date) ? (
                          <Badge variant="default" className="bg-amber-500">Due Soon</Badge>
                        ) : (
                          <Badge variant="secondary">Upcoming</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDueDate(dueDate.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
