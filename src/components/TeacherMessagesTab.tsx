import { SECTIONS } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { UsersRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { 
  Search, 
  Send, 
  Megaphone, 
  Mail, 
  MailOpen,
  MessageSquare,
  Users,
  User,
  Trash2,
  Filter,
  X,
  Reply,
  ChevronDown,
  Check,
  ImageIcon,
  Paperclip
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

export const TeacherMessagesTab = () => {
  const { students, groups } = useGroups();
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  
  // Compose state
  const [activeTab, setActiveTab] = useState('inbox');
  const [messageType, setMessageType] = useState<'announcement' | 'private'>('announcement');
  const [recipientType, setRecipientType] = useState<'all' | 'section' | 'group' | 'student'>('all');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<TeacherMessage | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sections = [...SECTIONS];

  useEffect(() => {
    fetchMessages();
    
    const channel = supabase
      .channel('teacher-messages-teacher')
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
  }, []);

  // Mark inbox messages as read when viewing inbox tab
  useEffect(() => {
    if (activeTab === 'inbox') {
      markInboxMessagesAsRead();
    }
  }, [activeTab, messages]);

  const markInboxMessagesAsRead = async () => {
    const unreadIds = messages
      .filter(m => m.sender_type === 'student' && !m.is_read)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      const { error } = await supabase
        .from('teacher_messages')
        .update({ is_read: true })
        .in('id', unreadIds);
      
      if (!error) {
        // Update local state immediately for better UX
        setMessages(prev => prev.map(m => 
          unreadIds.includes(m.id) ? { ...m, is_read: true } : m
        ));
      }
    }
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('teacher_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMessages(data as TeacherMessage[]);
    }
  };

  const getStudentById = (id: string) => {
    return students.find(s => s.id === id);
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (messageType === 'private' && recipientType === 'student' && !selectedStudentId) {
      toast.error('Please select a student');
      return;
    }

    if (messageType === 'private' && recipientType === 'group' && !selectedGroupId) {
      toast.error('Please select a group');
      return;
    }

    setSending(true);
    setUploading(!!selectedImage);

    let imagePath: string | null = null;

    // Upload image if selected
    if (selectedImage) {
      const fileExt = selectedImage.name.split('.').pop();
      const uniqueName = `announcements/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('message-images')
        .upload(uniqueName, selectedImage);
      if (uploadError) {
        toast.error('Failed to upload image');
        setSending(false);
        setUploading(false);
        return;
      }
      imagePath = uniqueName;
    }
    // Handle group messaging - send private message to each group member
    if (messageType === 'private' && recipientType === 'group' && selectedGroupId) {
      const groupMembers = students.filter(s => s.groupId === selectedGroupId);
      
      if (groupMembers.length === 0) {
        toast.error('No members in selected group');
        setSending(false);
        return;
      }

      const messagesToInsert = groupMembers.map(member => ({
        sender_type: 'teacher',
        message_type: 'private',
        subject: subject.trim() || null,
        message: messageContent.trim(),
        reply_to_id: replyingTo?.id || null,
        recipient_student_id: member.id,
        image_path: imagePath
      }));

      const { error } = await supabase
        .from('teacher_messages')
        .insert(messagesToInsert);

      if (error) {
        toast.error('Failed to send messages');
      } else {
        const group = groups.find(g => g.id === selectedGroupId);
        toast.success(`Message sent to ${groupMembers.length} members of ${group?.name || 'group'}`);
        setActiveTab('sent');
        resetComposeForm();
        fetchMessages();
      }
      setSending(false);
      return;
    }

    // Regular single message
    const messageData: any = {
      sender_type: 'teacher',
      message_type: messageType,
      subject: subject.trim() || null,
      message: messageContent.trim(),
      reply_to_id: replyingTo?.id || null,
      image_path: imagePath
    };

    if (messageType === 'announcement') {
      if (recipientType === 'section') {
        messageData.recipient_section = selectedSection;
      }
      // For 'all', recipient_section remains null
    } else {
      // Private message to single student
      messageData.recipient_student_id = selectedStudentId;
    }

    const { error } = await supabase
      .from('teacher_messages')
      .insert(messageData);

    if (error) {
      toast.error('Failed to send message');
    } else {
      toast.success('Message sent successfully');
      setActiveTab('sent');
      resetComposeForm();
      fetchMessages();
    }
    setSending(false);
  };

  const resetComposeForm = () => {
    setMessageType('announcement');
    setRecipientType('all');
    setSelectedSection('');
    setSelectedGroupId('');
    setSelectedStudentId('');
    setSubject('');
    setMessageContent('');
    setReplyingTo(null);
    clearSelectedImage();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const getImageUrl = (imagePath: string) => {
    const { data } = supabase.storage.from('message-images').getPublicUrl(imagePath);
    return data.publicUrl;
  };

  const handleReply = (message: TeacherMessage) => {
    // Get the student who sent the message
    const sender = message.sender_student_id ? getStudentById(message.sender_student_id) : null;
    
    setReplyingTo(message);
    setMessageType('private');
    setRecipientType('student');
    if (sender) {
      setSelectedStudentId(sender.id);
    }
    setActiveTab('compose');
  };

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

  const handleDelete = async (messageId: string) => {
    const { error } = await supabase
      .from('teacher_messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      toast.error('Failed to delete message');
    } else {
      toast.success('Message deleted');
      fetchMessages();
    }
  };

  const filteredMessages = messages.filter(msg => {
    const student = msg.sender_student_id ? getStudentById(msg.sender_student_id) : null;
    const recipient = msg.recipient_student_id ? getStudentById(msg.recipient_student_id) : null;
    
    const matchesSearch = 
      msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipient?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === 'all' || msg.message_type === typeFilter;
    
    const matchesSection = sectionFilter === 'all' || 
      msg.recipient_section === sectionFilter ||
      (msg.sender_student_id && student?.section === sectionFilter) ||
      (msg.recipient_student_id && recipient?.section === sectionFilter);

    return matchesSearch && matchesType && matchesSection;
  });

  const inboxMessages = filteredMessages.filter(m => m.sender_type === 'student');
  const sentMessages = filteredMessages.filter(m => m.sender_type === 'teacher');
  const unreadInboxCount = inboxMessages.filter(m => !m.is_read).length;

  // Get all conversation messages (both student and teacher) for full thread display
  const allConversationMessages = filteredMessages.filter(m => 
    m.sender_type === 'student' || m.sender_type === 'teacher'
  );

  // Group inbox by reply chain but include teacher replies in the conversation
  const inboxThreads = groupMessagesByReplyChain(allConversationMessages).filter(thread => 
    // Only show threads that have at least one student message (inbox perspective)
    thread.messages.some(m => m.sender_type === 'student')
  );
  const sentThreads = groupMessagesByReplyChain(sentMessages);

  const hasFilters = typeFilter !== 'all' || sectionFilter !== 'all' || searchQuery !== '';

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
                placeholder="Search messages..."
                className="pl-10 h-11"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="announcement">Announcements</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
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
                    setTypeFilter('all');
                    setSectionFilter('all');
                    setSearchQuery('');
                  }}
                  className="gap-1 h-9"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages Tabs */}
      <Card className="shadow-soft border-0">
        <CardContent className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="inbox" className="gap-2 relative">
                <div className="relative">
                  <Mail className="w-4 h-4" />
                  {unreadInboxCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
                Inbox ({inboxMessages.length})
                {unreadInboxCount > 0 && (
                  <Badge variant="destructive" className="text-xs ml-1">
                    {unreadInboxCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-2">
                <Send className="w-4 h-4" />
                Sent ({sentMessages.length})
              </TabsTrigger>
              <TabsTrigger value="compose" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Compose
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inbox">
              <ScrollArea className="h-[500px] pr-4">
                {inboxThreads.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No messages from students</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inboxThreads.map((thread, threadIndex) => {
                      const hasUnread = thread.messages.some(m => !m.is_read);
                      const latestMessage = thread.messages[thread.messages.length - 1];
                      const latestSender = latestMessage.sender_student_id ? getStudentById(latestMessage.sender_student_id) : null;
                      
                      return (
                        <div 
                          key={`inbox-thread-${threadIndex}`} 
                          className={`rounded-lg border ${hasUnread ? 'bg-primary/10 border-primary/20' : 'bg-muted/50 border-border'}`}
                        >
                          {/* Thread subject header */}
                          {thread.subject && thread.messages.length > 1 && (
                            <div className="px-4 py-2 border-b border-border/50 bg-muted/20">
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium text-primary">
                                  Thread: {thread.subject} ({thread.messages.length} messages)
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {/* Messages in thread */}
                          {thread.messages.map((msg, msgIndex) => {
                            const sender = msg.sender_student_id ? getStudentById(msg.sender_student_id) : null;
                            const isFromTeacher = msg.sender_type === 'teacher';
                            const isLastInThread = msgIndex === thread.messages.length - 1;
                            
                            return (
                              <div 
                                key={msg.id} 
                                className={`p-4 ${!isLastInThread ? 'border-b border-border/30' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2">
                                    {isFromTeacher ? (
                                      <Send className="w-4 h-4 text-primary" />
                                    ) : (
                                      <User className="w-4 h-4 text-accent" />
                                    )}
                                    <span className="font-medium">
                                      {isFromTeacher ? 'You' : (sender?.name || 'Unknown Student')}
                                    </span>
                                    {!isFromTeacher && sender && (
                                      <>
                                        <Badge variant="outline" className="text-xs">{sender.studentId}</Badge>
                                        <Badge variant="secondary" className="text-xs">{sender.section}</Badge>
                                      </>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => handleDelete(msg.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                                {msg.subject && thread.messages.length === 1 && (
                                  <p className="font-medium mb-1">{msg.subject}</p>
                                )}
                                <p className="text-sm text-muted-foreground">{msg.message}</p>
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
                          
                          {/* Reply button at bottom of thread */}
                          <div className="px-4 pb-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-7 text-xs"
                              onClick={() => handleReply(latestMessage)}
                            >
                              <Reply className="w-3 h-3" />
                              Reply
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sent">
              <ScrollArea className="h-[500px] pr-4">
                {sentThreads.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Send className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No sent messages</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sentThreads.map((thread, threadIndex) => (
                      <div key={`sent-thread-${threadIndex}`} className="rounded-lg border bg-muted/50 border-border">
                        {/* Thread subject header */}
                        {thread.subject && thread.messages.length > 1 && (
                          <div className="px-4 py-2 border-b border-border/50 bg-muted/20">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium text-primary">
                                Thread: {thread.subject} ({thread.messages.length} messages)
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Messages in thread */}
                        {thread.messages.map((msg, msgIndex) => {
                          const recipient = msg.recipient_student_id ? getStudentById(msg.recipient_student_id) : null;
                          const isLastInThread = msgIndex === thread.messages.length - 1;
                          
                          return (
                            <div 
                              key={msg.id} 
                              className={`p-4 ${!isLastInThread ? 'border-b border-border/30' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  {msg.message_type === 'announcement' ? (
                                    <Megaphone className="w-4 h-4 text-accent" />
                                  ) : (
                                    <Mail className="w-4 h-4 text-primary" />
                                  )}
                                  <span className="font-medium">
                                    {msg.message_type === 'announcement' 
                                      ? `Announcement${msg.recipient_section ? ` to ${msg.recipient_section}` : ' to All'}`
                                      : `To: ${recipient?.name || 'Unknown Student'}`
                                    }
                                  </span>
                                  {recipient && msg.message_type === 'private' && (
                                    <>
                                      <Badge variant="outline" className="text-xs">{recipient.studentId}</Badge>
                                      <Badge variant="secondary" className="text-xs">{recipient.section}</Badge>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(msg.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                              {msg.subject && thread.messages.length === 1 && (
                                <p className="font-medium mb-1">{msg.subject}</p>
                              )}
                              <p className="text-sm text-muted-foreground">{msg.message}</p>
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
                    onClick={() => setReplyingTo(null)}
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

              {/* Only show these options when NOT replying */}
              {!replyingTo && (
                <>
                  {/* Message Type */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Message Type</label>
                    <div className="flex gap-2">
                      <Button
                        variant={messageType === 'announcement' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setMessageType('announcement');
                          setSelectedStudentId('');
                        }}
                        className="gap-2"
                      >
                        <Megaphone className="w-4 h-4" />
                        Announcement
                      </Button>
                      <Button
                        variant={messageType === 'private' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setMessageType('private');
                          setRecipientType('student');
                        }}
                        className="gap-2"
                      >
                        <Mail className="w-4 h-4" />
                        Private
                      </Button>
                    </div>
                  </div>

                  {/* Recipients */}
                  {messageType === 'announcement' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Send To</label>
                      <div className="flex gap-2">
                        <Button
                          variant={recipientType === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setRecipientType('all');
                            setSelectedSection('');
                          }}
                          className="gap-2"
                        >
                          <Users className="w-4 h-4" />
                          All Students
                        </Button>
                        <Button
                          variant={recipientType === 'section' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setRecipientType('section')}
                          className="gap-2"
                        >
                          <Users className="w-4 h-4" />
                          By Section
                        </Button>
                      </div>
                      
                      {recipientType === 'section' && (
                        <Select value={selectedSection} onValueChange={setSelectedSection}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                          <SelectContent>
                            {sections.map(section => (
                              <SelectItem key={section} value={section}>{section}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {messageType === 'private' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Send To</label>
                      <div className="flex gap-2">
                        <Button
                          variant={recipientType === 'student' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setRecipientType('student');
                            setSelectedGroupId('');
                          }}
                          className="gap-2"
                        >
                          <User className="w-4 h-4" />
                          Single Student
                        </Button>
                        <Button
                          variant={recipientType === 'group' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setRecipientType('group');
                            setSelectedStudentId('');
                          }}
                          className="gap-2"
                        >
                          <UsersRound className="w-4 h-4" />
                          By Group
                        </Button>
                      </div>

                      {recipientType === 'student' && (
                        <Popover open={studentDropdownOpen} onOpenChange={setStudentDropdownOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={studentDropdownOpen}
                              className="w-full justify-between font-normal"
                            >
                              {selectedStudentId
                                ? (() => {
                                    const s = students.find(st => st.id === selectedStudentId);
                                    return s ? `${s.name} (${s.studentId}) - ${s.section}` : 'Select a student';
                                  })()
                                : 'Select a student'}
                              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <div className="p-2 border-b">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search by name or ID..."
                                  value={studentSearchQuery}
                                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                                  className="pl-8 h-9"
                                />
                              </div>
                            </div>
                            <ScrollArea className="h-[250px]">
                              <div className="p-1">
                                {students
                                  .filter(s => {
                                    const query = studentSearchQuery.toLowerCase();
                                    return (
                                      s.name.toLowerCase().includes(query) ||
                                      s.studentId.toLowerCase().includes(query)
                                    );
                                  })
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map(student => (
                                    <div
                                      key={student.id}
                                      className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-accent ${
                                        selectedStudentId === student.id ? 'bg-accent' : ''
                                      }`}
                                      onClick={() => {
                                        setSelectedStudentId(student.id);
                                        setStudentDropdownOpen(false);
                                        setStudentSearchQuery('');
                                      }}
                                    >
                                      <Check
                                        className={`h-4 w-4 ${
                                          selectedStudentId === student.id ? 'opacity-100' : 'opacity-0'
                                        }`}
                                      />
                                      <div className="flex-1 truncate">
                                        <span className="font-medium">{student.name}</span>
                                        <span className="text-muted-foreground ml-2">({student.studentId})</span>
                                        <Badge variant="outline" className="ml-2 text-xs">{student.section}</Badge>
                                      </div>
                                    </div>
                                  ))}
                                {students.filter(s => {
                                  const query = studentSearchQuery.toLowerCase();
                                  return s.name.toLowerCase().includes(query) || s.studentId.toLowerCase().includes(query);
                                }).length === 0 && (
                                  <div className="text-center py-4 text-muted-foreground text-sm">
                                    No students found
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      )}

                      {recipientType === 'group' && (
                        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select group" />
                          </SelectTrigger>
                          <SelectContent>
                            {groups.map(group => {
                              const memberCount = students.filter(s => s.groupId === group.id).length;
                              return (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name} ({memberCount} members)
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {/* Subject */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject (optional)</label>
                    <Input
                      placeholder="Enter subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Image attachment */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Image (optional)</label>
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImageSelect}
                  className="hidden"
                  accept="image/*"
                />
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="Preview" className="max-h-[150px] rounded-lg border" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={clearSelectedImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    className="gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Attach Image
                  </Button>
                )}
              </div>

              {/* Message */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea
                  placeholder="Type your message..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={4}
                />
              </div>

              <Button 
                onClick={handleSendMessage} 
                disabled={!messageContent.trim() || sending || uploading}
                className="w-full gap-2"
              >
                <Send className="w-4 h-4" />
                {uploading ? 'Uploading image...' : sending ? 'Sending...' : replyingTo ? 'Send Reply' : 'Send Message'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
