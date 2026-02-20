import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MessageSquare, Send, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-roteiros`;

export function ScriptChatFloat() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [plan, setPlan] = useState('free');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const charQueueRef = useRef<string>('');
  const revealedRef = useRef('');
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load plan
  useEffect(() => {
    if (!user) return;
    const monthYear = new Date().toISOString().slice(0, 7);
    supabase
      .from('video_usage')
      .select('plan')
      .eq('user_id', user.id)
      .eq('month_year', monthYear)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPlan(data.plan);
      });
  }, [user]);

  // Load conversations
  useEffect(() => {
    if (!user || !open) return;
    supabase
      .from('conversations')
      .select('id, title, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setConversations(data);
      });
  }, [user, open]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversation) {
      setMessages([]);
      return;
    }
    supabase
      .from('chat_messages')
      .select('id, role, content')
      .eq('conversation_id', activeConversation)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });
  }, [activeConversation]);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isPaid = plan === 'enterprise';

  const createConversation = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: 'Novo Roteiro' })
      .select('id, title, created_at')
      .single();
    if (error) {
      toast.error('Erro ao criar conversa');
      return;
    }
    setConversations((prev) => [data, ...prev]);
    setActiveConversation(data.id);
    setMessages([]);
    setShowHistory(false);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from('conversations').delete().eq('id', id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversation === id) {
      setActiveConversation(null);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !user) return;

    let convId = activeConversation;

    // Auto-create conversation if none
    if (!convId) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title: input.slice(0, 50) })
        .select('id, title, created_at')
        .single();
      if (error || !data) {
        toast.error('Erro ao criar conversa');
        return;
      }
      convId = data.id;
      setConversations((prev) => [data, ...prev]);
      setActiveConversation(convId);
    }

    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Save user message
    await supabase.from('chat_messages').insert({
      conversation_id: convId,
      user_id: user.id,
      role: 'user',
      content: userMsg.content,
    });

    // Update conversation title if first message
    if (messages.length === 0) {
      await supabase
        .from('conversations')
        .update({ title: userMsg.content.slice(0, 50) })
        .eq('id', convId);
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: userMsg.content.slice(0, 50) } : c))
      );
    }

    // Stream response
    const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const MAX_RETRIES = 2;
      const TIMEOUT_MS = 20000;
      let resp: Response | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
          resp = await fetch(CHAT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ messages: allMessages }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (resp.ok && resp.body) break;

          if (resp.status === 429 || resp.status >= 500) {
            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
              continue;
            }
          }

          const errorData = await resp.json().catch(() => ({}));
          toast.error(errorData.error || 'Erro ao gerar resposta');
          setIsLoading(false);
          return;
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError' && attempt < MAX_RETRIES) {
            toast('Conexão lenta, tentando novamente…', { duration: 2000 });
            abortRef.current = new AbortController();
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw fetchErr;
        }
      }

      if (!resp || !resp.ok || !resp.body) {
        toast.error('Não foi possível conectar. Verifique sua internet.');
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantSoFar = '';
      let streamDone = false;
      setIsStreaming(true);
      charQueueRef.current = '';
      revealedRef.current = '';

      // Typewriter interval — reveals chars from the queue
      const CHAR_DELAY = 15;
      const CHARS_PER_TICK = 3;
      typingTimerRef.current = setInterval(() => {
        if (charQueueRef.current.length > 0) {
          const take = Math.min(CHARS_PER_TICK, charQueueRef.current.length);
          const chunk = charQueueRef.current.slice(0, take);
          charQueueRef.current = charQueueRef.current.slice(take);
          revealedRef.current += chunk;
          const revealed = revealedRef.current;
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant') {
              return msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, content: revealed } : m));
            }
            return [...msgs, { role: 'assistant', content: revealed }];
          });
        }
      }, CHAR_DELAY);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              charQueueRef.current += content;
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Drain remaining queue
      await new Promise<void>((resolve) => {
        const drainInterval = setInterval(() => {
          if (charQueueRef.current.length === 0) {
            clearInterval(drainInterval);
            resolve();
          }
        }, 50);
      });

      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }

      // Ensure final text is fully displayed
      if (assistantSoFar) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      }

      // Save assistant message
      if (assistantSoFar) {
        await supabase.from('chat_messages').insert({
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant',
          content: assistantSoFar,
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error('Erro na conexão com a IA');
      }
    } finally {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setIsStreaming(false);
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 z-50 rounded-full w-14 h-14 p-0 shadow-lg bg-gradient-to-r from-primary to-accent hover:opacity-90"
          size="icon"
        >
          <MessageSquare className="w-6 h-6 text-primary-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-primary flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              RoteiroPRO IA
            </SheetTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)} title="Histórico">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
              </Button>
              <Button variant="ghost" size="icon" onClick={createConversation} title="Nova conversa">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {!isPaid ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div className="space-y-4">
              <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Recurso Exclusivo</h3>
              <p className="text-sm text-muted-foreground">
                O RoteiroPRO IA está disponível apenas para o plano <strong>Empresarial</strong>.
              </p>
              <Button
                onClick={() => { setOpen(false); setTimeout(() => navigate('/plans'), 300); }}
                className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
              >
                Ver Planos
              </Button>
            </div>
          </div>
        ) : showHistory ? (
          <div className="flex-1 overflow-auto p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Conversas Anteriores</h3>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conversa ainda</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    activeConversation === conv.id ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50 hover:bg-muted'
                  }`}
                  onClick={() => { setActiveConversation(conv.id); setShowHistory(false); }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-foreground">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(conv.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 space-y-4 text-center">
                  <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">RoteiroPRO IA</h3>
                  <p className="text-sm text-muted-foreground max-w-[280px]">
                    Seu copywriter veterano com 50+ anos de experiência. Vou te guiar por etapas para criar roteiros sob medida! 🎬
                  </p>
                  <div className="grid gap-2 w-full max-w-[280px]">
                    {['Quero criar roteiros para meu negócio', 'Preciso de ganchos virais para Reels', 'Me ajude a vender mais com vídeos curtos'].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="text-xs justify-start text-left h-auto py-2"
                        onClick={() => { setInput(suggestion); }}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`rounded-2xl text-sm ${
                          msg.role === 'user'
                            ? 'max-w-[85%] bg-primary text-primary-foreground rounded-br-md px-4 py-2.5'
                            : 'max-w-[95%] bg-muted/60 text-foreground rounded-bl-md px-4 py-3'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none
                            [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                            [&>h3]:text-base [&>h3]:font-bold [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:text-primary
                            [&>h4]:text-sm [&>h4]:font-semibold [&>h4]:mt-3 [&>h4]:mb-1.5
                            [&>hr]:my-3 [&>hr]:border-border/50
                            [&>blockquote]:border-l-2 [&>blockquote]:border-primary/40 [&>blockquote]:pl-3 [&>blockquote]:italic [&>blockquote]:text-foreground/80 [&>blockquote]:my-2
                            [&>ul]:space-y-1 [&>ol]:space-y-1
                            [&>table]:text-xs [&>table]:w-full [&>table_th]:text-left [&>table_th]:pb-1 [&>table_th]:border-b [&>table_td]:py-1 [&>table_td]:border-b [&>table_td]:border-border/30
                            [&>p]:leading-relaxed
                            [&_strong]:text-foreground
                            [&_em]:text-muted-foreground
                          ">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                            {isStreaming && idx === messages.length - 1 && (
                              <span className="inline-block w-[2px] h-[1em] bg-primary ml-0.5 align-middle animate-[pulse_0.8s_ease-in-out_infinite]" />
                            )}
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={scrollRef} />
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-border">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Descreva seu vídeo..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
