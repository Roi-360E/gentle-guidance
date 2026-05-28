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
      <DialogContent className="max-w-fit w-auto bg-background p-4">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">{title}</DialogTitle>
        </DialogHeader>
        {videoUrl && (
          <video
            src={videoUrl}
            controls
            autoPlay
            className="rounded-lg bg-black block"
            style={{ maxHeight: '80vh', maxWidth: '90vw', height: 'auto', width: 'auto' }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
