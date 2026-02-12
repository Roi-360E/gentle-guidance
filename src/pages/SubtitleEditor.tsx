import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Wand2, Save, Copy, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const STYLES = [
  { value: 'formal', label: 'Formal', desc: 'Profissional e direto' },
  { value: 'casual', label: 'Casual', desc: 'Descontraído com emojis' },
  { value: 'criativo', label: 'Criativo', desc: 'Inovador e impactante' },
  { value: 'minimalista', label: 'Minimalista', desc: 'Curto e objetivo' },
];

const TONES = [
  { value: 'neutral', label: 'Neutro' },
  { value: 'persuasivo', label: 'Persuasivo' },
  { value: 'inspirador', label: 'Inspirador' },
  { value: 'humoristico', label: 'Humorístico' },
  { value: 'urgente', label: 'Urgente' },
];

const FONT_SIZES = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
];

const SubtitleEditor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [originalText, setOriginalText] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [style, setStyle] = useState('formal');
  const [tone, setTone] = useState('neutral');
  const [fontSize, setFontSize] = useState('medium');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async (action: 'generate' | 'edit') => {
    const text = action === 'edit' ? generatedText || originalText : originalText;
    if (!text.trim()) {
      toast.error('Digite um texto antes de gerar.');
      return;
    }

    setIsGenerating(true);
    setGeneratedText('');

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-subtitles`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text, style, tone, action }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json();
        toast.error(errData.error || 'Erro ao gerar legendas');
        setIsGenerating(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
              setGeneratedText(result);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao conectar com a IA');
    }

    setIsGenerating(false);
  };

  const handleSave = async () => {
    if (!user || !generatedText.trim()) return;
    setIsSaving(true);
    const { error } = await supabase.from('subtitles').insert({
      user_id: user.id,
      original_text: originalText,
      generated_text: generatedText,
      style,
      tone,
      font_size: fontSize,
    });
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Legenda salva!');
    }
    setIsSaving(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    toast.success('Copiado!');
  };

  const fontSizeClass = fontSize === 'small' ? 'text-sm' : fontSize === 'large' ? 'text-lg' : 'text-base';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-primary uppercase">
                Editor de Legendas IA
              </h1>
              <p className="text-xs text-muted-foreground">
                Gere e edite legendas com inteligência artificial
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Settings row */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> Personalização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Estilo</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{s.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tom</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tamanho da Fonte</Label>
                <Select value={fontSize} onValueChange={setFontSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_SIZES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Editor area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Texto Original</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Cole ou digite o texto do seu vídeo aqui... A IA irá transformá-lo em legendas otimizadas."
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                rows={10}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleGenerate('generate')}
                  disabled={isGenerating || !originalText.trim()}
                  className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold rounded-full"
                >
                  {isGenerating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Gerar Legendas</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Output */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                Resultado
                {generatedText && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copiar">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`min-h-[240px] rounded-lg bg-muted/30 p-4 whitespace-pre-wrap ${fontSizeClass}`}>
                {generatedText || (
                  <span className="text-muted-foreground italic">
                    As legendas geradas aparecerão aqui em tempo real...
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleGenerate('edit')}
                  disabled={isGenerating || !generatedText.trim()}
                  className="flex-1 rounded-full"
                >
                  <Wand2 className="w-4 h-4 mr-2" /> Reescrever
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !generatedText.trim()}
                  className="flex-1 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SubtitleEditor;
