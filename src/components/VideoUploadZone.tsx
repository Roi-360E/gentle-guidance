import { useCallback, useRef } from 'react';
import { Upload, Film, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoFile } from '@/lib/video-processor';

interface VideoUploadZoneProps {
  label: string;
  description: string;
  maxFiles: number;
  files: VideoFile[];
  onFilesChange: (files: VideoFile[]) => void;
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

      {files.length < maxFiles && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
        >
          <Upload className="w-8 h-8" />
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

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((vf, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2"
            >
              <Film className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate flex-1">{vf.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => removeFile(i)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
