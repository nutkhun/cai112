import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mail, Send, RefreshCw, Reply, Inbox, PenLine, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface EmailRow {
  id: string;
  direction: 'in' | 'out';
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  student_id: string | null;
  is_read: number;
  created_at: string;
}

interface StudentLite {
  id: string;
  name: string;
  student_id: string;
  section: string;
  email: string | null;
}

interface TeacherEmailTabProps {
  /** Reports the number of unread inbound emails so the header dot can clear. */
  onUnreadCountChange?: (count: number) => void;
}

export const TeacherEmailTab = ({ onUnreadCountChange }: TeacherEmailTabProps) => {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailRow | null>(null);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeStudentId, setComposeStudentId] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSearch, setComposeSearch] = useState('');
  const [composeSection, setComposeSection] = useState('all');

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from('emails').select('*').order('created_at', { ascending: false }),
      supabase.from('students').select('*').order('name'),
    ]);
    if (e) setEmails(e as EmailRow[]);
    if (s) setStudents(s as StudentLite[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();

    // Live updates: refetch whenever an email row changes (new inbound mail
    // is announced on the change feed by the email worker).
    const channel = supabase
      .channel('email-tab-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => {
        fetchAll();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    onUnreadCountChange?.(emails.filter(e => e.direction === 'in' && !e.is_read).length);
  }, [emails, onUnreadCountChange]);

  const studentFor = (row: EmailRow) => {
    if (row.student_id) return students.find(s => s.id === row.student_id);
    const addr = (row.direction === 'in' ? row.from_addr : row.to_addr)?.toLowerCase();
    return addr ? students.find(s => s.email?.toLowerCase() === addr) : undefined;
  };

  const openEmail = async (row: EmailRow) => {
    setSelected(row);
    if (row.direction === 'in' && !row.is_read) {
      setEmails(prev => prev.map(e => (e.id === row.id ? { ...e, is_read: 1 } : e)));
      await supabase.from('emails').update({ is_read: 1 }).eq('id', row.id);
    }
  };

  const startCompose = (student?: StudentLite, replyTo?: EmailRow) => {
    setComposeStudentId(student?.id || '');
    setComposeTo(student?.email || replyTo?.from_addr || '');
    setComposeSubject(replyTo?.subject ? (replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`) : '');
    setComposeBody('');
    setComposeSearch('');
    setComposeSection('all');
    setComposeOpen(true);
  };

  const composeCandidates = students.filter(s => {
    if (!s.email) return false;
    if (composeSection !== 'all' && s.section !== composeSection) return false;
    const q = composeSearch.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.student_id.includes(q) || (s.email || '').toLowerCase().includes(q);
  });

  const handleSend = async () => {
    const to = composeTo.trim();
    if (!to.includes('@')) {
      toast.error('Please choose a student or enter a valid email address');
      return;
    }
    // Open the teacher's own mail app with everything pre-filled - mail is
    // actually sent from nattadej_p@bu.ac.th, so students recognize the sender.
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(composeSubject)}&body=${encodeURIComponent(composeBody)}`;
    window.open(mailto, '_blank');

    // Keep a copy in the dashboard's Sent list.
    const student = students.find(s => s.email?.toLowerCase() === to.toLowerCase());
    await supabase.from('emails').insert({
      id: crypto.randomUUID(),
      direction: 'out',
      from_addr: 'nattadej_p@bu.ac.th',
      to_addr: to,
      subject: composeSubject || null,
      body: composeBody || null,
      student_id: student?.id || null,
      is_read: 1,
    });
    toast.success('Draft opened in your mail app - a copy was saved to Sent');
    setComposeOpen(false);
    fetchAll();
  };

  const inbox = emails.filter(e => e.direction === 'in');
  const sent = emails.filter(e => e.direction === 'out');
  const unread = inbox.filter(e => !e.is_read).length;

  const renderList = (rows: EmailRow[]) =>
    rows.length === 0 ? (
      <div className="py-12 text-center text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-10 w-10 opacity-50" />
        <p className="text-sm">No emails here yet</p>
      </div>
    ) : (
      <div className="space-y-2">
        {rows.map(row => {
          const student = studentFor(row);
          const addr = row.direction === 'in' ? row.from_addr : row.to_addr;
          return (
            <button
              key={row.id}
              onClick={() => openEmail(row)}
              className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                row.direction === 'in' && !row.is_read ? 'border-primary/40 bg-primary/5' : 'bg-card'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {row.direction === 'in' && !row.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <span className={`truncate text-sm ${!row.is_read && row.direction === 'in' ? 'font-semibold' : 'font-medium'}`}>
                    {student ? student.name : addr || 'Unknown'}
                  </span>
                  {student && <Badge variant="secondary" className="shrink-0 text-[10px]">{student.section}</Badge>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(new Date(row.created_at), 'MMM d, HH:mm')}
                </span>
              </div>
              <p className="mt-1 truncate text-sm">{row.subject || '(no subject)'}</p>
              <p className="truncate text-xs text-muted-foreground">{(row.body || '').slice(0, 140)}</p>
            </button>
          );
        })}
      </div>
    );

  return (
    <div className="space-y-4">
      <Card className="shadow-soft border-0">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 text-primary" />
            Student emails to <span className="font-medium text-foreground">nattadej_p@bu.ac.th</span> appear here once forwarding is active.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="gradient" size="sm" onClick={() => startCompose()} className="gap-1.5">
              <PenLine className="h-4 w-4" />
              Compose
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            Inbox
            {unread > 0 && <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">{unread}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" />
            Sent
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4">{renderList(inbox)}</TabsContent>
        <TabsContent value="sent" className="mt-4">{renderList(sent)}</TabsContent>
      </Tabs>

      {/* Read dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-base">{selected.subject || '(no subject)'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">{selected.direction === 'in' ? 'From' : 'To'}:</span> {selected.direction === 'in' ? selected.from_addr : selected.to_addr}</p>
                {studentFor(selected) && (
                  <p>
                    <span className="font-medium text-foreground">Student:</span> {studentFor(selected)!.name} · {studentFor(selected)!.student_id} · {studentFor(selected)!.section}
                  </p>
                )}
                <p><span className="font-medium text-foreground">Date:</span> {format(new Date(selected.created_at), 'EEEE, MMM d yyyy, HH:mm')}</p>
              </div>
              <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">
                {selected.body || '(empty message)'}
              </div>
              {selected.direction === 'in' && (
                <DialogFooter>
                  <Button onClick={() => { const st = studentFor(selected); setSelected(null); startCompose(st, selected); }} className="gap-2">
                    <Reply className="h-4 w-4" />
                    Reply
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              Compose Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Student</Label>
              <div className="flex gap-2">
                <Input
                  value={composeSearch}
                  onChange={(e) => setComposeSearch(e.target.value)}
                  placeholder="Search name, ID, or email..."
                  className="flex-1"
                />
                <Select value={composeSection} onValueChange={setComposeSection}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    <SelectItem value="457A">457A</SelectItem>
                    <SelectItem value="458A">458A</SelectItem>
                    <SelectItem value="458B">458B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border">
                {composeCandidates.length === 0 ? (
                  <p className="p-3 text-center text-sm text-muted-foreground">No students match</p>
                ) : (
                  composeCandidates.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setComposeStudentId(s.id); setComposeTo(s.email!); }}
                      className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 ${
                        composeStudentId === s.id ? 'bg-primary/10' : ''
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">{s.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">{s.section}</Badge>
                        {s.email}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">{composeCandidates.length} student{composeCandidates.length === 1 ? '' : 's'} shown · click one to fill the To field</p>
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="student@bumail.net" inputMode="email" />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Subject" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={7} placeholder="Write your message..." />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
              Send opens the message in your mail app from nattadej_p@bu.ac.th; a copy is kept in Sent here.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} className="gap-2">
              <Send className="h-4 w-4" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
