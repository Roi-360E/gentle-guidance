import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Upload, CheckCircle, Film, X } from 'lucide-react';
import { toast } from 'sonner';

interface TestimonialUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSuccess: () => void;
}

export function TestimonialUploadDialog({ open, onOpenChange, userId, onSuccess }: TestimonialUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      toast.error('Por favor, selecione um arquivo de vídeo.');
      return;
    }
    if (selected.size > 500 * 1024 * 1024) {
      toast.error('O vídeo deve ter no máximo 500MB.');
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 10, 85));
      }, 400);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        clearInterval(progressInterval);
        toast.error('Sessão expirada. Faça login novamente.');
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('video', file);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/upload-testimonial`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      clearInterval(progressInterval);

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Erro ao enviar o vídeo. Tente novamente.');
        setUploading(false);
        setProgress(0);
        return;
      }

      setProgress(100);
      setDone(true);
      setUploading(false);
      onSuccess();
      toast.success('🎉 Vídeo enviado! 6 meses de acesso ilimitado ativados!');
    } catch {
      toast.error('Erro inesperado. Tente novamente.');
      setUploading(false);
      setProgress(0);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFile(null);
    setProgress(0);
    setDone(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            Enviar Vídeo Depoimento
          </DialogTitle>
          <DialogDescription>
            Envie um vídeo contando sua experiência com o EscalaXPro e ganhe 6 meses de acesso ilimitado.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle className="w-16 h-16 text-primary" />
            <p className="text-lg font-bold text-foreground text-center">Acesso Ativado!</p>
            <p className="text-sm text-muted-foreground text-center">
              Seus 6 meses de acesso gratuito e ilimitado já estão ativos. Aproveite todas as funcionalidades!
            </p>
            <Button onClick={handleClose} className="mt-2">
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!file ? (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-primary/30 rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/60 hover:bg-primary/5 transition-colors cursor-pointer"
              >
                <Upload className="w-10 h-10 text-primary/60" />
                <p className="text-sm font-medium text-foreground">Clique para selecionar um vídeo</p>
                <p className="text-xs text-muted-foreground">MP4, MOV, AVI — até 500MB</p>
              </button>
            ) : (
              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Film className="w-8 h-8 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">{Math.round(progress)}% enviado</p>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold"
            >
              {uploading ? 'Enviando...' : '🎬 Enviar e ativar 6 meses grátis'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
