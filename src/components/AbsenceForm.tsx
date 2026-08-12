import { useState, useEffect } from 'react';
import { useGroups } from '@/context/GroupContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Upload, FileText, Loader2, CheckCircle, Clock, XCircle, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { format, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface AbsenceRequest {
  id: string;
  absence_date: string;
  reason: string;
  status: string;
  created_at: string;
}

export const AbsenceForm = () => {
  const { currentStudent } = useGroups();
  const { toast } = useToast();
  const [absenceDate, setAbsenceDate] = useState<Date>();
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [submittedRequests, setSubmittedRequests] = useState<AbsenceRequest[]>([]);
  const [editingRequest, setEditingRequest] = useState<AbsenceRequest | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch student's submitted absence requests
  useEffect(() => {
    const fetchSubmittedRequests = async () => {
      if (!currentStudent) return;
      
      const { data, error } = await supabase
        .from('absence_requests')
        .select('id, absence_date, reason, status, created_at')
        .eq('student_id', currentStudent.id)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setSubmittedRequests(data);
      }
    };

    fetchSubmittedRequests();

    // Set up real-time subscription for status updates
    if (!currentStudent) return;

    const channel = supabase
      .channel(`absence-requests-${currentStudent.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'absence_requests',
          filter: `student_id=eq.${currentStudent.id}`
        },
        (payload) => {
          console.log('Absence request realtime update:', payload);
          
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as AbsenceRequest;
            setSubmittedRequests(prev => 
              prev.map(req => req.id === updated.id ? { ...req, status: updated.status } : req)
            );
            
            if (updated.status !== 'pending') {
              toast({
                title: `Absence request ${updated.status}`,
                description: `Your absence request has been ${updated.status} by the teacher.`
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string };
            setSubmittedRequests(prev => prev.filter(req => req.id !== deleted.id));
          }
        }
      )
      .subscribe((status) => {
        console.log('Absence requests subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStudent, toast]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Pending</Badge>;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB",
          variant: "destructive"
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For new submissions, file is required. For edits, file is optional
    if (!currentStudent || !absenceDate || !reason.trim() || (!file && !editingRequest)) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let documentPath = editingRequest ? undefined : '';
      let documentName = editingRequest ? undefined : '';
      let documentSize = editingRequest ? undefined : 0;

      // Upload new document if provided
      if (file) {
        const fileName = `${currentStudent.id}/${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('absence-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        
        documentPath = fileName;
        documentName = file.name;
        documentSize = file.size;
      }

      if (editingRequest) {
        // Update existing request
        const updateData: any = {
          absence_date: format(absenceDate, 'yyyy-MM-dd'),
          reason: reason.trim(),
        };
        
        if (file) {
          updateData.document_path = documentPath;
          updateData.document_name = documentName;
          updateData.document_size = documentSize;
        }

        const { error: updateError } = await supabase
          .from('absence_requests')
          .update(updateData)
          .eq('id', editingRequest.id);

        if (updateError) throw updateError;

        // Update local state
        setSubmittedRequests(prev => prev.map(req => 
          req.id === editingRequest.id 
            ? { ...req, absence_date: format(absenceDate, 'yyyy-MM-dd'), reason: reason.trim() }
            : req
        ));

        toast({
          title: "Request updated",
          description: "Your absence request has been updated successfully"
        });

        setEditingRequest(null);
      } else {
        // Create new absence request
        const { data: insertedData, error: insertError } = await supabase
          .from('absence_requests')
          .insert({
            student_id: currentStudent.id,
            absence_date: format(absenceDate, 'yyyy-MM-dd'),
            reason: reason.trim(),
            document_path: documentPath,
            document_name: documentName,
            document_size: documentSize
          })
          .select('id, absence_date, reason, status, created_at')
          .single();

        if (insertError) throw insertError;

        // Add to submitted requests list with actual ID from database
        if (insertedData) {
          setSubmittedRequests(prev => [insertedData, ...prev]);
        }

        toast({
          title: "Absence form submitted",
          description: "Your absence request has been submitted successfully"
        });
      }

      // Reset form
      setAbsenceDate(undefined);
      setReason('');
      setFile(null);
    } catch (error: any) {
      console.error('Error submitting absence form:', error);
      toast({
        title: "Submission failed",
        description: error.message || "Failed to submit absence form",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (request: AbsenceRequest) => {
    setEditingRequest(request);
    setAbsenceDate(new Date(request.absence_date));
    setReason(request.reason);
    setFile(null);
  };

  const handleCancelEdit = () => {
    setEditingRequest(null);
    setAbsenceDate(undefined);
    setReason('');
    setFile(null);
  };

  const handleDelete = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('absence_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      setSubmittedRequests(prev => prev.filter(req => req.id !== requestId));
      
      toast({
        title: "Request deleted",
        description: "Your absence request has been deleted"
      });
    } catch (error: any) {
      console.error('Error deleting absence request:', error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete absence request",
        variant: "destructive"
      });
    }
  };

  const pendingCount = submittedRequests.filter(r => r.status === 'pending').length;

  return (
    <Card className="shadow-soft border-0">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-lg">
            <FileText className="w-5 h-5 text-primary" />
            {editingRequest ? 'Edit Absence Request' : 'Absence Form'}
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Date Picker */}
            <div className="space-y-1">
              <Label htmlFor="absence-date" className="text-xs">Date of Absence *</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal h-8",
                      !absenceDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {absenceDate ? format(absenceDate, "PPP") : <span>Select date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={absenceDate}
                    onSelect={(date) => {
                      setAbsenceDate(date);
                      setIsCalendarOpen(false);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <Label htmlFor="reason" className="text-xs">Reason for Absence *</Label>
              <Textarea
                id="reason"
                placeholder="Explain the reason..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[60px] resize-none text-sm"
                required
              />
            </div>

            {/* Document Upload */}
            <div className="space-y-1">
              <Label htmlFor="document" className="text-xs">
                Document {editingRequest ? '(optional)' : '*'}
              </Label>
              <Input
                id="document"
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('document')?.click()}
                className="w-full h-8"
              >
                <Upload className="w-3 h-3 mr-2" />
                {file ? file.name : 'Upload (Max 10MB)'}
              </Button>
            </div>

            {/* Submit Button */}
            <div className="flex gap-2">
              {editingRequest && (
                <Button 
                  type="button" 
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                size="sm"
                className="flex-1 h-8"
                disabled={isSubmitting || !absenceDate || !reason.trim() || (!file && !editingRequest)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {editingRequest ? 'Updating...' : 'Submitting...'}
                  </>
                ) : (
                  editingRequest ? 'Update' : 'Submit'
                )}
              </Button>
            </div>
          </form>

          {/* Submitted Requests History */}
          {submittedRequests.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-medium mb-2 text-muted-foreground">Submitted Requests</h4>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {submittedRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs gap-2"
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className="mt-0.5">{getStatusIcon(request.status)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">
                          {request.reason}
                        </p>
                        <p className="text-xs">
                          {isBefore(new Date(request.absence_date), startOfDay(new Date())) 
                            ? 'Missed' 
                            : 'Scheduled'}: {format(new Date(request.absence_date), 'PPP')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Submitted: {format(new Date(request.created_at), 'PPP')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {getStatusBadge(request.status)}
                      {request.status === 'pending' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleEdit(request)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(request.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
