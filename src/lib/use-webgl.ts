'use client';

import { useEffect, useState } from 'react';

/**
 * Detects whether WebGL2 (or WebGL1 fallback) is available in the
 * current browser. Returns:
 *   - `null` until first render (SSR-safe — never reports false on the server)
 *   - `true`  if a WebGL context can be created
 *   - `false` if not (mobile Safari Reader Mode, locked-down kiosks,
 *             or WebGL-disabled browsers)
 *
 * Pages that render `reagraph` or other WebGL surfaces should branch on
 * this to render a 2D / textual fallback for users who can't load the
 * GPU view. Saves bundle size too — the WebGL-heavy chunk only loads
 * when the user can actually use it.
 *
 * Phase 1 (resolves the MOBILE flag in STATUS.md §5 for /app/mindmap
 * and /app/fingerprint).
 */
export function useWebGL(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
      setAvailable(Boolean(gl));
      // Releasing the canvas reference is enough — no explicit GL teardown needed
      // since we never rendered anything, just probed the context creation.
    } catch {
      setAvailable(false);
    } finally {
      canvas = null;
    }
  }, []);

  return available;
}
