import Image from "next/image";

/**
 * Branded full-screen loading state, shown while the app shell and its data
 * resolve (notably the sign-in → workspace hop, which used to flash a bare
 * header). The Canja wordmark breathes and a sliver of the accent sweeps a
 * track beneath it; both stop under prefers-reduced-motion.
 */
export function AppLoading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background">
      <div className="cnja-breathe">
        <Image
          src="/logo_assets/wordmark-color.png"
          alt="Canja"
          width={320}
          height={88}
          priority
          className="h-10 w-auto dark:hidden"
        />
        <Image
          src="/logo_assets/wordmark-white.png"
          alt="Canja"
          width={320}
          height={88}
          priority
          className="hidden h-10 w-auto dark:block"
        />
      </div>
      <div className="h-0.5 w-40 overflow-hidden rounded-full bg-muted">
        <div className="cnja-sweep h-full w-1/3 rounded-full bg-primary" />
      </div>
      <span className="sr-only">Loading…</span>
      <style>{`
        @keyframes cnjaBreathe { 0%,100% { opacity:.5; transform:scale(.99) } 50% { opacity:1; transform:scale(1) } }
        @keyframes cnjaSweep { 0% { transform:translateX(-120%) } 100% { transform:translateX(360%) } }
        .cnja-breathe { animation: cnjaBreathe 1.7s ease-in-out infinite; }
        .cnja-sweep { animation: cnjaSweep 1.25s cubic-bezier(0.4,0,0.2,1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cnja-breathe, .cnja-sweep { animation: none; }
          .cnja-breathe { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
