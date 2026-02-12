import { useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertCircle, Clock, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { VideoPreviewDialog } from '@/components/VideoPreviewDialog';
import type { Combination } from '@/lib/video-processor';

interface CombinationListProps {
  combinations: Combination[];
  currentProgress: number;
  onDownload: (combo: Combination) => void;
  onDownloadAll: () => void;
  isProcessing: boolean;
}

const statusIcon = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  processing: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  done: <CheckCircle2 className="w-4 h-4 text-accent" />,
  error: <AlertCircle className="w-4 h-4 text-destructive" />,
};

export function CombinationList({
  combinations,
  currentProgress,
  onDownload,
  onDownloadAll,
  isProcessing,
}: CombinationListProps) {
  const [previewCombo, setPreviewCombo] = useState<Combination | null>(null);
  const doneCount = combinations.filter((c) => c.status === 'done').length;
  const totalProgress = combinations.length > 0 ? (doneCount / combinations.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">
            Combinações ({combinations.length} vídeos)
          </h3>
          <p className="text-sm text-muted-foreground">
            {doneCount} de {combinations.length} processados
          </p>
        </div>
        {doneCount > 0 && (
          <Button onClick={onDownloadAll} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            Baixar Todos
          </Button>
        )}
      </div>

      <Progress value={totalProgress} className="h-2" />

      {isProcessing && (
        <div className="text-sm text-muted-foreground">
          Processando... {currentProgress}%
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1">
        {combinations.map((combo) => (
          <div
            key={combo.id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              combo.status === 'error' ? 'bg-destructive/10 border border-destructive/30' :
              combo.status === 'done' ? 'bg-accent/10 border border-accent/30' :
              'bg-muted/30'
            }`}
          >
            {statusIcon[combo.status]}
            <span className="font-mono truncate flex-1 text-xs">
              {combo.outputName}
            </span>
            {combo.status === 'error' && combo.errorMessage && (
              <span className="text-destructive text-xs truncate max-w-[200px]" title={combo.errorMessage}>
                {combo.errorMessage}
              </span>
            )}
            <span className="text-muted-foreground text-xs hidden sm:inline">
              H{combo.hook.name.slice(0, 8)}… + B{combo.body.name.slice(0, 8)}… + C{combo.cta.name.slice(0, 8)}…
            </span>
            {combo.status === 'done' && combo.outputUrl && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreviewCombo(combo)}
                  title="Visualizar"
                >
                  <Play className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDownload(combo)}
                  title="Baixar"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <VideoPreviewDialog
        open={!!previewCombo}
        onOpenChange={(open) => !open && setPreviewCombo(null)}
        videoUrl={previewCombo?.outputUrl ?? null}
        title={previewCombo?.outputName ?? ''}
      />
    </div>
  );
}
