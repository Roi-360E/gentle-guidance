import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Rocket, ArrowLeft, Upload, Mic, Play, Pause, Download, Search,
  Loader2, Check, ChevronRight, Volume2, Wand2, Copy, X
} from 'lucide-react';

type Step = 'upload' | 'transcribe' | 'edit' | 'voice' | 'generate' | 'done';
type VoiceMode = 'library' | 'clone' | 'custom';

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
}

const VoiceRewrite = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Access check
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [ttsCredits, setTtsCredits] = useState<number>(0);

  // Steps
  const [step, setStep] = useState<Step>('upload');

  // Upload
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Transcription
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Voice selection
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('library');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [filteredVoices, setFilteredVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloneInputRef = useRef<HTMLInputElement>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timer | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `gravacao-voz-${Date.now()}.webm`, { type: 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setCloneFile(file);
        toast.success('Gravação finalizada!');
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      setRecordedBlob(null);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      toast.error('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  }, [recordedUrl]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current as unknown as number);
      recordingIntervalRef.current = null;
    }
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Check access dynamically from admin-configured plans + load TTS credits
  useEffect(() => {
    if (!user) return;
    const checkAccess = async () => {
      const monthYear = new Date().toISOString().substring(0, 7);
      const { data } = await supabase
        .from('video_usage')
        .select('plan, tts_credits')
        .eq('user_id', user.id)
        .eq('month_year', monthYear)
        .single();
      setTtsCredits((data as any)?.tts_credits ?? 0);

      const planKey = data?.plan || 'free';
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('has_voice_rewrite')
        .eq('plan_key', planKey)
        .eq('is_active', true)
        .maybeSingle();
      setHasAccess((planData as any)?.has_voice_rewrite === true);
    };
    checkAccess();
  }, [user]);

  // Filter voices by search
  useEffect(() => {
    if (!voiceSearch.trim()) {
      setFilteredVoices(voices);
    } else {
      const q = voiceSearch.toLowerCase();
      setFilteredVoices(voices.filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.labels?.language || '').toLowerCase().includes(q) ||
        (v.labels?.accent || '').toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q)
      ));
    }
  }, [voiceSearch, voices]);

  // Cleanup URLs
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
      if (finalVideoUrl) URL.revokeObjectURL(finalVideoUrl);
    };
  }, []);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Por favor, selecione um arquivo de vídeo.');
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setStep('transcribe');
    toast.success('Vídeo carregado com sucesso!');
  };

  const handleTranscribe = useCallback(async () => {
    if (!videoFile) return;
    setIsTranscribing(true);
    try {
      // Extract audio using FFmpeg.wasm
      const { getFFmpeg } = await import('@/lib/video-processor');
      const ffmpeg = await getFFmpeg();
      const arrayBuf = await videoFile.arrayBuffer();
      const inputName = 'input_vr.' + (videoFile.name.split('.').pop() || 'mp4');
      await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuf));
      await ffmpeg.exec(['-i', inputName, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'audio_vr.wav']);
      const wavData = await ffmpeg.readFile('audio_vr.wav');
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('audio_vr.wav');

      const wavBlob = new Blob([new Uint8Array(wavData as unknown as ArrayBuffer)], { type: 'audio/wav' });

      // Send to transcription edge function
      const formData = new FormData();
      formData.append('audio', wavBlob, 'audio.wav');

      const { data, error } = await supabase.functions.invoke('chat-transcribe', {
        body: formData,
      });

      if (error) throw error;
      const text = data?.text || data?.transcript || '';
      if (!text) throw new Error('Transcrição vazia');

      setTranscript(text);
      setStep('edit');
      toast.success('Transcrição concluída!');
    } catch (err) {
      console.error('Transcription error:', err);
      toast.error('Erro na transcrição. Tente novamente.');
    } finally {
      setIsTranscribing(false);
    }
  }, [videoFile]);

  const loadVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voices');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVoices(data.voices || []);
    } catch (err) {
      console.error('Load voices error:', err);
      toast.error('Erro ao carregar vozes.');
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  const handleGoToVoice = () => {
    if (!transcript.trim()) {
      toast.error('O texto não pode estar vazio.');
      return;
    }
    setStep('voice');
    loadVoices();
  };

  const playPreview = (voice: Voice) => {
    if (!voice.preview_url) return;
    if (previewAudio) {
      previewAudio.pause();
      if (playingVoiceId === voice.voice_id) {
        setPlayingVoiceId(null);
        return;
      }
    }
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingVoiceId(null);
    audio.play();
    setPreviewAudio(audio);
    setPlayingVoiceId(voice.voice_id);
  };

  const handleCloneVoice = useCallback(async () => {
    if (!cloneName.trim() || !cloneFile) {
      toast.error('Informe um nome e envie um arquivo de áudio.');
      return;
    }
    setIsCloning(true);
    try {
      const formData = new FormData();
      formData.append('name', cloneName);
      formData.append('audio', cloneFile, cloneFile.name);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-clone-voice`,
        {
          method: 'POST',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setSelectedVoice({ voice_id: data.voice_id, name: cloneName, category: 'cloned' });
      toast.success(`Voz "${cloneName}" clonada com sucesso!`);
    } catch (err) {
      console.error('Clone error:', err);
      toast.error('Erro ao clonar voz. Verifique o áudio e tente novamente.');
    } finally {
      setIsCloning(false);
    }
  }, [cloneName, cloneFile]);

  const handleGenerate = useCallback(async () => {
    if (!videoFile || !transcript.trim()) return;

    if (ttsCredits <= 0) {
      toast.error('Créditos TTS esgotados. Faça upgrade ou aguarde a renovação.');
      return;
    }

    const voiceId = voiceMode === 'custom'
      ? customVoiceId
      : selectedVoice?.voice_id;

    if (!voiceId) {
      toast.error('Selecione ou informe uma voz.');
      return;
    }

    setIsGenerating(true);
    setStep('generate');
    setGenProgress(10);

    try {
      // Get user session token for credit validation
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Step 1: Generate TTS audio
      setGenProgress(20);
      const ttsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ text: transcript.slice(0, 4500), voiceId }),
        }
      );

      // Check if response is JSON (error) or audio (success)
      const contentType = ttsResponse.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const errData = await ttsResponse.json();
        throw new Error(errData.error || 'Erro ao gerar áudio');
      }

      if (!ttsResponse.ok) throw new Error(`TTS falhou: ${ttsResponse.status}`);
      const audioBlob = await ttsResponse.blob();
      setTtsCredits(prev => Math.max(0, prev - 1));
      setGenProgress(50);

      // Step 2: Merge video (mute original) + new audio using FFmpeg.wasm
      const { getFFmpeg } = await import('@/lib/video-processor');
      const ffmpeg = await getFFmpeg();

      const videoBuf = await videoFile.arrayBuffer();
      const audioBuf = await audioBlob.arrayBuffer();
      const ext = videoFile.name.split('.').pop() || 'mp4';

      await ffmpeg.writeFile(`source.${ext}`, new Uint8Array(videoBuf));
      await ffmpeg.writeFile('new_audio.mp3', new Uint8Array(audioBuf));
      setGenProgress(65);

      // Merge: take video from source (muted), add new audio, use shortest
      await ffmpeg.exec([
        '-i', `source.${ext}`,
        '-i', 'new_audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        '-movflags', '+faststart',
        'output.mp4',
      ]);
      setGenProgress(90);

      const outputRaw = await ffmpeg.readFile('output.mp4');
      const outputData = new Uint8Array(outputRaw as unknown as ArrayBuffer);
      const outputBlob = new Blob([outputData], { type: 'video/mp4' });
      const outputUrl = URL.createObjectURL(outputBlob);

      // Cleanup FFmpeg files
      await ffmpeg.deleteFile(`source.${ext}`).catch(() => {});
      await ffmpeg.deleteFile('new_audio.mp3').catch(() => {});
      await ffmpeg.deleteFile('output.mp4').catch(() => {});

      setFinalVideoUrl(outputUrl);
      setGenProgress(100);
      setStep('done');
      toast.success('Vídeo gerado com sucesso!');
    } catch (err) {
      console.error('Generate error:', err);
      toast.error('Erro ao gerar vídeo. Tente novamente.');
      setStep('voice');
    } finally {
      setIsGenerating(false);
    }
  }, [videoFile, transcript, voiceMode, customVoiceId, selectedVoice]);

  const handleDownload = () => {
    if (!finalVideoUrl) return;
    const a = document.createElement('a');
    a.href = finalVideoUrl;
    a.download = `voice-rewrite-${Date.now()}.mp4`;
    a.click();
  };

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (finalVideoUrl) URL.revokeObjectURL(finalVideoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setTranscript('');
    setSelectedVoice(null);
    setCustomVoiceId('');
    setCloneName('');
    setCloneFile(null);
    setFinalVideoUrl(null);
    setGeneratedAudioUrl(null);
    setGenProgress(0);
    setStep('upload');
  };

  // Access gate
  if (hasAccess === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Wand2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Recurso Exclusivo</h1>
          <p className="text-muted-foreground">
            O Voice Rewrite está disponível exclusivamente no plano <strong className="text-primary">Ilimitado</strong>.
            Faça upgrade para reescrever o áudio dos seus vídeos com vozes IA profissionais.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <Button onClick={() => navigate('/plans')}>
              Fazer Upgrade
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'transcribe', label: 'Transcrever' },
    { key: 'edit', label: 'Editar' },
    { key: 'voice', label: 'Voz' },
    { key: 'generate', label: 'Gerar' },
    { key: 'done', label: 'Pronto' },
  ];

  const stepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Rocket className="w-6 h-6 text-primary" />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">Voice Rewrite <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full align-middle">Beta</span></h1>
            <p className="text-xs text-muted-foreground">Reescreva o áudio dos seus vídeos com IA</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Volume2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">{ttsCredits}</span>
            <span className="text-xs text-muted-foreground">créditos TTS</span>
          </div>
        </div>
      </header>

      {/* Progress stepper */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                i < stepIndex ? 'bg-primary/20 text-primary' :
                i === stepIndex ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {i < stepIndex ? <Check className="w-3 h-3" /> : null}
                {s.label}
              </div>
              {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 pb-12 space-y-6">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="text-center space-y-2">
              <Upload className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Envie seu vídeo</h2>
              <p className="text-muted-foreground text-sm">
                Faça upload do vídeo que deseja reescrever o áudio
              </p>
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <p className="text-muted-foreground">Clique para selecionar ou arraste um vídeo</p>
              <p className="text-xs text-muted-foreground mt-1">MP4, MOV, AVI, WebM</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleVideoUpload}
            />
          </div>
        )}

        {/* Step 2: Transcribe */}
        {step === 'transcribe' && (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="text-center space-y-2">
              <Mic className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Transcrever Áudio</h2>
              <p className="text-muted-foreground text-sm">
                Extrairemos o áudio e transcreveremos automaticamente
              </p>
            </div>
            {videoUrl && (
              <video src={videoUrl} controls className="rounded-xl w-full max-h-64 mx-auto" />
            )}
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Trocar vídeo
              </Button>
              <Button onClick={handleTranscribe} disabled={isTranscribing}>
                {isTranscribing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transcrevendo...</>
                ) : (
                  <><Mic className="w-4 h-4 mr-2" /> Transcrever Áudio</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep('edit')}>
                Pular (digitar texto) <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Edit */}
        {step === 'edit' && (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="text-center space-y-2">
              <Wand2 className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Editar Texto</h2>
              <p className="text-muted-foreground text-sm">
                Edite ou reescreva completamente o texto que será narrado
              </p>
            </div>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={10}
              placeholder="Digite ou edite o texto que será transformado em voz..."
              className="resize-none text-base"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{transcript.length}/4500 caracteres</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('transcribe')}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                </Button>
                <Button onClick={handleGoToVoice} disabled={!transcript.trim()}>
                  Escolher Voz <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Voice */}
        {step === 'voice' && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
            <div className="text-center space-y-2">
              <Volume2 className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Escolha a Voz</h2>
            </div>

            {/* Voice mode tabs */}
            <div className="flex gap-2 justify-center">
              {([
                { mode: 'library' as VoiceMode, label: '🎤 Biblioteca', desc: 'Vozes profissionais' },
                { mode: 'clone' as VoiceMode, label: '🧬 Clonar Voz', desc: 'Use sua própria voz' },
                { mode: 'custom' as VoiceMode, label: '🔑 Voice ID', desc: 'ID personalizado' },
              ]).map((tab) => (
                <button
                  key={tab.mode}
                  onClick={() => setVoiceMode(tab.mode)}
                  className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2 transition-all text-sm ${
                    voiceMode === tab.mode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="font-semibold">{tab.label}</span>
                  <span className="text-[10px] opacity-70">{tab.desc}</span>
                </button>
              ))}
            </div>

            {/* Library mode */}
            {voiceMode === 'library' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar vozes (ex: português, masculina, feminina...)"
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {isLoadingVoices ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                    {filteredVoices.map((voice) => (
                      <button
                        key={voice.voice_id}
                        onClick={() => setSelectedVoice(voice)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          selectedVoice?.voice_id === voice.voice_id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{voice.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {voice.labels?.language || voice.category || ''}
                            {voice.labels?.accent ? ` · ${voice.labels.accent}` : ''}
                          </p>
                        </div>
                        {voice.preview_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-8 w-8"
                            onClick={(e) => { e.stopPropagation(); playPreview(voice); }}
                          >
                            {playingVoiceId === voice.voice_id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {selectedVoice?.voice_id === voice.voice_id && (
                          <Check className="w-5 h-5 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                    {filteredVoices.length === 0 && !isLoadingVoices && (
                      <p className="text-muted-foreground text-sm col-span-2 text-center py-4">
                        Nenhuma voz encontrada.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Clone mode */}
            {voiceMode === 'clone' && (
              <div className="space-y-4 max-w-md mx-auto">
                <Input
                  placeholder="Nome da voz clonada"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                />

                {/* Record audio directly */}
                <div className="rounded-xl border-2 border-border p-5 space-y-4">
                  <p className="text-sm font-medium text-foreground text-center">🎙️ Grave sua voz</p>
                  <p className="text-xs text-muted-foreground text-center">
                    Grave pelo menos 30 segundos falando naturalmente para melhor qualidade de clonagem.
                  </p>

                  <div className="flex flex-col items-center gap-3">
                    {isRecording && (
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                        <span className="text-lg font-mono font-bold text-foreground">{formatTime(recordingTime)}</span>
                        {recordingTime < 30 && (
                          <span className="text-xs text-muted-foreground">(mín. 30s)</span>
                        )}
                      </div>
                    )}

                    <Button
                      variant={isRecording ? 'destructive' : 'outline'}
                      size="lg"
                      className="w-full max-w-xs"
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {isRecording ? (
                        <><Pause className="w-4 h-4 mr-2" /> Parar Gravação</>
                      ) : (
                        <><Mic className="w-4 h-4 mr-2" /> Iniciar Gravação</>
                      )}
                    </Button>

                    {recordedUrl && !isRecording && (
                      <div className="w-full space-y-2">
                        <audio src={recordedUrl} controls className="w-full h-10 rounded-lg" />
                        <p className="text-xs text-muted-foreground text-center">
                          Duração: {formatTime(recordingTime)} • Pronto para clonar
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou envie um arquivo</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Upload file */}
                <div
                  onClick={() => cloneInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {cloneFile && !recordedBlob ? (
                    <div className="flex items-center justify-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      <span className="text-sm text-foreground">{cloneFile.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setCloneFile(null); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : cloneFile && recordedBlob ? (
                    <div className="flex items-center justify-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      <span className="text-sm text-foreground">Áudio gravado ({formatTime(recordingTime)})</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setCloneFile(null); setRecordedBlob(null); if (recordedUrl) URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); setRecordingTime(0); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Envie um áudio com sua voz (mín. 30s)</p>
                      <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A</p>
                    </>
                  )}
                </div>
                <input
                  ref={cloneInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => { setRecordedBlob(null); if (recordedUrl) URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); setCloneFile(e.target.files?.[0] || null); }}
                />
                <Button onClick={handleCloneVoice} disabled={isCloning || !cloneName.trim() || !cloneFile} className="w-full">
                  {isCloning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Clonando...</>
                  ) : (
                    <><Copy className="w-4 h-4 mr-2" /> Clonar Minha Voz</>
                  )}
                </Button>
                {selectedVoice?.category === 'cloned' && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/30">
                    <Check className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">Voz clonada: <strong>{selectedVoice.name}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Custom Voice ID */}
            {voiceMode === 'custom' && (
              <div className="max-w-md mx-auto space-y-4">
                <Input
                  placeholder="Cole o Voice ID do ElevenLabs"
                  value={customVoiceId}
                  onChange={(e) => setCustomVoiceId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre seu Voice ID no painel do ElevenLabs ou na Voice Library.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('edit')}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={
                  (voiceMode === 'library' && !selectedVoice) ||
                  (voiceMode === 'clone' && !selectedVoice) ||
                  (voiceMode === 'custom' && !customVoiceId.trim())
                }
              >
                Gerar Vídeo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Generating */}
        {step === 'generate' && (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
              <h2 className="text-xl font-bold text-foreground">Gerando seu vídeo...</h2>
              <p className="text-muted-foreground text-sm">
                {genProgress < 50 ? 'Gerando narração com IA...' :
                 genProgress < 90 ? 'Combinando vídeo + novo áudio...' :
                 'Finalizando...'}
              </p>
              <Progress value={genProgress} className="max-w-sm mx-auto" />
            </div>
          </div>
        )}

        {/* Step 6: Done */}
        {step === 'done' && finalVideoUrl && (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="text-center space-y-2">
              <Check className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Vídeo Pronto!</h2>
              <p className="text-muted-foreground text-sm">Seu vídeo com a nova voz está pronto para download</p>
            </div>
            <video src={finalVideoUrl} controls className="rounded-xl w-full max-h-96 mx-auto" />
            <div className="flex justify-center gap-3">
              <Button onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" /> Baixar Vídeo
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Novo Vídeo
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default VoiceRewrite;
