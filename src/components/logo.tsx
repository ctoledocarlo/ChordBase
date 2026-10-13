/** The ChordBase mark: the same picture as the browser-tab icon (src/app/icon.svg). */
export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`flex-none ${className}`}>
      <rect width="64" height="64" rx="14" fill="#0c0c0e" />
      <rect x="14" y="13" width="22" height="13" rx="6.5" fill="#60a5fa" />
      <rect x="14" y="35" width="36" height="6" rx="3" fill="#ffffff" />
      <rect x="14" y="47" width="24" height="6" rx="3" fill="#ffffff" opacity="0.4" />
    </svg>
  );
}

/** The mark followed by the name. Text takes its colour and size from where it is placed. */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <LogoMark size={size} />
      ChordBase
    </span>
  );
}
