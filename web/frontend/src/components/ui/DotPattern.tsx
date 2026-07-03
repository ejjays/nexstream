import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  memo,
} from 'react';
import { cn } from '../../lib/utils';

interface DotPatternProps {
  className?: string;
  children?: React.ReactNode;
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  glowColor?: string;
  proximity?: number;
  glowIntensity?: number;
  waveSpeed?: number;
  showBackground?: boolean;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        red: Number.parseInt(result[1], 16),
        green: Number.parseInt(result[2], 16),
        blue: Number.parseInt(result[3], 16),
      }
    : { red: 0, green: 0, blue: 0 };
}

interface Dot {
  x: number;
  y: number;
  baseOpacity: number;
}

export const DotPattern = memo(
  ({
    className,
    children,
    dotSize = 2,
    gap = 24,
    baseColor = '#808080',
    glowColor = '#22d3ee',
    proximity = 130,
    glowIntensity = 1.6,
    waveSpeed = 0.5,
    showBackground = true,
  }: DotPatternProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dotsRef = useRef<Dot[]>([]);
    const mouseRef = useRef({ x: -1000, y: -1000 });
    const animationRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const lastMoveTimeRef = useRef<number | null>(null);

    useLayoutEffect(() => {
      startTimeRef.current = Date.now();
      lastMoveTimeRef.current = Date.now();
    }, []);

    const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
    const glowRgb = useMemo(() => hexToRgb(glowColor), [glowColor]);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const { x: mx, y: my } = mouseRef.current;
      const proxSq = proximity * proximity;

      const now = Date.now();
      const startTime = startTimeRef.current || now;
      const lastMoveTime = lastMoveTimeRef.current || now;

      const time = (now - startTime) * 0.001 * waveSpeed;
      const timeSinceMove = now - lastMoveTime;
      const interactionStrength = Math.max(
        0,
        Math.min(1, 1 - (timeSinceMove - 1000) / 1000)
      );

      for (const dot of dotsRef.current) {
        const dx = dot.x - mx;
        const dy = dot.y - my;
        const distSq = dx * dx + dy * dy;

        // compute wave
        const wave = Math.sin(dot.x * 0.02 + dot.y * 0.02 + time) * 0.5 + 0.5;
        const waveOpacity = dot.baseOpacity + wave * 0.15;
        const waveScale = 1 + wave * 0.2;

        let opacity = waveOpacity;
        let scale = waveScale;
        let red = baseRgb.red;
        let green = baseRgb.green;
        let blue = baseRgb.blue;
        let glow = 0;

        if (distSq < proxSq && interactionStrength > 0) {
          const dist = Math.sqrt(distSq);
          const t = (1 - dist / proximity) * interactionStrength;
          const easedT = t * t * (3 - 2 * t);

          red = Math.round(baseRgb.red + (glowRgb.red - baseRgb.red) * easedT);
          green = Math.round(
            baseRgb.green + (glowRgb.green - baseRgb.green) * easedT
          );
          blue = Math.round(
            baseRgb.blue + (glowRgb.blue - baseRgb.blue) * easedT
          );

          opacity = Math.min(1, waveOpacity + easedT * 0.8);
          scale = waveScale + easedT * 1.1;
          glow = easedT * glowIntensity;
        }

        const radius = (dotSize / 2) * scale;

        // draw glow
        if (glow > 0) {
          const gradient = ctx.createRadialGradient(
            dot.x,
            dot.y,
            0,
            dot.x,
            dot.y,
            radius * 5
          );
          gradient.addColorStop(
            0,
            `rgba(${glowRgb.red}, ${glowRgb.green}, ${glowRgb.blue}, ${glow * 0.45})`
          );
          gradient.addColorStop(
            0.5,
            `rgba(${glowRgb.red}, ${glowRgb.green}, ${glowRgb.blue}, ${glow * 0.12})`
          );
          gradient.addColorStop(
            1,
            `rgba(${glowRgb.red}, ${glowRgb.green}, ${glowRgb.blue}, 0)`
          );
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, radius * 5, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    }, [baseRgb, glowRgb, proximity, waveSpeed, dotSize, glowIntensity]);

    const buildGrid = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      const cellSize = dotSize + gap;
      const cols = Math.ceil(rect.width / cellSize) + 1;
      const rows = Math.ceil(rect.height / cellSize) + 1;

      const offsetX = (rect.width - (cols - 1) * cellSize) / 2;
      const offsetY = (rect.height - (rows - 1) * cellSize) / 2;

      const dots = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          dots.push({
            x: offsetX + col * cellSize,
            y: offsetY + row * cellSize,
            baseOpacity: 0.6 + Math.random() * 0.2,
          });
        }
      }
      dotsRef.current = dots;
    }, [dotSize, gap]);

    // sync grid size
    useEffect(() => {
      buildGrid();

      const container = containerRef.current;
      if (!container) return;

      const ro = new ResizeObserver(buildGrid);
      ro.observe(container);

      // skipcq: JS-0045
      return () => ro.disconnect();
    }, [buildGrid]);

    // run animation
    useEffect(() => {
      animationRef.current = requestAnimationFrame(draw);
      return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
    }, [draw]);

    // handle user input
    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (lastMoveTimeRef.current !== null)
          lastMoveTimeRef.current = Date.now();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (lastMoveTimeRef.current !== null)
          lastMoveTimeRef.current = Date.now();
        if (e.touches.length > 0) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          mouseRef.current = {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top,
          };
        }
      };

      const handleMouseLeave = () => {
        mouseRef.current = { x: -1000, y: -1000 };
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mousedown', handleMouseMove);
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchstart', handleTouchMove, { passive: true });
      window.addEventListener('mouseleave', handleMouseLeave);
      window.addEventListener('touchend', handleMouseLeave);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseMove);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchstart', handleTouchMove);
        window.removeEventListener('mouseleave', handleMouseLeave);
        window.removeEventListener('touchend', handleMouseLeave);
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className={cn(
          'fixed inset-0 overflow-hidden -z-20',
          showBackground ? 'bg-[#030014]' : 'bg-transparent',
          className
        )}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full opacity-60"
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(3,0,20,0.8) 100%)',
          }}
        />

        {children && (
          <div className="relative z-10 h-full w-full">{children}</div>
        )}
      </div>
    );
  }
);

DotPattern.displayName = 'DotPattern';

export default DotPattern;
