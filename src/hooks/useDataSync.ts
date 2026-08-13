import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';

export type SyncStatus = 'synced' | 'syncing' | 'error' | 'stale';

interface UseDataSyncOptions {
  tables: string[];
  onDataChange?: () => void;
}

interface UseDataSyncReturn {
  status: SyncStatus;
  lastSyncTime: Date | null;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

export const useDataSync = ({ tables, onDataChange }: UseDataSyncOptions): UseDataSyncReturn => {
  const [status, setStatus] = useState<SyncStatus>('syncing');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setStatus('syncing');
    
    try {
      // Trigger the callback which should refetch data
      if (onDataChange) {
        await onDataChange();
      }
      setLastSyncTime(new Date());
      setStatus('synced');
    } catch (error) {
      console.error('Data sync error:', error);
      setStatus('error');
      toast.error('Failed to sync data. Click refresh to retry.');
    } finally {
      setIsRefreshing(false);
    }
  }, [onDataChange]);

  useEffect(() => {
    // Initial sync
    refresh();

    // Set up realtime subscriptions for all specified tables
    const channel = supabase.channel('data-sync-channel');
    
    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table
        },
        () => {
          console.log(`Realtime update received for ${table}`);
          refresh();
        }
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime subscriptions active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Realtime channel error');
        setStatus('stale');
      }
    });

    channelRef.current = channel;

    // Mark as stale if no updates for 5 minutes
    const staleInterval = setInterval(() => {
      if (lastSyncTime) {
        const now = new Date();
        const diffMs = now.getTime() - lastSyncTime.getTime();
        if (diffMs > 5 * 60 * 1000) { // 5 minutes
          setStatus('stale');
        }
      }
    }, 60000); // Check every minute

    return () => {
      clearInterval(staleInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tables, refresh]);

  return {
    status,
    lastSyncTime,
    refresh,
    isRefreshing
  };
};
