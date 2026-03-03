import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Instagram, Send, CalendarIcon, Clock, Loader2, Film, Image, Hash, Smile, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InstagramPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  videoName: string;
}

export function InstagramPublishDialog({ open, onOpenChange, videoUrl, videoName }: InstagramPublishDialogProps) {
  const [caption, setCaption] = useState('');
  const [destination, setDestination] = useState<'feed' | 'story'>('feed');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledHour, setScheduledHour] = useState('12');
  const [scheduledMinute, setScheduledMinute] = useState('00');
  const [publishing, setPublishing] = useState(false);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  const getScheduledTimestamp = (): number | undefined => {
    if (mode !== 'schedule' || !scheduledDate) return undefined;
    const d = new Date(scheduledDate);
    d.setHours(parseInt(scheduledHour), parseInt(scheduledMinute), 0, 0);
    return Math.floor(d.getTime() / 1000);
  };

  const handlePublish = async () => {
    if (mode === 'schedule' && !scheduledDate) {
      toast.error('Selecione uma data para agendar.');
      return;
    }

    if (mode === 'schedule') {
      const ts = getScheduledTimestamp()!;
      const now = Math.floor(Date.now() / 1000);
      const tenMinutes = 10 * 60;
      const seventyFiveDays = 75 * 24 * 60 * 60;
      if (ts - now < tenMinutes) {
        toast.error('O agendamento deve ser pelo menos 10 minutos no futuro.');
        return;
      }
      if (ts - now > seventyFiveDays) {
        toast.error('O agendamento não pode ser superior a 75 dias.');
        return;
      }
    }

    setPublishing(true);
    try {
      const payload: Record<string, any> = {
        video_url: videoUrl,
        caption,
        destination,
      };
      if (mode === 'schedule') {
        payload.scheduled_publish_time = getScheduledTimestamp();
      }

      const { data, error } = await supabase.functions.invoke('instagram-publish', {
        body: payload,
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Erro ao publicar.');
        return;
      }

      if (mode === 'schedule') {
        toast.success('Reel agendado com sucesso! 📅');
      } else {
        toast.success(`Publicado no ${destination === 'feed' ? 'Feed' : 'Story'} com sucesso! 🎉`);
      }
      onOpenChange(false);
      setCaption('');
      setMode('now');
      setDestination('feed');
      setScheduledDate(undefined);
    } catch (err: any) {
      toast.error('Erro inesperado ao publicar.');
      console.error(err);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
        {/* Instagram-style header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold text-foreground">Nova Publicação</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary font-bold text-sm hover:text-primary/80 px-2"
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'schedule' ? 'Agendar' : 'Publicar'}
          </Button>
        </div>
        <DialogDescription className="sr-only">Editor de publicação para Instagram</DialogDescription>

        <div className="flex flex-col sm:flex-row">
          {/* Video preview - left side */}
          <div className="sm:w-[200px] shrink-0 bg-black flex items-center justify-center">
            <div className="aspect-[9/16] w-full max-h-[280px] sm:max-h-[400px] relative">
              <video
                src={videoUrl}
                className="w-full h-full object-contain"
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
              />
            </div>
          </div>

          {/* Caption editor - right side */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Destination selector (Feed / Story) */}
            <div className="flex border-b border-border">
              <button
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
                  destination === 'feed'
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setDestination('feed')}
              >
                <Image className="w-4 h-4" /> Feed
              </button>
              <button
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
                  destination === 'story'
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setDestination('story')}
              >
                <Film className="w-4 h-4" /> Story
              </button>
            </div>

            {/* Caption textarea */}
            <div className="flex-1 p-3">
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={destination === 'story' ? 'Adicione texto ao Story... ✨' : 'Escreva uma legenda...\n\nUse #hashtags para mais alcance 🚀'}
                className="min-h-[120px] sm:min-h-[160px] resize-none border-0 p-0 focus-visible:ring-0 text-sm bg-transparent"
                maxLength={2200}
              />
            </div>

            {/* Caption toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setCaption(prev => prev + ' #')}>
                  <Hash className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setCaption(prev => prev + ' @')}>
                  <AtSign className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setCaption(prev => prev + ' 😊')}>
                  <Smile className="w-4 h-4" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{caption.length}/2200</span>
            </div>

            {/* Mode toggle (Now / Schedule) */}
            <div className="px-3 pb-3 space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={mode === 'now' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 gap-2 rounded-full text-xs"
                  onClick={() => setMode('now')}
                >
                  <Send className="w-3 h-3" /> Agora
                </Button>
                <Button
                  variant={mode === 'schedule' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 gap-2 rounded-full text-xs"
                  onClick={() => setMode('schedule')}
                >
                  <CalendarIcon className="w-3 h-3" /> Agendar
                </Button>
              </div>

              {/* Schedule picker */}
              {mode === 'schedule' && (
                <div className="space-y-2 rounded-lg border border-border p-3 bg-secondary/30">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'w-full justify-start text-left font-normal text-xs',
                          !scheduledDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {scheduledDate
                          ? format(scheduledDate, "dd 'de' MMMM, yyyy", { locale: ptBR })
                          : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduledDate}
                        onSelect={setScheduledDate}
                        disabled={(date) => date < new Date()}
                        className={cn('p-3 pointer-events-auto')}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>

                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <Select value={scheduledHour} onValueChange={setScheduledHour}>
                      <SelectTrigger className="w-16 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hours.map((h) => (
                          <SelectItem key={h} value={h}>{h}h</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground font-bold text-xs">:</span>
                    <Select value={scheduledMinute} onValueChange={setScheduledMinute}>
                      <SelectTrigger className="w-16 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {minutes.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Main publish button */}
              <Button
                className="w-full gap-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 hover:from-purple-600 hover:via-pink-600 hover:to-orange-500 text-white border-0"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {mode === 'schedule' ? 'Agendando...' : 'Publicando...'}
                  </>
                ) : (
                  <>
                    <Instagram className="w-4 h-4" />
                    {mode === 'schedule'
                      ? 'Agendar Publicação'
                      : `Publicar no ${destination === 'feed' ? 'Feed' : 'Story'}`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
