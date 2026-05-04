'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Loader2, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/lib/use-page-title';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';

interface Risk {
  id: string;
  riskType: 'secret' | 'spof' | 'silo' | 'gap' | 'pii';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedMemoryIds: string[];
  detectedAt: string;
}

const SEVERITY_TONE: Record<Risk['severity'], string> = {
  critical: 'text-rose-300 bg-rose-500/[0.08] border-rose-500/30',
  high:     'text-amber-300 bg-amber-500/[0.08] border-amber-500/30',
  medium:   'text-sky-300 bg-sky-500/[0.08] border-sky-500/20',
  low:      'text-zinc-300 bg-white/[0.04] border-white/[0.08]',
};

const TYPE_LABEL: Record<Risk['riskType'], string> = {
  secret: 'Exposed secret',
  pii:    'PII',
  spof:   'Single point of failure',
  silo:   'Source silo',
  gap:    'Coverage gap',
};

export default function SecurityPage() {
  usePageTitle('Knowledge Security');

  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch('/api/v1/risks');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setRisks(data.risks ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load risks';
      setError(msg);
      toast.error('Could not load risks', { description: msg });
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const rescan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/v1/risks', { method: 'POST' });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      await load();
      toast.success('Scan complete');
    } catch (e) {
      toast.error('Scan failed', { description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setScanning(false);
    }
  };

  const dismiss = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/risks/${id}/dismiss`, { method: 'POST' });
      if (!res.ok) throw new Error(`Dismiss failed (${res.status})`);
      setRisks((prev) => (prev ?? []).filter((r) => r.id !== id));
    } catch (e) {
      toast.error('Could not dismiss', { description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Stagger>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">Knowledge Security</h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                Findings from a regex-based audit of your memories — exposed secrets, PII,
                single points of failure, source silos.
              </p>
            </div>
            <button
              onClick={rescan}
              disabled={scanning}
              className="h-9 px-3 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02]
                hover:bg-white/[0.04] transition-all active:scale-[0.95] shrink-0 disabled:opacity-40"
              title="Rescan"
              aria-label="Rescan knowledge for risks"
            >
              <RotateCw className={`w-4 h-4 text-zinc-400 ${scanning ? 'animate-spin' : ''}`} />
              <span className="text-[12px] text-zinc-400">{scanning ? 'Scanning…' : 'Rescan'}</span>
            </button>
          </div>
        </Stagger>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-6 text-[13px] text-rose-200">{error}</div>
        )}

        {!loading && !error && risks?.length === 0 && (
          <EmptyFeatureState
            icon={ShieldAlert}
            title="No risks surfaced"
            description="Either your knowledge base is clean, or it doesn't have enough material yet for the silo/SPoF detectors. Rescan after future imports to refresh."
            ctaText="Open import →"
            ctaHref="/app/import"
          />
        )}

        {!loading && !error && risks && risks.length > 0 && (
          <Stagger>
            {risks.map((r) => (
              <article key={r.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${SEVERITY_TONE[r.severity]}`}>
                        {r.severity}
                      </span>
                      <span className="text-[11px] text-zinc-500">{TYPE_LABEL[r.riskType]}</span>
                    </div>
                    <p className="text-[13px] text-zinc-300 leading-relaxed">{r.description}</p>
                    {r.affectedMemoryIds.length > 0 && (
                      <p className="text-[11px] text-zinc-600 mt-2">
                        {r.affectedMemoryIds.length} affected memor{r.affectedMemoryIds.length === 1 ? 'y' : 'ies'}.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(r.id)}
                    className="h-8 w-8 rounded-lg border border-white/[0.06] bg-white/[0.02]
                      flex items-center justify-center hover:bg-white/[0.04] transition-all
                      active:scale-[0.95] shrink-0"
                    title="Dismiss"
                    aria-label="Dismiss this risk"
                  >
                    <X className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>
              </article>
            ))}
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
