import { useState, useRef, useCallback, useEffect } from 'react';
import { Move, Maximize2 } from 'lucide-react';

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
}: DraggableSubtitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef({ y: 0, startPosY: 0 });
  const resizeStartRef = useRef({ y: 0, startSize: 0 });

  // Drag to reposition (Y axis)
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { y: clientY, startPosY: positionY };
    setIsDragging(true);
  }, [positionY]);

  // Resize handles to change font size
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
        // Drag down = bigger, drag up = smaller
        const deltaY = clientY - resizeStartRef.current.y;
        const deltaPct = (deltaY / parentRect.height) * 30; // sensitivity
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
      <div className="flex justify-center px-[5%]">
        <div
          className="relative group"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        >
          {/* Selection border */}
          {showControls && (
            <div
              className="absolute -inset-2 rounded-lg border-2 border-dashed border-white/60 pointer-events-none"
              style={{ boxShadow: '0 0 8px rgba(0,0,0,0.5)' }}
            />
          )}

          {/* Drag handle (center top) */}
          {showControls && (
            <div
              className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary rounded-full p-1 cursor-grab active:cursor-grabbing shadow-lg z-30"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <Move className="w-3 h-3 text-primary-foreground" />
            </div>
          )}

          {/* Resize handles (bottom corners) */}
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

          {/* The subtitle text itself */}
          <span
            className="inline-block max-w-[90%] select-none"
            style={{
              backgroundColor: colors.bg !== 'transparent' ? colors.bg : 'transparent',
              padding: colors.bg !== 'transparent' ? '4px 14px' : '2px 4px',
              borderRadius: colors.bg !== 'transparent' ? '8px' : '0',
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            {words.map((word, i) => {
              const isHighlighted = i === highlightIndex;
              return (
                <span
                  key={i}
                  className={`${useBold ? 'font-black' : 'font-semibold'} uppercase tracking-wide transition-colors duration-75`}
                  style={{
                    color: isHighlighted ? colors.highlight : colors.primary,
                    fontSize: `clamp(14px, ${fontSizePct * 0.6}vw, 42px)`,
                    ...textEffects,
                    marginRight: i < words.length - 1 ? '0.3em' : '0',
                    display: 'inline-block',
                    transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 0.1s ease, color 0.1s ease',
                  }}
                >
                  {word.toUpperCase()}
                </span>
              );
            })}
          </span>

          {/* Size indicator while resizing */}
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
