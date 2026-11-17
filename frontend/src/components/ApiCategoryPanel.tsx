// src/components/ApiCategoryPanel.tsx
// Displays the auto-detected API category and lets the user correct it.

import { useEffect, useState, useCallback } from 'react';
import { Tag, ChevronDown, Check, AlertTriangle, Cpu, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiCategory, correctApiCategory, listApiCategories } from '../services/api';
import { Badge, Spinner } from './ui';
import type { ApiCategoryResult } from '../types';

// ── Category icon / colour mapping ─────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { emoji: string; badgeVariant: 'cyan' | 'emerald' | 'amber' | 'neutral' | 'blue' }
> = {
  'AI / LLM API':                   { emoji: '🤖', badgeVariant: 'cyan' },
  'Payment API':                    { emoji: '💳', badgeVariant: 'emerald' },
  'Weather API':                    { emoji: '🌦️', badgeVariant: 'blue' },
  'Maps / Location API':            { emoji: '🗺️', badgeVariant: 'blue' },
  'Communication / Messaging API':  { emoji: '💬', badgeVariant: 'amber' },
  'Authentication / Identity API':  { emoji: '🔑', badgeVariant: 'amber' },
  'Cloud Storage API':              { emoji: '☁️', badgeVariant: 'neutral' },
  'Database API':                   { emoji: '🗄️', badgeVariant: 'neutral' },
  'General REST API':               { emoji: '🔗', badgeVariant: 'neutral' },
  'Unknown / Unclassified':         { emoji: '❓', badgeVariant: 'neutral' },
};

