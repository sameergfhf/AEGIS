import { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Terminal,
  Lock,
  KeyRound,
  Sparkles,
} from 'lucide-react';

export interface MascotPrompt {
  id: string;
  question: string;
  badge: string;
  icon: typeof ShieldCheck;
  detail: string;
  sampleUrl: string;
  color: string;
  positionClass: string;
}

const SECURITY_PROMPTS: MascotPrompt[] = [
  {
    id: 'api-safe',
    question: 'Is your API safe?',
    badge: 'Core Posture',
    icon: ShieldCheck,
    detail: 'Evaluates 4 core vectors: TLS strength, security headers, data leaks, and threat reputation.',
    sampleUrl: 'https://api.github.com',
    color: 'emerald',
    positionClass: 'mascot-prompt-tl',
  },
  {
    id: 'data-leaking',
    question: 'Is your data leaking?',
    badge: 'Information Exposure',
    icon: Terminal,
    detail: 'Inspects response bodies and headers for server banners, stack traces, and sensitive tokens.',
    sampleUrl: 'https://jsonplaceholder.typicode.com/posts',
    color: 'cyan',
    positionClass: 'mascot-prompt-tr',
  },
  {
    id: 'headers-missing',
    question: 'Are security headers missing?',
    badge: 'Policy Defense',
    icon: Lock,
    detail: 'Validates HSTS, Content-Security-Policy, X-Frame-Options, and X-Content-Type-Options.',
    sampleUrl: 'https://httpbin.org/get',
    color: 'amber',
    positionClass: 'mascot-prompt-bl',
  },
  {
    id: 'tls-configured',
    question: 'Is TLS configured properly?',
    badge: 'Transport Security',
    icon: KeyRound,
    detail: 'Verifies certificate validity, cipher suite strength, TLS 1.3 protocol, and forward secrecy.',
    sampleUrl: 'https://api.stripe.com/v1/charges',
    color: 'purple',
    positionClass: 'mascot-prompt-br',
  },
];

interface AegisSentinelMascotProps {
  onSelectPrompt: (prompt: MascotPrompt) => void;
  selectedPromptId?: string | null;
}

