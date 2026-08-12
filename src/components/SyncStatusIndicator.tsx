import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react';
import { SyncStatus } from '@/hooks/useDataSync';
import { formatDistanceToNow } from 'date-fns';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  lastSyncTime: Date | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const SyncStatusIndicator = ({
  status,
  lastSyncTime,
  onRefresh,
  isRefreshing
}: SyncStatusIndicatorProps) => {
  const getStatusIcon = () => {
    if (isRefreshing) {
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    }
    
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'syncing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'stale':
        return <Clock className="w-4 h-4 text-amber-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    if (isRefreshing) return 'Syncing...';
    
    switch (status) {
      case 'synced':
        return 'Synced';
      case 'syncing':
        return 'Syncing...';
      case 'error':
        return 'Sync failed';
      case 'stale':
        return 'Data may be stale';
      default:
        return 'Unknown';
    }
  };

  const getLastSyncText = () => {
    if (!lastSyncTime) return 'Never synced';
    return `Last synced ${formatDistanceToNow(lastSyncTime, { addSuffix: true })}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-sm">
            {getStatusIcon()}
            <span className="hidden sm:inline text-muted-foreground">{getStatusText()}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getLastSyncText()}</p>
          <p className="text-xs text-muted-foreground mt-1">Click refresh to update data</p>
        </TooltipContent>
      </Tooltip>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Refresh data</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
