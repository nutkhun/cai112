import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/backend/client';
import { useGroups } from '@/context/GroupContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  FileText, 
  Download,
  FolderOpen,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  section: string | null;
  category: string | null;
  created_at: string;
}

/** Display order and styling for the categorized list. */
const CATEGORY_GROUPS = [
  { value: 'assignment', heading: 'Assignment Instructions', badge: 'Assignment', badgeClass: 'bg-primary/15 text-primary' },
  { value: 'midterm', heading: 'Midterm Project Brief', badge: 'Midterm', badgeClass: 'bg-amber-500/15 text-amber-600' },
  { value: 'final', heading: 'Final Project Brief', badge: 'Final', badgeClass: 'bg-destructive/15 text-destructive' },
  { value: 'lecture', heading: 'Lecture Materials', badge: 'Lecture', badgeClass: 'bg-muted text-foreground' },
];

export const MaterialsSection = () => {
  const { currentStudent } = useGroups();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (currentStudent) {
      fetchMaterials();
    }
  }, [currentStudent]);

  const fetchMaterials = async () => {
    if (!currentStudent) return;

    // Fetch materials for student's section or all sections
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .or(`section.eq.${currentStudent.section},section.is.null`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMaterials(data);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async (material: Material) => {
    const { data } = supabase.storage
      .from('materials')
      .getPublicUrl(material.file_path);

    if (data?.publicUrl) {
      try {
        // Fetch the file as blob to enable custom filename
        const response = await fetch(data.publicUrl);
        const blob = await response.blob();
        
        // Get file extension from original file name
        const extension = material.file_name.split('.').pop() || '';
        // Use material title as download name with original extension
        const downloadName = extension ? `${material.title}.${extension}` : material.title;
        
        // Create blob URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        // Fallback to direct link
        window.open(data.publicUrl, '_blank');
      }
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="shadow-soft border-0">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-display font-semibold text-lg">
                <FolderOpen className="w-5 h-5 text-primary" />
                Course Materials
                {materials.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {materials.length}
                  </Badge>
                )}
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {materials.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No materials available</p>
              </div>
            ) : (
              <ScrollArea className="h-[45vh] sm:h-[280px]">
                <div className="space-y-4">
                  {CATEGORY_GROUPS.map(group => {
                    const groupMaterials = materials.filter(
                      m => (m.category || 'lecture') === group.value
                    );
                    if (groupMaterials.length === 0) return null;
                    return (
                      <div key={group.value}>
                        <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.heading}
                          <Badge className={`border-0 text-[10px] ${group.badgeClass}`}>{groupMaterials.length}</Badge>
                        </p>
                        <div className="space-y-2">
                          {groupMaterials.map(material => (
                            <div
                              key={material.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="p-1.5 rounded bg-primary/10">
                                  <FileText className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{material.title}</p>
                                  {material.description && (
                                    <p className="truncate text-xs text-muted-foreground">{material.description}</p>
                                  )}
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge className={`border-0 text-[10px] ${group.badgeClass}`}>{group.badge}</Badge>
                                    <span>{formatFileSize(material.file_size)}</span>
                                    <span>•</span>
                                    <span>{format(new Date(material.created_at), 'MMM d')}</span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(material)}
                                className="gap-1 shrink-0"
                              >
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline">Download</span>
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
