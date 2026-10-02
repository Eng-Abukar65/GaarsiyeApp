import React, { useState } from 'react';

/**
 * BrandLogo — the Gaarsis App brand mark used across the authentication pages
 * (Login, Register and the password-reset flows).
 *
 * It first tries to render a real logo image from `/logo.png` (drop your file
 * at `vendor/public/logo.png` to use it). If that file is missing or fails to
 * load, it falls back to a built-in vector placeholder so the pages always
 * look complete and the artwork can be swapped in later without code changes.
 *
 * Props:
 *   size      'sm' | 'md' | 'lg'   — mark size + typography scale (default 'md')
 *   showName  boolean              — render the "Gaarsis / App" wordmark below
 *   src       string               — override the logo image path
 *   className string               — extra classes on the wrapper
 */
const SIZES = {
  sm: { box: 56, name: 'text-lg', tag: 'text-[9px]', gap: 'mt-2.5', rule: 'w-3' },
  md: { box: 72, name: 'text-2xl', tag: 'text-[10px]', gap: 'mt-3', rule: 'w-4' },
  lg: { box: 88, name: 'text-3xl', tag: 'text-[11px]', gap: 'mt-4', rule: 'w-5' },
};

const PlaceholderMark = ({ px }) => (
  // Rounded app-icon style "G" mark in the brand blue gradient. Purely vector,
  // so it renders anywhere and needs no asset file.
  <div
    className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#38BDF8] shadow-lg shadow-primary/30 ring-1 ring-white/20"
    style={{ width: px, height: px }}
    aria-hidden="true"
  >
    <span
      className="font-headline font-black leading-none text-white"
      style={{ fontSize: Math.round(px * 0.52) }}
    >
      G
    </span>
  </div>
);

const BrandLogo = ({ size = 'md', showName = true, src = '/logo.png', className = '' }) => {
  const s = SIZES[size] || SIZES.md;
  const [imgOk, setImgOk] = useState(true);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {imgOk ? (
        <img
          src={src}
          alt="Gaarsis App"
          onError={() => setImgOk(false)}
          className="object-contain rounded-2xl"
          style={{ width: s.box, height: s.box }}
        />
      ) : (
        <PlaceholderMark px={s.box} />
      )}

      {showName && (
        <div className={`text-center ${s.gap}`}>
          <div className={`font-headline font-extrabold tracking-tight text-on-surface ${s.name}`}>
            Gaarsis
          </div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className={`h-px bg-primary/40 ${s.rule}`} />
            <span className={`font-bold uppercase tracking-[0.28em] text-primary ${s.tag}`}>
              App
            </span>
            <span className={`h-px bg-primary/40 ${s.rule}`} />
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandLogo;
