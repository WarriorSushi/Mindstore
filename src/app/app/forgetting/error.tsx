'use client';

export default function ForgettingError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-[18px] font-semibold text-zinc-200">Couldn&apos;t load forgetting list</h1>
      <p className="mt-2 text-[13px] text-zinc-500">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02]
          text-[13px] text-zinc-300 hover:bg-white/[0.04] transition-all"
      >
        Try again
      </button>
    </div>
  );
}