function confidenceBar(conf: number) {
  const pct = Math.round(conf * 100);
  const colour =
    pct >= 80 ? 'bg-safe' : pct >= 50 ? 'bg-medium' : 'bg-critical';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-elevated">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-muted">{pct}%</span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ApiCategoryPanelProps {
  scanId: string;
  scanStatus: string;
}

export default function ApiCategoryPanel({ scanId, scanStatus }: ApiCategoryPanelProps) {
  const [result, setResult] = useState<ApiCategoryResult | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (scanStatus !== 'completed' && scanStatus !== 'failed') return;
    setIsLoading(true);
    setError(null);
    try {
      const [cat, cats] = await Promise.all([
        getApiCategory(scanId),
        listApiCategories(),
      ]);
      setResult(cat);
      setAllCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API category.');
    } finally {
      setIsLoading(false);
    }
  }, [scanId, scanStatus]);

  useEffect(() => { load(); }, [load]);

  const handleCorrection = async (category: string) => {
    setDropdownOpen(false);
    if (!result || category === (result.user_category ?? result.category)) return;
    setIsSaving(true);
    try {
      const updated = await correctApiCategory(scanId, category);
      setResult(updated);
      toast.success('API category updated.');
    } catch {
      toast.error('Failed to save category correction.');
    } finally {
      setIsSaving(false);
    }
  };

  if (scanStatus !== 'completed' && scanStatus !== 'failed') return null;

  if (isLoading) {
    return (
      <section className="aegis-panel" aria-label="API Category loading">
        <div className="aegis-panel-head">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line-strong bg-canvas">
              <Tag className="h-4 w-4 text-muted" aria-hidden="true" />
            </span>
            <div>
              <p className="aegis-eyebrow">Classification / category</p>
              <p className="mt-1 font-display text-[15px] font-semibold text-ink">API Category</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-4">
          <Spinner size="sm" label="" />
          <span className="text-[12px] text-muted">Identifying API category…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="aegis-panel border-critical/20" aria-label="API Category error">
        <div className="aegis-panel-head">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line-strong bg-canvas">
              <Tag className="h-4 w-4 text-muted" aria-hidden="true" />
            </span>
            <div>
              <p className="aegis-eyebrow">Classification / category</p>
              <p className="mt-1 font-display text-[15px] font-semibold text-ink">API Category</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-4 text-[12px] text-muted">{error}</div>
      </section>
    );
  }

  if (!result) return null;

  const displayCategory = result.user_category ?? result.category;
  const isUnknown = displayCategory === 'Unknown / Unclassified';
  const meta = CATEGORY_META[displayCategory] ?? CATEGORY_META['Unknown / Unclassified'];
  const isUserOverridden = Boolean(result.user_category);
  const needsConfirmation = result.requires_user_confirmation && !isUserOverridden;

  return (
    <section className="aegis-panel" aria-label="API Category">
      {/* Panel header */}
      <div className="aegis-panel-head">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line-strong bg-canvas">
            <Tag className="h-4 w-4 text-forest" aria-hidden="true" />
          </span>
          <div>
            <p className="aegis-eyebrow">Classification / category</p>
            <p className="mt-1 font-display text-[15px] font-semibold text-ink">API Category</p>
          </div>
        </div>
        {isUserOverridden && (
          <Badge variant="emerald" size="xs">
            <Check className="h-3 w-3" aria-hidden="true" />
            User-confirmed
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="space-y-4 px-4 py-4 sm:px-5">

        {/* Low confidence warning */}
        {needsConfirmation && (
          <div
            className="flex items-start gap-2.5 border border-medium/30 bg-medium/5 px-3.5 py-3"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-medium" aria-hidden="true" />
            <p className="text-[12px] leading-relaxed text-muted">
              We could not confidently identify this API category.
              Please select the correct category using the dropdown below.
            </p>
          </div>
        )}

        {/* Detected category row */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl" role="img" aria-label={displayCategory}>
            {meta.emoji}
          </span>
          <div>
            <p
              className="font-display text-[15px] font-semibold text-ink"
              aria-live="polite"
            >
              {displayCategory}
            </p>
            <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              {isUserOverridden ? 'manually set' : result.detection_method.replace(/_/g, ' ')}
            </p>
          </div>
          {!isUnknown && (
            <Badge variant={meta.badgeVariant} size="xs" className="ml-auto shrink-0">
              {displayCategory}
            </Badge>
          )}
        </div>

        {/* Confidence */}
        {!isUserOverridden && !isUnknown && (
          <div>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              Confidence
            </p>
            {confidenceBar(result.confidence)}
          </div>
        )}

        {/* Reason */}
        {result.reason && !isUserOverridden && (
          <div className="border-l-2 border-l-info/50 bg-info/5 px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-info">
              <Info className="h-3 w-3" aria-hidden="true" />
              Detection basis
            </span>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{result.reason}</p>
          </div>
        )}

        {/* Manual correction dropdown */}
        <div>
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            {isUserOverridden ? 'Change category' : 'Correct category'}
          </p>
          <div className="relative inline-block w-full max-w-xs">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setDropdownOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              aria-label="Select API category"
              className="flex w-full items-center justify-between gap-2 border border-line bg-paper px-3 py-2 font-mono text-[11.5px] text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                {isSaving ? (
                  <>
                    <Spinner size="sm" label="" />
                    <span className="text-muted">Saving…</span>
                  </>
                ) : (
                  <>
                    <Cpu className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span>{displayCategory}</span>
                  </>
                )}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {dropdownOpen && (
              <ul
                role="listbox"
                aria-label="API categories"
                className="absolute z-50 mt-1 w-full border border-line bg-paper shadow-lg"
              >
                {allCategories.map((cat) => {
                  const catMeta = CATEGORY_META[cat] ?? CATEGORY_META['Unknown / Unclassified'];
                  const isActive = cat === displayCategory;
                  return (
                    <li key={cat} role="option" aria-selected={isActive}>
                      <button
                        type="button"
                        onClick={() => handleCorrection(cat)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left font-mono text-[11.5px] transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${isActive ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'}`}
                      >
                        <span aria-hidden="true">{catMeta.emoji}</span>
                        <span className="flex-1">{cat}</span>
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-forest" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
