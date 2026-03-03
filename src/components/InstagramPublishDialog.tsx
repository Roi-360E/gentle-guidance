import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Instagram, Send, CalendarIcon, Clock, Loader2 } from 'lucide-react';
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
        toast.success('Reel publicado com sucesso! 🎉');
      }
      onOpenChange(false);
      setCaption('');
      setMode('now');
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-1.5">
              <Instagram className="w-4 h-4 text-white" />
            </div>
            Publicar no Instagram
          </DialogTitle>
          <DialogDescription>
            {videoName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Caption */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Legenda</label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escreva a legenda do seu Reel... ✨&#10;&#10;#hashtags #reels"
              className="min-h-[120px] resize-none"
              maxLength={2200}
            />
            <p className="text-xs text-muted-foreground text-right">{caption.length}/2200</p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'now' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 gap-2 rounded-full"
              onClick={() => setMode('now')}
            >
              <Send className="w-3.5 h-3.5" /> Publicar Agora
            </Button>
            <Button
              variant={mode === 'schedule' ? 'default' : 'outline'}
              size="sm"
              className="flex-1 gap-2 rounded-full"
              onClick={() => setMode('schedule')}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Agendar
            </Button>
          </div>

          {/* Schedule picker */}
          {mode === 'schedule' && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-secondary/30">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !scheduledDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
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
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Select value={scheduledHour} onValueChange={setScheduledHour}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((h) => (
                      <SelectItem key={h} value={h}>{h}h</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-bold">:</span>
                <Select value={scheduledMinute} onValueChange={setScheduledMinute}>
                  <SelectTrigger className="w-20">
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

          {/* Submit */}
          <Button
            className="w-full gap-2"
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
                {mode === 'schedule' ? (
                  <><CalendarIcon className="w-4 h-4" /> Agendar Publicação</>
                ) : (
                  <><Send className="w-4 h-4" /> Publicar Agora</>
                )}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
