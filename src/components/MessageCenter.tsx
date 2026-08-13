import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageSquare, 
  Send, 
  Megaphone, 
  Mail, 
  MailOpen,
  ChevronDown,
  ChevronUp,
  Reply,
  X
} from 'lucide-react';
import { toast } from 'sonner';

interface TeacherMessage {
  id: string;
  sender_type: 'teacher' | 'student';
  sender_student_id: string | null;
  recipient_student_id: string | null;
  recipient_section: string | null;
  message_type: 'announcement' | 'private';
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  reply_to_id: string | null;
  image_path: string | null;
}

const getImageUrl = (imagePath: string) => {
  const { data } = supabase.storage.from('message-images').getPublicUrl(imagePath);
  return data.publicUrl;
};

interface MessageCenterProps {
  /** Start opened - used when the card is the sole content of a mobile tab. */
  defaultExpanded?: boolean;
}

export const MessageCenter = ({ defaultExpanded = false }: MessageCenterProps) => {
  const { currentStudent } = useGroups();
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState('inbox');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<TeacherMessage | null>(null);

  useEffect(() => {
    if (currentStudent) {
      fetchMessages();
      
      // Subscribe to real-time updates
      const channel = supabase
        .channel('teacher-messages-student')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'teacher_messages'
          },
          () => {
            fetchMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentStudent]);

  const fetchMessages = async () => {
    if (!currentStudent) return;

    const { data, error } = await supabase
      .from('teacher_messages')
      .select('*')
      .or(`recipient_student_id.eq.${currentStudent.id},recipient_section.eq.${currentStudent.section},recipient_section.is.null,sender_student_id.eq.${currentStudent.id}`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Filter messages that are relevant to this student
      const relevantMessages = (data as TeacherMessage[]).filter(msg => {
        // Announcements to all
        if (msg.message_type === 'announcement' && !msg.recipient_section) return true;
        // Announcements to section
        if (msg.message_type === 'announcement' && msg.recipient_section === currentStudent.section) return true;
        // Private messages to this student
        if (msg.recipient_student_id === currentStudent.id) return true;
        // Messages sent by this student
        if (msg.sender_student_id === currentStudent.id) return true;
        return false;
      });
      setMessages(relevantMessages);
    }
  };

  const handleSendMessage = async () => {
    if (!currentStudent || !newMessage.trim()) return;

    setSending(true);
    const { error } = await supabase
      .from('teacher_messages')
      .insert({
        sender_type: 'student',
        sender_student_id: currentStudent.id,
        message_type: 'private',
        subject: subject.trim() || null,
        message: newMessage.trim(),
        reply_to_id: replyingTo?.id || null
      });

    if (error) {
      toast.error('Failed to send message');
    } else {
      toast.success('Message sent to teacher');
      setNewMessage('');
      setSubject('');
      setReplyingTo(null);
      fetchMessages();
    }
    setSending(false);
  };

  const handleReply = (message: TeacherMessage) => {
    setReplyingTo(message);
    setActiveTab('compose');
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const markAsRead = async (messageId: string) => {
    const { error } = await supabase
      .from('teacher_messages')
      .update({ is_read: true })
      .eq('id', messageId);
    
    if (!error) {
      // Update local state immediately for better UX
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_read: true } : m
      ));
    }
  };

  // Mark all unread inbox messages as read when viewing inbox
  useEffect(() => {
    if (isExpanded && activeTab === 'inbox' && currentStudent) {
      const unreadMessages = messages.filter(m => 
        m.sender_type === 'teacher' && 
        !m.is_read &&
        (m.recipient_student_id === currentStudent.id || m.message_type === 'announcement')
      );
      
      unreadMessages.forEach(msg => {
        markAsRead(msg.id);
      });
    }
  }, [isExpanded, activeTab, messages, currentStudent]);

  const getMessageById = (id: string) => {
    return messages.find(m => m.id === id);
  };

  // Find the root message of a reply chain
  const findRootMessageId = (msg: TeacherMessage, allMessages: TeacherMessage[]): string => {
    if (!msg.reply_to_id) return msg.id;
    const parent = allMessages.find(m => m.id === msg.reply_to_id);
    if (!parent) return msg.id;
    return findRootMessageId(parent, allMessages);
  };

  // Group messages by reply chain into conversation threads
  const groupMessagesByReplyChain = (msgs: TeacherMessage[]) => {
    const threads: { subject: string | null; messages: TeacherMessage[] }[] = [];
    const threadMap = new Map<string, TeacherMessage[]>();
    
    // Group messages by their root message ID
    msgs.forEach(msg => {
      const rootId = findRootMessageId(msg, messages);
      if (!threadMap.has(rootId)) {
        threadMap.set(rootId, []);
      }
      threadMap.get(rootId)!.push(msg);
    });

    // Convert map to array
    threadMap.forEach((threadMessages) => {
      // Sort messages within thread by date (oldest first for reading order)
      threadMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      // Use subject from first message that has one
      const subjectMsg = threadMessages.find(m => m.subject && m.subject.trim());
      threads.push({ subject: subjectMsg?.subject || null, messages: threadMessages });
    });

    // Sort threads by latest message date (newest thread first)
    threads.sort((a, b) => {
      const aLatest = new Date(a.messages[a.messages.length - 1].created_at).getTime();
      const bLatest = new Date(b.messages[b.messages.length - 1].created_at).getTime();
      return bLatest - aLatest;
    });

    return threads;
  };

  const inboxMessages = messages.filter(m => 
    m.sender_type === 'teacher' && 
    (m.recipient_student_id === currentStudent?.id || 
     m.message_type === 'announcement')
  );
  
  const sentMessages = messages.filter(m => 
    m.sender_student_id === currentStudent?.id
  );

  // Get all messages related to conversations (both sent and received)
  const allConversationMessages = messages.filter(m => 
    (m.sender_type === 'teacher' && (m.recipient_student_id === currentStudent?.id || m.message_type === 'announcement')) ||
    m.sender_student_id === currentStudent?.id
  );

  const inboxThreads = groupMessagesByReplyChain(inboxMessages);
  const sentThreads = groupMessagesByReplyChain(sentMessages);
  const allThreads = groupMessagesByReplyChain(allConversationMessages);

  const unreadCount = inboxMessages.filter(m => !m.is_read).length;

  if (!currentStudent) return null;

  return (
    <Card className="shadow-soft border-0">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-lg">
            <div className="relative">
              <MessageSquare className="w-5 h-5 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              )}
            </div>
            Message Center
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount} new
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
        <CardContent className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="inbox" className="gap-1">
                <Mail className="w-4 h-4" />
                Inbox
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-1">
                <Send className="w-4 h-4" />
                Sent
              </TabsTrigger>
              <TabsTrigger value="compose" className="gap-1">
                <MessageSquare className="w-4 h-4" />
                Compose
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="mt-4">
              <ScrollArea className="h-[55vh] sm:h-[225px] pr-2 sm:pr-4">
                {allThreads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allThreads.map((thread, threadIndex) => {
                      const hasUnread = thread.messages.some(m => m.sender_type === 'teacher' && !m.is_read);
                      const latestMessage = thread.messages[thread.messages.length - 1];
                      
                      return (
                        <div 
                          key={`thread-${threadIndex}`} 
                          className={`rounded-lg border ${hasUnread ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'}`}
                        >
                          {/* Thread subject header */}
                          {thread.subject && thread.messages.length > 1 && (
                            <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-3 h-3 text-primary" />
                                <span className="text-xs font-medium text-primary">
                                  Thread: {thread.subject} ({thread.messages.length} messages)
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {/* Messages in thread */}
                          {thread.messages.map((msg, msgIndex) => {
                            const isFromTeacher = msg.sender_type === 'teacher';
                            const isLastInThread = msgIndex === thread.messages.length - 1;
                            
                            return (
                              <div 
                                key={msg.id} 
                                className={`p-3 ${!isLastInThread ? 'border-b border-border/30' : ''}`}
                              >
                                {/* Wraps instead of squeezing the timestamp on narrow screens. */}
                                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 mb-1">
                                  <div className="flex items-center gap-2">
                                    {isFromTeacher ? (
                                      msg.message_type === 'announcement' ? (
                                        <Megaphone className="w-4 h-4 text-accent" />
                                      ) : (
                                        msg.is_read ? (
                                          <MailOpen className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                          <Mail className="w-4 h-4 text-primary" />
                                        )
                                      )
                                    ) : (
                                      <Send className="w-4 h-4 text-primary" />
                                    )}
                                    <span className="font-medium text-sm">
                                      {isFromTeacher 
                                        ? (msg.message_type === 'announcement' ? 'Announcement' : 'From Teacher')
                                        : 'You'
                                      }
                                    </span>
                                    {msg.message_type === 'announcement' && msg.recipient_section && (
                                      <Badge variant="outline" className="text-xs">
                                        {msg.recipient_section}
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                  </span>
                                </div>
                                {msg.subject && thread.messages.length === 1 && (
                                  <p className="font-medium text-sm mb-1">{msg.subject}</p>
                                )}
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{msg.message}</p>
                                {msg.image_path && (
                                  <img 
                                    src={getImageUrl(msg.image_path)} 
                                    alt="Attachment" 
                                    className="mt-2 max-h-[200px] rounded-lg border cursor-pointer hover:opacity-80"
                                    onClick={() => window.open(getImageUrl(msg.image_path!), '_blank')}
                                  />
                                )}
                              </div>
                            );
                          })}
                          
                          {/* Reply button - only for private message threads */}
                          {latestMessage.message_type === 'private' && (
                            <div className="px-3 pb-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 h-10 md:h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReply(latestMessage);
                                }}
                              >
                                <Reply className="w-3 h-3" />
                                Reply
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sent" className="mt-4">
              <ScrollArea className="h-[55vh] sm:h-[225px] pr-2 sm:pr-4">
                {sentThreads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No sent messages</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sentThreads.map((thread, threadIndex) => (
                      <div key={`sent-thread-${threadIndex}`} className="rounded-lg border bg-muted/30 border-border">
                        {/* Thread subject header */}
                        {thread.subject && thread.messages.length > 1 && (
                          <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium text-primary">
                                Thread: {thread.subject} ({thread.messages.length} messages)
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Messages in thread */}
                        {thread.messages.map((msg, msgIndex) => {
                          const isLastInThread = msgIndex === thread.messages.length - 1;
                          
                          return (
                            <div 
                              key={msg.id} 
                              className={`p-3 ${!isLastInThread ? 'border-b border-border/30' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="font-medium text-sm">To Teacher</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                </span>
                              </div>
                              {msg.subject && thread.messages.length === 1 && (
                                <p className="font-medium text-sm mb-1">{msg.subject}</p>
                              )}
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{msg.message}</p>
                              {msg.image_path && (
                                <img 
                                  src={getImageUrl(msg.image_path)} 
                                  alt="Attachment" 
                                  className="mt-2 max-h-[200px] rounded-lg border cursor-pointer hover:opacity-80"
                                  onClick={() => window.open(getImageUrl(msg.image_path!), '_blank')}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="compose" className="mt-4 space-y-3">
              {/* Reply context preview */}
              {replyingTo && (
                <div className="p-3 rounded-lg bg-muted/50 border border-primary/30 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={cancelReply}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <div className="flex items-center gap-2 mb-1">
                    <Reply className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Replying to:</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate pr-6">
                    {replyingTo.message}
                  </p>
                </div>
              )}
              {/* Subject - only show when not replying */}
              {!replyingTo && (
                <Input
                  placeholder="Subject (optional)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              )}
              <Textarea
                placeholder="Write your message to the teacher..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!newMessage.trim() || sending}
                className="w-full gap-2"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : replyingTo ? 'Send Reply' : 'Send Message'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
};