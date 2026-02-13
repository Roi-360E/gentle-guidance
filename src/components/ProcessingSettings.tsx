import { Settings2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { ProcessingSettings as SettingsType, ResolutionPreset } from '@/lib/video-processor';

interface ProcessingSettingsProps {
  settings: SettingsType;
  onChange: (settings: SettingsType) => void;
  disabled?: boolean;
}

const resolutionOptions: { value: ResolutionPreset; label: string; desc: string }[] = [
  { value: 'original', label: 'Original', desc: 'Sem alteração' },
  { value: '1080p', label: '1080p', desc: 'Full HD – maior qualidade' },
  { value: '720p', label: '720p', desc: 'HD – equilíbrio ideal' },
  { value: '480p', label: '480p', desc: 'SD – mais rápido' },
  { value: '360p', label: '360p', desc: 'Baixa – ultra rápido' },
];

export function ProcessingSettingsPanel({ settings, onChange, disabled }: ProcessingSettingsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold text-card-foreground">Configurações de Processamento</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Resolution */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Resolução de saída</Label>
          <Select
            value={settings.resolution}
            onValueChange={(v) => onChange({ ...settings, resolution: v as ResolutionPreset })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolutionOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{opt.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pre-process toggle */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Pré-processamento</Label>
          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={settings.preProcess}
              onCheckedChange={(v) => onChange({ ...settings, preProcess: v })}
              disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">
              {settings.preProcess
                ? 'Normalizar vídeos antes de concatenar (recomendado)'
                : 'Concatenação direta (pode falhar com formatos diferentes)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
