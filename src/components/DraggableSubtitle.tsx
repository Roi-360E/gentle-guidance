import { useState, useRef, useCallback, useEffect } from 'react';
import { Move, Maximize2 } from 'lucide-react';

// CSS for typewriter blink cursor injected once
const TYPEWRITER_STYLE_ID = 'typewriter-subtitle-style';
if (typeof document !== 'undefined' && !document.getElementById(TYPEWRITER_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = TYPEWRITER_STYLE_ID;
  style.textContent = `
    @keyframes tw-blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .tw-cursor::after { content:'|'; animation: tw-blink 0.7s step-end infinite; margin-left:2px; }
  `;
  document.head.appendChild(style);
}

interface DraggableSubtitleProps {
  words: string[];
  highlightIndex: number;
  positionY: number;
  fontSizePct: number;
  onPositionChange: (y: number) => void;
  onFontSizeChange: (pct: number) => void;
  colors: {
    primary: string;
    highlight: string;
    bg: string;
  };
  textEffects?: React.CSSProperties;
  useBold: boolean;
  textAlign?: 'left' | 'center' | 'right';
  maxLines?: number;
}

export function DraggableSubtitle({
  words,
  highlightIndex,
  positionY,
  fontSizePct,
  onPositionChange,
  onFontSizeChange,
  colors,
  textEffects = {},
  useBold,
  textAlign = 'center',
  maxLines = 2,
}: DraggableSubtitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef({ y: 0, startPosY: 0 });
  const resizeStartRef = useRef({ y: 0, startSize: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { y: clientY, startPosY: positionY };
    setIsDragging(true);
  }, [positionY]);

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStartRef.current = { y: clientY, startSize: fontSizePct };
    setIsResizing(true);
  }, [fontSizePct]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const parent = containerRef.current?.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();

      if (isDragging) {
        const deltaY = clientY - dragStartRef.current.y;
        const deltaPct = (deltaY / parentRect.height) * 100;
        const newY = Math.max(5, Math.min(95, dragStartRef.current.startPosY + deltaPct));
        onPositionChange(newY);
      }

      if (isResizing) {
        const deltaY = clientY - resizeStartRef.current.y;
        const deltaPct = (deltaY / parentRect.height) * 30;
        const newSize = Math.max(2, Math.min(12, resizeStartRef.current.startSize + deltaPct));
        onFontSizeChange(Math.round(newSize * 10) / 10);
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, isResizing, onPositionChange, onFontSizeChange]);

  const showControls = isHovered || isDragging || isResizing;

  // Split words into exactly maxLines lines (never more)
  const buildLines = (): string[][] => {
    if (maxLines <= 1) return [words];
    if (words.length <= 1) return [words];
    
    const targetLines = Math.min(maxLines, words.length);
    const perLine = Math.ceil(words.length / targetLines);
    const lines: string[][] = [];
    
    for (let i = 0; i < words.length; i += perLine) {
      if (lines.length < maxLines - 1) {
        lines.push(words.slice(i, i + perLine));
      } else {
        // Last allowed line gets ALL remaining words
        lines.push(words.slice(i));
        break;
      }
    }
    return lines;
  };

  const lines = buildLines();

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0"
      style={{
        top: `${positionY}%`,
        transform: 'translateY(-50%)',
        zIndex: 20,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => !isDragging && !isResizing && setIsHovered(false)}
    >
      <div className={`flex px-[5%] ${textAlign === 'left' ? 'justify-start' : textAlign === 'right' ? 'justify-end' : 'justify-center'}`} style={{ textAlign }}>
        <div
          className="relative group"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        >
          {showControls && (
            <div
              className="absolute -inset-2 rounded-lg border-2 border-dashed border-white/60 pointer-events-none"
              style={{ boxShadow: '0 0 8px rgba(0,0,0,0.5)' }}
            />
          )}

          {showControls && (
            <div
              className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary rounded-full p-1 cursor-grab active:cursor-grabbing shadow-lg z-30"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <Move className="w-3 h-3 text-primary-foreground" />
            </div>
          )}

          {showControls && (
            <>
              <div
                className="absolute -bottom-2 -left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center cursor-ns-resize shadow-lg z-30"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
              >
                <Maximize2 className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
              <div
                className="absolute -bottom-2 -right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center cursor-ns-resize shadow-lg z-30"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
              >
                <Maximize2 className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            </>
          )}

          <span
            className="inline-flex flex-col select-none"
            style={{
              backgroundColor: colors.bg !== 'transparent' ? colors.bg : 'transparent',
              padding: '0.35em 0.6em',
              borderRadius: '6px',
              gap: '0.1em',
              lineHeight: 1.1,
              alignItems: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            {(() => {
              let wordIndex = 0;
              return lines.map((lineWords, li) => (
                <span
                  key={li}
                  style={{
                    display: 'inline-flex',
                    gap: '0.25em',
                    justifyContent: 'center',
                  }}
                >
                  {lineWords.map((word) => {
                    const idx = wordIndex++;
                    const isHighlighted = idx === highlightIndex;
                    return (
                      <span
                        key={idx}
                        className="font-black uppercase"
                        style={{
                          color: isHighlighted ? colors.highlight : colors.primary,
                          fontSize: `clamp(12px, calc(${fontSizePct} * 0.18rem), 48px)`,
                          letterSpacing: '0.02em',
                          lineHeight: 1,
                          display: 'inline-block',
                          fontFamily: "'Nunito', 'Arial Rounded MT Bold', 'Arial Black', sans-serif",
                          transition: 'color 0.08s ease',
                          ...(colors.bg === 'transparent' ? {
                            textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000',
                          } : {}),
                        }}
                      >
                        {word.toUpperCase()}
                      </span>
                    );
                  })}
                </span>
              ));
            })()}
          </span>

          {isResizing && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-background/90 text-foreground text-[10px] font-mono px-2 py-0.5 rounded-full border border-border shadow">
              {fontSizePct.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
