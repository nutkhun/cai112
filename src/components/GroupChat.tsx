import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageCircle, Send, Paperclip, X, Download, FileIcon, Image as ImageIcon, Reply, CornerDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface GroupChatProps {
  groupId: string;
  /**
   * Fill the viewport between the header and the mobile tab bar instead of
   * using a fixed 400px message pane. Used by the phone "Chat" destination.
   */
  fullHeight?: boolean;
}

export const GroupChat = ({ groupId, fullHeight = false }: GroupChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { currentStudent, students } = useGroups();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      if (data) {
        setMessages(data);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Auto-scroll to bottom when new messages arrive (within ScrollArea only)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getSenderName = (senderId: string) => {
    const student = students.find(s => s.id === senderId);
    return student?.name || 'Unknown';
  };


  // Generate consistent color based on member index in group
  const colorPairs = [
    { text: 'text-blue-400', bg: 'bg-blue-500/30' },
    { text: 'text-green-400', bg: 'bg-green-500/30' },
    { text: 'text-purple-400', bg: 'bg-purple-500/30' },
    { text: 'text-orange-400', bg: 'bg-orange-500/30' },
    { text: 'text-pink-400', bg: 'bg-pink-500/30' },
  ];

  // Get group members sorted by ID for consistent color assignment
  const groupMembers = groupId ? students.filter(s => s.groupId === groupId).sort((a, b) => a.id.localeCompare(b.id)) : [];
  
  const getMemberColors = (senderId: string) => {
    const memberIndex = groupMembers.findIndex(m => m.id === senderId);
    const index = memberIndex >= 0 ? memberIndex : 0;
    return colorPairs[index % colorPairs.length];
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      return date.toLocaleDateString();
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Max file size: 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .download(filePath);

      if (error) throw error;

      // Create download link
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!newMessage.trim() && !selectedFile) || !currentStudent) return;

    setSending(true);
    setUploading(!!selectedFile);

    try {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;

      // Upload file if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const uniqueFileName = `${groupId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(uniqueFileName, selectedFile);

        if (uploadError) throw uploadError;

        filePath = uniqueFileName;
        fileName = selectedFile.name;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      const { error } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: currentStudent.id,
          message: newMessage.trim() || (selectedFile ? '' : ''),
          file_path: filePath,
          file_name: fileName,
          file_type: fileType,
          file_size: fileSize,
          reply_to_id: replyingTo?.id || null
        });

      if (error) throw error;

      setNewMessage('');
      clearSelectedFile();
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const dateStr = formatDate(msg.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.date === dateStr) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateStr, messages: [msg] });
    }
  });

  const handleReply = (msg: Message) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

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
          <p className="text-muted-foreground break-words whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
            {replyMsg.message || (replyMsg.file_name ? `📎 ${replyMsg.file_name}` : '')}
          </p>
        </div>
      </div>
    );
  };

  const renderAttachment = (msg: Message, isOwnMessage: boolean) => {
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
        className={`mt-2 flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity max-w-[200px] ${
          isOwnMessage ? 'bg-primary-foreground/10' : 'bg-background/50'
        }`}
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

  return (
    <Card
      className={cn(
        'shadow-soft border-0 w-full overflow-hidden',
        fullHeight ? 'flex h-chat-mobile flex-col' : 'mt-4',
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="w-5 h-5 text-primary" />
          Group Chat
        </CardTitle>
      </CardHeader>
      <CardContent className={cn('p-4 pt-0', fullHeight && 'flex min-h-0 flex-1 flex-col')}>
        <div
          className={cn(
            'overflow-y-auto scroll-contain',
            fullHeight ? 'min-h-0 flex-1' : 'h-[400px]',
          )}
          ref={scrollRef}
        >
          <div className="pr-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mb-2 opacity-50" />
                <p>No messages yet</p>
                <p className="text-sm">Start the conversation!</p>
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
                    <div className="space-y-5">
                      {group.messages.map((msg) => {
                        const isOwnMessage = msg.sender_id === currentStudent?.id;
                        const senderName = getSenderName(msg.sender_id);
                        const memberColors = getMemberColors(msg.sender_id);
                        
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col group/message ${isOwnMessage ? 'items-end' : 'items-start'}`}
                          >
                            {/* Wider bubbles on phones - 320px would waste a third
                                of a 390px screen. */}
                            <div className="flex flex-col max-w-[85%] sm:max-w-[min(80%,320px)]">
                              <p className={`text-xs font-bold mb-1 ${memberColors.text}`}>
                                {senderName}
                              </p>
                              <div
                                className={`rounded-2xl px-3 py-2 overflow-hidden ${memberColors.bg} ${
                                  isOwnMessage ? 'rounded-tr-sm' : 'rounded-tl-sm'
                                }`}
                              >
                                {msg.reply_to_id && renderReplyPreview(msg.reply_to_id)}
                                {msg.message && <p className="text-sm break-words whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{msg.message}</p>}
                                {renderAttachment(msg, isOwnMessage)}
                              </div>
                              <div className={`flex items-center gap-2 mt-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                                <p className="text-xs text-muted-foreground">
                                  {formatTime(msg.created_at)}
                                </p>
                                {!isOwnMessage && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Reply to ${senderName}`}
                                    className="h-10 w-10 md:h-7 md:w-7"
                                    onClick={() => handleReply(msg)}
                                  >
                                    <Reply className="h-4 w-4 md:h-3.5 md:w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 p-2 mt-2 bg-muted rounded-lg border-l-4 border-primary">
            <Reply className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${getMemberColors(replyingTo.sender_id).text}`}>
                {getSenderName(replyingTo.sender_id)}
              </p>
              <p className="text-sm text-muted-foreground break-words whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                {replyingTo.message || (replyingTo.file_name ? `📎 ${replyingTo.file_name}` : '')}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelReply}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Selected file preview */}
        {selectedFile && (
          <div className="flex items-center gap-2 p-2 mt-2 bg-muted rounded-lg">
            {selectedFile.type.startsWith('image/') ? (
              <ImageIcon className="h-5 w-5 text-primary" />
            ) : (
              <FileIcon className="h-5 w-5 text-primary" />
            )}
            <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
            <span className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearSelectedFile}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex shrink-0 gap-2 mt-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Attach a file"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={replyingTo ? "Type your reply..." : "Type a message..."}
            className="flex-1"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            className="shrink-0"
            disabled={(!newMessage.trim() && !selectedFile) || sending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        {uploading && (
          <p className="text-xs text-muted-foreground mt-2 text-center">Uploading file...</p>
        )}
      </CardContent>
    </Card>
  );
};