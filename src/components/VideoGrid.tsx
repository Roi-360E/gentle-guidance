import { Film, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VideoFile } from '@/lib/video-processor';

interface VideoGridProps {
  label: string;
  files: VideoFile[];
  onPositionChange: (index: number, position: number) => void;
  onPreProcess: () => void;
  isPreProcessing: boolean;
  isPreProcessed: boolean;
  accentColor: string;
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function VideoGrid({
  label,
  files,
  onPositionChange,
  onPreProcess,
  isPreProcessing,
  isPreProcessed,
  accentColor,
}: VideoGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full ${accentColor}`} />
        {label} ({files.length} vídeos)
        {isPreProcessed && <CheckCircle2 className="w-5 h-5 text-green-500" />}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {files.map((vf, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-start gap-3">
              <Film className="w-8 h-8 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-card-foreground truncate">
                  {vf.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(vf.file.size)}
                </p>
                {vf.duration !== undefined && vf.duration > 60 && (
                  <p className="text-xs text-destructive font-semibold">
                    ⚠️ Excede 1 min ({Math.round(vf.duration)}s)
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap"># Posição:</span>
              <Input
                type="number"
                min={1}
                value={vf.position ?? i + 1}
                onChange={(e) => onPositionChange(i, parseInt(e.target.value) || 1)}
                className="h-7 w-16 text-center text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <Button
          onClick={onPreProcess}
          disabled={isPreProcessing || isPreProcessed || files.some(f => f.duration !== undefined && f.duration > 60)}
          className={`px-8 rounded-full font-semibold ${
            isPreProcessed
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90'
          }`}
        >
          {isPreProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Pré-processando...
            </>
          ) : isPreProcessed ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Pré-processado ✓
            </>
          ) : (
            `Pré-processar ${label}`
          )}
        </Button>
      </div>
    </div>
  );
}
