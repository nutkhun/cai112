import { SECTIONS } from '@/types';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Search, Filter, Download, Calendar, FileText, X, ArrowUpDown, Eye, Check, XIcon } from 'lucide-react';
import { toast } from 'sonner';

interface AbsenceRequest {
  id: string;
  student_id: string;
  absence_date: string;
  reason: string;
  document_path: string;
  document_name: string;
  document_size: number | null;
  status: string;
  created_at: string;
}

export const AbsenceRequestsTab = () => {
  const { students } = useGroups();
  const [absenceRequests, setAbsenceRequests] = useState<AbsenceRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'submitted'>('submitted');

  const sections = [...SECTIONS];

  useEffect(() => {
    fetchAbsenceRequests();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('absence-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'absence_requests'
        },
        () => {
          fetchAbsenceRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAbsenceRequests = async () => {
    const { data, error } = await supabase
      .from('absence_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAbsenceRequests(data as AbsenceRequest[]);
    }
  };

  const getStudentById = (id: string) => {
    return students.find(s => s.id === id);
  };

  const handleViewDocument = (request: AbsenceRequest) => {
    const { data } = supabase.storage
      .from('absence-documents')
      .getPublicUrl(request.document_path);
    window.open(data.publicUrl, '_blank');
  };

  const handleUpdateStatus = async (requestId: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('absence_requests')
      .update({ status })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(`Request ${status}`);
      fetchAbsenceRequests();
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasFilters = sectionFilter !== 'all' || statusFilter !== 'all' || searchQuery !== '';

  const clearFilters = () => {
    setSectionFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const filteredRequests = absenceRequests.filter(request => {
    const student = getStudentById(request.student_id);
    if (!student) return false;

    const matchesSearch =
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.reason.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSection = sectionFilter === 'all' || student.section === sectionFilter;
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;

    return matchesSearch && matchesSection && matchesStatus;
  });

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    const studentA = getStudentById(a.student_id);
    const studentB = getStudentById(b.student_id);

    switch (sortBy) {
      case 'date':
        return new Date(b.absence_date).getTime() - new Date(a.absence_date).getTime();
      case 'name':
        return (studentA?.name || '').localeCompare(studentB?.name || '');
      case 'submitted':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <Card className="shadow-soft border-0 sticky top-[65px] z-20 bg-card backdrop-blur-md">
        <CardContent className="p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, or reason..."
              className="pl-10 h-11"
            />
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filters:</span>
            </div>

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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted Date</SelectItem>
                  <SelectItem value="date">Absence Date</SelectItem>
                  <SelectItem value="name">Student Name</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-9">
                <X className="w-3 h-3" />
                Clear
              </Button>
            )}
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <p className="text-sm text-muted-foreground">
              {sortedRequests.length} request{sortedRequests.length !== 1 ? 's' : ''} found
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-soft border-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Student</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Absence Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Calendar className="w-8 h-8 opacity-50" />
                        <p>No absence requests found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRequests.map((request) => {
                    const student = getStudentById(request.student_id);
                    return (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{student?.name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{student?.studentId || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{student?.section || '-'}</Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(request.absence_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[200px] truncate" title={request.reason}>
                            {request.reason}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDocument(request)}
                            className="gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">{request.document_name}</span>
                            <span className="sm:hidden">View</span>
                          </Button>
                        </TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(request.created_at), 'MMM d, yyyy')}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                onClick={() => handleUpdateStatus(request.id, 'approved')}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => handleUpdateStatus(request.id, 'rejected')}
                              >
                                <XIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
