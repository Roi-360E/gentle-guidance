import { useCallback, useRef } from 'react';
import { Upload, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { VideoFile } from '@/lib/video-processor';

export interface VideoFileWithProgress extends VideoFile {
  preprocessProgress?: number; // 0-100, undefined = not started
  preprocessStatus?: 'idle' | 'processing' | 'done' | 'error';
}

interface VideoUploadZoneProps {
  label: string;
  description: string;
  maxFiles: number;
  files: VideoFileWithProgress[];
  onFilesChange: (files: VideoFileWithProgress[]) => void;
  accentColor: string;
}

export function VideoUploadZone({
  label,
  description,
  maxFiles,
  files,
  onFilesChange,
  accentColor,
}: VideoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;
      const remaining = maxFiles - files.length;
      const toAdd = Array.from(newFiles).slice(0, remaining).map((file) => ({
        file,
        name: file.name,
        url: URL.createObjectURL(file),
        preprocessProgress: undefined,
        preprocessStatus: 'idle' as const,
      }));
      onFilesChange([...files, ...toAdd]);
    },
    [files, maxFiles, onFilesChange]
  );

  const removeFile = (index: number) => {
    const updated = [...files];
    URL.revokeObjectURL(updated[index].url);
    updated.splice(index, 1);
    onFilesChange(updated);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-card-foreground text-lg flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${accentColor}`} />
            {label}
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm font-mono text-muted-foreground">
          {files.length}/{maxFiles}
        </span>
      </div>

      {/* Square video thumbnail grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {files.map((vf, i) => (
            <div key={i} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border relative">
                <video
                  src={vf.url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedData={(e) => {
                    // Seek to 1s for a better thumbnail
                    const video = e.currentTarget;
                    video.currentTime = 1;
                  }}
                />

                {/* Overlay for status */}
                {vf.preprocessStatus === 'processing' && (
                  <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <span className="text-xs font-medium text-primary">
                      {vf.preprocessProgress != null ? `${vf.preprocessProgress}%` : 'Aguardando...'}
                    </span>
                  </div>
                )}

                {vf.preprocessStatus === 'done' && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 drop-shadow-md" />
                  </div>
                )}

                {vf.preprocessStatus === 'error' && (
                  <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-destructive">Erro</span>
                  </div>
                )}

                {/* Remove button */}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 left-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFile(i)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* Individual progress bar */}
              {vf.preprocessStatus === 'processing' && (
                <Progress
                  value={vf.preprocessProgress ?? 0}
                  className="h-1.5 mt-1"
                />
              )}

              <p className="text-xs text-muted-foreground truncate mt-1">{vf.name}</p>
            </div>
          ))}
        </div>
      )}

      {files.length < maxFiles && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
        >
          <Upload className="w-7 h-7" />
          <span className="text-sm font-medium">Clique para enviar vídeos</span>
          <span className="text-xs">MP4, MOV, WEBM</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