export default function AegisSentinelMascot({
  onSelectPrompt,
  selectedPromptId,
}: AegisSentinelMascotProps) {
  const [activePromptId, setActivePromptId] = useState<string>(SECURITY_PROMPTS[0].id);
  const [pupilOffset, setPupilOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [visorOffset, setVisorOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Smoothly track cursor across viewport: both visor and pupils shift with natural parallax
  useEffect(() => {
    let animId: number;
    let targetPupilX = 0;
    let targetPupilY = 0;
    let targetVisorX = 0;
    let targetVisorY = 0;
    let curPupilX = 0;
    let curPupilY = 0;
    let curVisorX = 0;
    let curVisorY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const visorCenterX = rect.left + rect.width * 0.5;
      const visorCenterY = rect.top + rect.height * 0.44;

      const dx = e.clientX - visorCenterX;
      const dy = e.clientY - visorCenterY;
      const dist = Math.hypot(dx, dy);

      // Clamp limits to prevent clipping or detaching
      const maxPupilX = 6.5;
      const maxPupilY = 4.0;
      const maxVisorX = 3.0;
      const maxVisorY = 2.0;

      const factor = Math.min(1, dist / 320);
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);

      targetPupilX = nx * maxPupilX * factor;
      targetPupilY = ny * maxPupilY * factor;
      targetVisorX = nx * maxVisorX * factor;
      targetVisorY = ny * maxVisorY * factor;
    };

    const updateEyeGaze = () => {
      curPupilX += (targetPupilX - curPupilX) * 0.16;
      curPupilY += (targetPupilY - curPupilY) * 0.16;
      curVisorX += (targetVisorX - curVisorX) * 0.14;
      curVisorY += (targetVisorY - curVisorY) * 0.14;

      setPupilOffset({
        x: Math.round(curPupilX * 100) / 100,
        y: Math.round(curPupilY * 100) / 100,
      });
      setVisorOffset({
        x: Math.round(curVisorX * 100) / 100,
        y: Math.round(curVisorY * 100) / 100,
      });

      animId = requestAnimationFrame(updateEyeGaze);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animId = requestAnimationFrame(updateEyeGaze);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  const handlePromptClick = (prompt: MascotPrompt) => {
    setActivePromptId(prompt.id);
    onSelectPrompt(prompt);
  };

  return (
    <div className="aegis-mascot-showcase relative mx-auto my-14 max-w-4xl px-4 sm:px-6">
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-forest">
          <Sparkles className="h-3.5 w-3.5" />
          Interactive Sentinel Guide
        </span>
        <h2 className="mt-3 font-sans text-2xl sm:text-3xl font-bold tracking-tight text-ink">
          Ask your API the critical questions
        </h2>
        <p className="mt-2 text-sm text-muted max-w-xl mx-auto leading-relaxed">
          Select any security question below. AEGIS Sentinel will pre-load an example check and explain what evidence is inspected.
        </p>
      </div>

      {/* Main Mascot Stage */}
      <div className="mascot-stage-container relative mx-auto flex min-h-[420px] max-w-3xl items-center justify-center rounded-3xl border border-line bg-paper/70 p-6 sm:p-12 backdrop-blur-md shadow-xl">
        {/* Ambient Glow */}
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_45%,rgba(16,185,129,0.14),transparent_70%)]" aria-hidden="true" />

        {/* Larger Robot Mascot with Dual Parallax Tracking */}
        <div className="mascot-character-wrapper relative z-10 flex flex-col items-center">
          <div className="mascot-avatar-pulse relative">
            <svg
              ref={svgRef}
              className="h-56 w-56 sm:h-64 sm:w-64 md:h-72 md:w-72 transition-transform duration-300 hover:scale-105"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="AEGIS API Sentinel Mascot"
            >
              <defs>
                <linearGradient id="armorGrad" x1="40" y1="30" x2="160" y2="170" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#1F3D2B" />
                  <stop offset="0.6" stopColor="#14281C" />
                  <stop offset="1" stopColor="#0B1811" />
                </linearGradient>
                <linearGradient id="shieldPlate" x1="70" y1="60" x2="130" y2="150" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2E583F" />
                  <stop offset="1" stopColor="#173021" />
                </linearGradient>
                <linearGradient id="visorGrad" x1="60" y1="80" x2="140" y2="105" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#00F2FE" />
                  <stop offset="0.5" stopColor="#10B981" />
                  <stop offset="1" stopColor="#0284C7" />
                </linearGradient>
                <linearGradient id="accentGlow" x1="100" y1="160" x2="100" y2="190" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#10B981" stopOpacity="0.8" />
                  <stop offset="1" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
                <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Antigravity Thruster Aura */}
              <ellipse cx="100" cy="175" rx="38" ry="11" fill="url(#accentGlow)" />
              <ellipse cx="100" cy="173" rx="24" ry="5.5" fill="#00F2FE" opacity="0.6" filter="url(#glowFilter)" />

              {/* Drone Body Outer Ring / Wings */}
              <path
                d="M38 95C38 65 65 42 100 42C135 42 162 65 162 95C162 120 144 140 120 146L100 152L80 146C56 140 38 120 38 95Z"
                fill="url(#armorGrad)"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="2.5"
              />

              {/* Left & Right Sensor Ears */}
              <rect x="28" y="86" width="10" height="22" rx="5" fill="#2E583F" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <circle cx="33" cy="97" r="2.5" fill="#00F2FE" />
              <rect x="162" y="86" width="10" height="22" rx="5" fill="#2E583F" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <circle cx="167" cy="97" r="2.5" fill="#00F2FE" />

              {/* Top Sensor Fin */}
              <path d="M96 26C96 23.7909 97.7909 22 100 22C102.209 22 104 23.7909 104 26V42H96V26Z" fill="#10B981" />
              <circle cx="100" cy="20" r="3.5" fill="#00F2FE" filter="url(#glowFilter)" />

              {/* Central Chest Armor / Shield */}
              <path
                d="M62 82C62 66 79 56 100 56C121 56 138 66 138 82C138 108 116 128 100 138C84 128 62 108 62 82Z"
                fill="url(#shieldPlate)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="2"
              />

              {/* Glowing Curved Visor Eye Socket (Tracks Cursor with Subtle Parallax) */}
              <g transform={`translate(${visorOffset.x}, ${visorOffset.y})`}>
                <path
                  d="M74 88C74 81 85 76 100 76C115 76 126 81 126 88C126 95 115 100 100 100C85 100 74 95 74 88Z"
                  fill="url(#visorGrad)"
                  filter="url(#glowFilter)"
                />
              </g>

              {/* Eye Pupils / Friendly Glint (Tracks Cursor inside Visor) */}
              <g transform={`translate(${pupilOffset.x}, ${pupilOffset.y})`}>
                <ellipse cx="92" cy="88" rx="4.5" ry="5.5" fill="#FFFFFF" />
                <ellipse cx="108" cy="88" rx="4.5" ry="5.5" fill="#FFFFFF" />
                <circle cx="94" cy="86" r="1.5" fill="#080C14" />
                <circle cx="110" cy="86" r="1.5" fill="#080C14" />
              </g>

              {/* AEGIS Chevron Emblem on Chest */}
              <path
                d="M100 112L108 120H92L100 112Z"
                fill="#C85A32"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1"
              />
            </svg>
          </div>
        </div>

        {/* Interactive Floating Question Prompts (Desktop Quadrant Positions) */}
        <div className="mascot-prompts-layer absolute inset-0 hidden md:block pointer-events-none">
          {SECURITY_PROMPTS.map((prompt) => {
            const isSelected = (selectedPromptId || activePromptId) === prompt.id;
            const Icon = prompt.icon;
            return (
              <button
                key={prompt.id}
                type="button"
                onClick={() => handlePromptClick(prompt)}
                className={`mascot-prompt-pill pointer-events-auto absolute flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 hover:scale-105 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest ${prompt.positionClass} ${
                  isSelected
                    ? 'border-forest bg-paper shadow-md ring-2 ring-forest/30'
                    : 'border-line bg-paper/95 hover:border-forest/50'
                }`}
                aria-label={`Ask: ${prompt.question}`}
              >
                <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="block font-sans text-xs font-bold text-ink leading-tight">
                    {prompt.question}
                  </span>
                  <span className="block font-mono text-[10px] text-muted">
                    {prompt.badge}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Prompts Grid (< md) */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:hidden">
        {SECURITY_PROMPTS.map((prompt) => {
          const isSelected = (selectedPromptId || activePromptId) === prompt.id;
          const Icon = prompt.icon;
          return (
            <button
              key={prompt.id}
              type="button"
              onClick={() => handlePromptClick(prompt)}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                isSelected
                  ? 'border-forest bg-paper shadow-sm ring-2 ring-forest/20'
                  : 'border-line bg-paper/90'
              }`}
            >
              <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-ink">{prompt.question}</span>
                <span className="block font-mono text-[10px] text-muted">{prompt.badge}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
