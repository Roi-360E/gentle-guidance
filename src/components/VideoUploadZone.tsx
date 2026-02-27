import { useCallback, useRef } from 'react';
import { Upload, X, CheckCircle2, Loader2, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { VideoFile } from '@/lib/video-processor';

export interface VideoFileWithProgress extends VideoFile {
  preprocessProgress?: number;
  preprocessStatus?: 'idle' | 'processing' | 'done' | 'error';
}

interface VideoUploadZoneProps {
  label: string;
  description: string;
  maxFiles: number;
  files: VideoFileWithProgress[];
  onFilesChange: (files: VideoFileWithProgress[]) => void;
  accentColor: string;
  isPreprocessing?: boolean;
  preprocessStarted?: boolean;
  onPreprocess?: () => void;
  preprocessLabel?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function VideoUploadZone({
  label,
  description,
  maxFiles,
  files,
  onFilesChange,
  accentColor,
  isPreprocessing,
  preprocessStarted,
  onPreprocess,
  preprocessLabel,
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

  const allDone = files.length > 0 && files.every(f => f.preprocessStatus === 'done');
  const hasFiles = files.length > 0;

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

      {/* File cards grid */}
      {hasFiles && (
        <div className="grid grid-cols-2 gap-3">
          {files.map((vf, i) => (
            <div
              key={i}
              className="rounded-lg bg-muted/50 border border-border p-3 space-y-2 relative group"
            >
              {/* Top row: status icon + name + remove */}
              <div className="flex items-start gap-2">
                {vf.preprocessStatus === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : vf.preprocessStatus === 'processing' ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0 mt-0.5" />
                ) : (
                  <Film className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{vf.name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => removeFile(i)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* File size + Position row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 bg-background border border-border rounded-md px-2.5 py-1 font-mono text-foreground">
                  {formatFileSize(vf.file.size)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  Posição:
                  <span className="inline-flex items-center justify-center bg-background border border-border rounded-md px-2.5 py-1 font-mono text-foreground min-w-[28px] text-center">
                    {i + 1}
                  </span>
                </span>
              </div>

              {/* Progress bar during preprocessing */}
              {vf.preprocessStatus === 'processing' && (
                <Progress value={vf.preprocessProgress ?? 0} className="h-1.5" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
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

      {/* Preprocess button per section — hidden once all done, disabled permanently after first click */}
      {hasFiles && !allDone && onPreprocess && (
        <Button
          className="w-full rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
          disabled={isPreprocessing || preprocessStarted}
          onClick={onPreprocess}
        >
          {isPreprocessing || preprocessStarted ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {preprocessLabel || 'Pré-processando...'}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Iniciar pré-processamento
            </>
          )}
        </Button>
      )}

      {allDone && (
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-green-500 bg-green-500/10 border border-green-500/20 rounded-full py-2 px-4">
          <CheckCircle2 className="w-5 h-5" />
          Todos os vídeos processados com sucesso!
        </div>
      )}
    </div>
  );
}
