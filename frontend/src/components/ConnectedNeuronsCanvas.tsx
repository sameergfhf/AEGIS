import { useEffect, useRef } from 'react';

interface NodePoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  pulsePhase: number;
}

interface PulseSignal {
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
}

interface ConnectedNeuronsCanvasProps {
  className?: string;
  mousePos?: { x: number; y: number } | null;
}

export default function ConnectedNeuronsCanvas({
  className = '',
  mousePos,
}: ConnectedNeuronsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    mouseRef.current = mousePos ?? null;
  }, [mousePos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 540);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || 540;
    };
    window.addEventListener('resize', handleResize);

    const isDark = () => document.documentElement.dataset.theme === 'dark';

    // Generate network nodes with good density
    const nodeCount = Math.min(52, Math.max(32, Math.floor((width * height) / 14000)));
    const nodes: NodePoint[] = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        radius: Math.random() * 2.2 + 1.8,
        baseRadius: Math.random() * 2.2 + 1.8,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Active signals traveling along synapses
    const signals: PulseSignal[] = [];

    const maxDistance = 145;
    const mouseAttractRadius = 190;

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(32, time - lastTime);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      const dark = isDark();

      // High-contrast, vibrant palette on both light and dark themes
      const nodeFill = dark ? 'rgba(0, 242, 254, 0.85)' : 'rgba(16, 185, 129, 0.9)';
      const nodeStroke = dark ? 'rgba(0, 242, 254, 0.4)' : 'rgba(31, 61, 43, 0.75)';
      const nodeGlow = dark ? 'rgba(0, 242, 254, 0.45)' : 'rgba(16, 185, 129, 0.35)';
      const lineColorRgb = dark ? '0, 242, 254' : '31, 61, 43';
      const pulseColor = dark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(200, 90, 50, 0.95)';

      const cursor = mouseRef.current;
      const cursorCanvasX = cursor ? (cursor.x / 100) * width : -9999;
      const cursorCanvasY = cursor ? (cursor.y / 100) * height : -9999;

      // Update positions & draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx * (dt / 16);
        n.y += n.vy * (dt / 16);

        // Boundary bounce
        if (n.x < 15) { n.x = 15; n.vx *= -1; }
        if (n.x > width - 15) { n.x = width - 15; n.vx *= -1; }
        if (n.y < 15) { n.y = 15; n.vy *= -1; }
        if (n.y > height - 15) { n.y = height - 15; n.vy *= -1; }

        // Subtle attraction toward cursor
        if (cursor) {
          const dx = cursorCanvasX - n.x;
          const dy = cursorCanvasY - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < mouseAttractRadius && dist > 2) {
            const force = ((mouseAttractRadius - dist) / mouseAttractRadius) * 0.12;
            n.x += (dx / dist) * force;
            n.y += (dy / dist) * force;
          }
        }

        // Pulse calculation
        n.pulsePhase += 0.03;
        const currentRadius = n.baseRadius + Math.sin(n.pulsePhase) * 0.75;

        // Draw node with clear outer stroke and glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = nodeFill;
        ctx.shadowColor = nodeGlow;
        ctx.shadowBlur = dark ? 8 : 4;
        ctx.fill();

        ctx.strokeStyle = nodeStroke;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw connecting synapse lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);

          if (dist < maxDistance) {
            // Enhanced alpha for crisp visibility on light theme
            const proximity = 1 - dist / maxDistance;
            const alpha = proximity * (dark ? 0.35 : 0.38);

            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(${lineColorRgb}, ${alpha})`;
            ctx.lineWidth = proximity * 1.6 + 0.5;
            ctx.stroke();

            // Spawn pulse signal
            if (Math.random() < 0.001 && signals.length < 10) {
              signals.push({
                fromNode: i,
                toNode: j,
                progress: 0,
                speed: 0.014 + Math.random() * 0.012,
              });
            }
          }
        }

        // Draw interactive connection line to cursor
        if (cursor) {
          const dx = cursorCanvasX - nodes[i].x;
          const dy = cursorCanvasY - nodes[i].y;
          const dist = Math.hypot(dx, dy);
          if (dist < mouseAttractRadius) {
            const proximity = 1 - dist / mouseAttractRadius;
            const alpha = proximity * (dark ? 0.55 : 0.45);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(cursorCanvasX, cursorCanvasY);
            ctx.strokeStyle = dark
              ? `rgba(0, 242, 254, ${alpha})`
              : `rgba(200, 90, 50, ${alpha})`;
            ctx.lineWidth = proximity * 1.5 + 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw traveling action-potential pulse dots
      for (let s = signals.length - 1; s >= 0; s--) {
        const sig = signals[s];
        sig.progress += sig.speed;
        if (sig.progress >= 1) {
          signals.splice(s, 1);
          continue;
        }

        const from = nodes[sig.fromNode];
        const to = nodes[sig.toNode];
        if (!from || !to) {
          signals.splice(s, 1);
          continue;
        }

        const px = from.x + (to.x - from.x) * sig.progress;
        const py = from.y + (to.y - from.y) * sig.progress;

        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pulseColor;
        ctx.shadowColor = pulseColor;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full opacity-100 transition-opacity duration-300 ${className}`}
      aria-hidden="true"
    />
  );
}
