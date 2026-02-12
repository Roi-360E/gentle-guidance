import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface VideoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  title: string;
}

export function VideoPreviewDialog({ open, onOpenChange, videoUrl, title }: VideoPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">{title}</DialogTitle>
        </DialogHeader>
        {videoUrl && (
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
            style={{ maxHeight: '70vh' }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
