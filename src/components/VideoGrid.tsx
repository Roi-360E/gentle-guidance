import { useState } from 'react';
import { Film, Loader2, CheckCircle2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { VideoFile } from '@/lib/video-processor';

interface VideoGridProps {
  label: string;
  files: VideoFile[];
  onFilesReorder: (files: VideoFile[]) => void;
  isPreProcessing: boolean;
  isPreProcessed: boolean;
  accentColor: string;
  preProcessProgress?: Map<number, number>; // index -> percentage
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function VideoGrid({
  label,
  files,
  onFilesReorder,
  isPreProcessing,
  isPreProcessed,
  accentColor,
  preProcessProgress,
}: VideoGridProps) {
  if (files.length === 0) return null;

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...files];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onFilesReorder(updated);
  };

  const moveDown = (index: number) => {
    if (index === files.length - 1) return;
    const updated = [...files];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onFilesReorder(updated);
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base text-card-foreground flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full ${accentColor}`} />
        {label} ({files.length} vídeos)
        {isPreProcessed && <CheckCircle2 className="w-5 h-5 text-green-500" />}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {files.map((vf, i) => {
          const progress = preProcessProgress?.get(i) ?? (isPreProcessed ? 100 : 0);
          return (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground w-5 text-center">
                  {i + 1}
                </span>
                <Film className="w-6 h-6 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs text-card-foreground truncate">
                    {vf.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(vf.file.size)}
                    {vf.duration !== undefined && ` • ${Math.round(vf.duration)}s`}
                  </p>
                </div>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === files.length - 1}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {vf.duration !== undefined && vf.duration > 60 && (
                <p className="text-[10px] text-destructive font-semibold">
                  ⚠️ Excede 1 min ({Math.round(vf.duration)}s)
                </p>
              )}

              {/* Per-video progress bar */}
              {(isPreProcessing || isPreProcessed) && (
                <div className="space-y-1">
                  <Progress value={progress} className="h-2" />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {progress}%
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
