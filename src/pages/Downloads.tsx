import { useProcessing } from '@/hooks/useProcessing';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Download, Trash2, ArrowLeft, Loader2, Film, Share2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { VideoPreviewDialog } from '@/components/VideoPreviewDialog';
import { useState } from 'react';
import { toast } from 'sonner';

const shareToInstagram = async (videoUrl: string, videoName: string) => {
  try {
    const response = await fetch(videoUrl);
    const blob = await response.blob();
    const file = new File([blob], videoName, { type: blob.type || 'video/mp4' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: videoName,
        text: 'Confira este vídeo! 🎬',
        files: [file],
      });
      toast.success('Compartilhado com sucesso!');
    } else {
      // Fallback: download and instruct user
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = videoName;
      a.click();
      toast.info('Vídeo baixado! Abra o Instagram e poste o vídeo manualmente.');
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      toast.error('Não foi possível compartilhar o vídeo.');
    }
  }
};
const Downloads = () => {
  const navigate = useNavigate();
  const { downloadedVideos, clearDownload, clearAllDownloads, isProcessing, currentProgress, combinations } = useProcessing();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  const handleDownload = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };

  const handleDownloadAll = () => {
    downloadedVideos.forEach(v => handleDownload(v.url, v.name));
  };

  const doneCount = combinations.filter(c => c.status === 'done').length;
  const totalCount = combinations.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1 sm:gap-2 shrink-0 px-2 sm:px-3">
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Voltar</span>
            </Button>
            <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-primary uppercase truncate">
              Meus Downloads
            </h1>
          </div>
          {downloadedVideos.length > 0 && (
            <div className="flex gap-1 sm:gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1 sm:gap-2 rounded-full text-xs sm:text-sm px-2 sm:px-3" onClick={handleDownloadAll}>
                <Download className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Baixar Todos</span><span className="sm:hidden">Todos</span>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1 text-destructive px-2 sm:px-3" onClick={clearAllDownloads}>
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Limpar</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6">
        {/* Active processing banner */}
        {isProcessing && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="font-medium text-primary">
                Processando em segundo plano... ({doneCount}/{totalCount})
              </span>
            </div>
            <Progress value={currentProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Os vídeos serão salvos aqui automaticamente ao concluir.
            </p>
          </div>
        )}

        {downloadedVideos.length === 0 && !isProcessing && (
          <div className="text-center py-20 space-y-4">
            <Film className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Nenhum vídeo gerado ainda.</p>
            <Button variant="outline" onClick={() => navigate('/')}>
              Ir para o Editor
            </Button>
          </div>
        )}

        {downloadedVideos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {downloadedVideos.map((video) => (
              <div key={video.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div
                  className="aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer relative group"
                  onClick={() => { setPreviewUrl(video.url); setPreviewName(video.name); }}
                >
                  <video src={video.url} className="w-full h-full object-cover" muted preload="metadata" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Film className="w-8 h-8 text-white" />
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground truncate" title={video.name}>
                  {video.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {video.createdAt.toLocaleString('pt-BR')}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 rounded-full" onClick={() => handleDownload(video.url, video.name)}>
                    <Download className="w-3 h-3" /> Baixar
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1 rounded-full" onClick={() => shareToInstagram(video.url, video.name)}>
                    <Share2 className="w-3 h-3" /> Compartilhar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => clearDownload(video.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <VideoPreviewDialog
        open={!!previewUrl}
        onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}
        videoUrl={previewUrl}
        title={previewName}
      />
    </div>
  );
};

export default Downloads;
