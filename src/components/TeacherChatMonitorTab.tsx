import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  MessageCircle, 
  Search, 
  Download, 
  FileIcon, 
  CornerDownRight,
  Users,
  Clock,
  Filter,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Message {
  id: string;
  group_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  file_path?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  reply_to_id?: string | null;
}

interface GroupStats {
  groupId: string;
  groupName: string;
  section: string;
  memberCount: number;
  messageCount: number;
  lastActivity: string | null;
}

export const TeacherChatMonitorTab = () => {
  const { groups, students } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [groupStats, setGroupStats] = useState<GroupStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = ['257A'];

  // Fetch group stats on mount
  useEffect(() => {
    fetchGroupStats();
    
    // Real-time subscription for new messages
    const channel = supabase
      .channel('teacher-chat-monitor')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_messages'
        },
        () => {
          fetchGroupStats();
          if (selectedGroupId) {
            fetchMessages(selectedGroupId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroupId]);

  const fetchGroupStats = async () => {
    const stats: GroupStats[] = [];

    for (const group of groups) {
      const groupMembers = students.filter(s => s.groupId === group.id);
      const section = groupMembers[0]?.section || 'Unknown';

      // Get message count and last activity
      const { count, error: countError } = await supabase
        .from('group_messages')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id);

      const { data: lastMsg, error: lastError } = await supabase
        .from('group_messages')
        .select('created_at')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .limit(1);

      stats.push({
        groupId: group.id,
        groupName: group.name,
        section,
        memberCount: groupMembers.length,
        messageCount: count || 0,
        lastActivity: lastMsg?.[0]?.created_at || null
      });
    }

    // Sort by last activity (most recent first)
    stats.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });

    setGroupStats(stats);
  };

  const handleDeleteGroup = async (groupId: string) => {
    setDeleting(true);
    try {
      // 1. Update students to remove group_id
      const { error: studentError } = await supabase
        .from('students')
        .update({ group_id: null })
        .eq('group_id', groupId);

      if (studentError) throw studentError;

      // 2. Delete group messages
      const { error: messagesError } = await supabase
        .from('group_messages')
        .delete()
        .eq('group_id', groupId);

      if (messagesError) throw messagesError;

      // 3. Delete group invitations
      const { error: invitationsError } = await supabase
        .from('group_invitations')
        .delete()
        .eq('group_id', groupId);

      if (invitationsError) throw invitationsError;

      // 4. Delete join requests
      const { error: joinRequestsError } = await supabase
        .from('join_requests')
        .delete()
        .eq('group_id', groupId);

      if (joinRequestsError) throw joinRequestsError;

      // 5. Delete assignments
      const { error: assignmentsError } = await supabase
        .from('assignments')
        .delete()
        .eq('group_id', groupId);

      if (assignmentsError) throw assignmentsError;

      // 6. Delete the group
      const { error: groupError } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (groupError) throw groupError;

      toast.success('Group deleted successfully');
      setDeleteGroupId(null);
      fetchGroupStats();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  const fetchMessages = async (groupId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    fetchMessages(groupId);
  };

  const getSenderName = (senderId: string) => {
    const student = students.find(s => s.id === senderId);
    return student?.name || 'Unknown';
  };

  // Color pairs for member identification
  const colorPairs = [
    { text: 'text-blue-400', bg: 'bg-blue-500/30' },
    { text: 'text-green-400', bg: 'bg-green-500/30' },
    { text: 'text-purple-400', bg: 'bg-purple-500/30' },
    { text: 'text-orange-400', bg: 'bg-orange-500/30' },
    { text: 'text-pink-400', bg: 'bg-pink-500/30' },
  ];

  const groupMembers = selectedGroupId 
    ? students.filter(s => s.groupId === selectedGroupId).sort((a, b) => a.id.localeCompare(b.id)) 
    : [];

  const getMemberColors = (senderId: string) => {
    const memberIndex = groupMembers.findIndex(m => m.id === senderId);
    const index = memberIndex >= 0 ? memberIndex : 0;
    return colorPairs[index % colorPairs.length];
  };

  const formatTime = (timestamp: string) => {
    return format(new Date(timestamp), 'h:mm a');
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return format(date, 'MMM d, yyyy');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isImageFile = (fileType?: string | null) => {
    return fileType?.startsWith('image/');
  };

  const getFileUrl = (filePath: string) => {
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('File downloaded!');
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  // Filter groups
  const filteredGroups = groupStats.filter(stat => {
    const matchesSection = sectionFilter === 'all' || stat.section === sectionFilter;
    const matchesSearch = stat.groupName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSection && matchesSearch;
  });

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    const senderName = getSenderName(msg.sender_id);
    return (
      msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      senderName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  filteredMessages.forEach(msg => {
    const dateStr = formatDate(msg.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.date === dateStr) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateStr, messages: [msg] });
    }
  });

  const getReplyMessage = (replyToId: string) => {
    return messages.find(m => m.id === replyToId);
  };

  const renderReplyPreview = (replyToId: string) => {
    const replyMsg = getReplyMessage(replyToId);
    if (!replyMsg) return null;
    
    const senderName = getSenderName(replyMsg.sender_id);
    const memberColors = getMemberColors(replyMsg.sender_id);
    
    return (
      <div className="flex items-start gap-1.5 mb-1.5 text-xs bg-background/30 rounded-lg p-1.5 border-l-2 border-muted-foreground/50">
        <CornerDownRight className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 overflow-hidden">
          <span className={`font-semibold ${memberColors.text}`}>{senderName}</span>
          <p className="text-muted-foreground truncate">
            {replyMsg.message || (replyMsg.file_name ? `📎 ${replyMsg.file_name}` : '')}
          </p>
        </div>
      </div>
    );
  };

  const renderAttachment = (msg: Message) => {
    if (!msg.file_path || !msg.file_name) return null;

    const fileUrl = getFileUrl(msg.file_path);

    if (isImageFile(msg.file_type)) {
      return (
        <div className="mt-2 relative group max-w-[200px]">
          <img 
            src={fileUrl} 
            alt={msg.file_name} 
            className="w-full rounded-lg max-h-[200px] object-cover cursor-pointer"
            onClick={() => window.open(fileUrl, '_blank')}
          />
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleDownload(msg.file_path!, msg.file_name!)}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div 
        className="mt-2 flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity max-w-[200px] bg-background/50"
        onClick={() => handleDownload(msg.file_path!, msg.file_name!)}
      >
        <FileIcon className="h-6 w-6 shrink-0" />
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-sm font-medium truncate">{msg.file_name}</p>
          {msg.file_size && (
            <p className="text-xs opacity-70">{formatFileSize(msg.file_size)}</p>
          )}
        </div>
        <Download className="h-4 w-4 shrink-0" />
      </div>
    );
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="shadow-soft border-0 sticky top-[65px] z-20 bg-card backdrop-blur-md">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={selectedGroupId ? "Search messages..." : "Search groups..."}
                className="pl-10 h-11"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
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
            </div>

            {selectedGroupId && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSelectedGroupId(null);
                  setMessages([]);
                  setSearchQuery('');
                }}
              >
                ← Back to Groups
              </Button>
            )}
          </div>

          {/* Stats Summary */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>{groups.length} Groups</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4" />
              <span>{groupStats.reduce((sum, g) => sum + g.messageCount, 0)} Total Messages</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      {!selectedGroupId ? (
        /* Group List */
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map(stat => (
            <Card 
              key={stat.groupId} 
              className="shadow-soft border-0 hover:bg-muted/50 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => handleGroupSelect(stat.groupId)}
                  >
                    <h3 className="font-semibold text-lg">{stat.groupName}</h3>
                    <Badge variant="secondary" className="text-xs">{stat.section}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-primary" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteGroupId(stat.groupId);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div 
                  className="cursor-pointer"
                  onClick={() => handleGroupSelect(stat.groupId)}
                >
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{stat.memberCount} members</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{stat.messageCount} msgs</span>
                    </div>
                  </div>
                  
                  {stat.lastActivity && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Clock className="w-3 h-3" />
                      <span>Last activity: {format(new Date(stat.lastActivity), 'MMM d, h:mm a')}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredGroups.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No groups found</p>
            </div>
          )}
        </div>
      ) : (
        /* Chat View */
        <Card className="shadow-soft border-0">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                {selectedGroup?.name}
              </CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{groupMembers.length} members</span>
                <span>•</span>
                <span>{messages.length} messages</span>
              </div>
            </div>
            {/* Member list */}
            <div className="flex flex-wrap gap-2 mt-2">
              {groupMembers.map(member => {
                const colors = getMemberColors(member.id);
                return (
                  <Badge 
                    key={member.id} 
                    variant="outline" 
                    className={`${colors.text} ${colors.bg} border-0`}
                  >
                    {member.name}
                  </Badge>
                );
              })}
            </div>
          </CardHeader>
          
          <CardContent className="p-4">
            <div className="h-[500px] overflow-y-auto" ref={scrollRef}>
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading messages...</p>
                </div>
              ) : groupedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <MessageCircle className="w-10 h-10 mb-2 opacity-50" />
                  <p>No messages in this group</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedMessages.map((group, groupIndex) => (
                    <div key={groupIndex}>
                      <div className="flex justify-center mb-3">
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          {group.date}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {group.messages.map((msg) => {
                          const senderName = getSenderName(msg.sender_id);
                          const memberColors = getMemberColors(msg.sender_id);
                          
                          return (
                            <div key={msg.id} className="flex flex-col items-start">
                              <div className="flex flex-col" style={{ maxWidth: 'min(80%, 400px)' }}>
                                <p className={`text-xs font-bold mb-1 ${memberColors.text}`}>
                                  {senderName}
                                </p>
                                <div className={`rounded-2xl px-3 py-2 overflow-hidden ${memberColors.bg} rounded-tl-sm`}>
                                  {msg.reply_to_id && renderReplyPreview(msg.reply_to_id)}
                                  {msg.message && (
                                    <p className="text-sm break-words whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                                      {msg.message}
                                    </p>
                                  )}
                                  {renderAttachment(msg)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatTime(msg.created_at)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGroupId} onOpenChange={(open) => !open && setDeleteGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this group? This action will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove all students from the group</li>
                <li>Delete all group messages</li>
                <li>Delete all group assignments</li>
                <li>Delete all pending invitations and join requests</li>
              </ul>
              <p className="mt-2 font-medium text-destructive">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteGroupId && handleDeleteGroup(deleteGroupId)}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Group'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
