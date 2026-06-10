function Logo(): JSX.Element {
  return (
    <div className="flex flex-col gap-1 select-none">
      {/* Primary wordmark */}
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-4xl font-black tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #e879f9 0%, #a855f7 40%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: 'none',
            filter:
              'drop-shadow(0 0 6px rgba(168,85,247,0.9)) drop-shadow(0 0 18px rgba(168,85,247,0.5)) drop-shadow(0 0 40px rgba(244,114,182,0.3))',
          }}
        >
          <span style={{ filter: 'drop-shadow(0 0 8px rgba(244,114,182,0.95))' }}>)</span>
          {' '}TAN
        </span>

        <span className="font-mono text-[9px] uppercase tracking-[0.38em] text-cyan-300/55 leading-none pb-1">
          v1.0
        </span>
      </div>

      {/* Subtitle rule */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/60 via-purple-400/30 to-transparent" />
        <span className="font-mono text-[9px] uppercase tracking-[0.36em] text-fuchsia-300/50">
          Forensic Archival Suite
        </span>
      </div>
    </div>
  );
}

export default Logo;
