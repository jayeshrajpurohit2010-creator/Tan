function Logo(): JSX.Element {
  return (
    <div className="flex items-center gap-0 select-none">
      <span className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400"
        style={{
          textShadow: '0 0 12px rgba(168,85,247,0.8), 0 0 32px rgba(168,85,247,0.4), 0 0 64px rgba(244,114,182,0.2)',
          fontFamily: "'Courier New', 'Courier', monospace",
          letterSpacing: '-0.02em',
        }}
      >
        <span className="text-fuchsia-300" style={{ textShadow: '0 0 8px rgba(244,114,182,0.9)' }}>)</span>{' '}
        <span className="text-purple-200">T</span>
        <span className="text-fuchsia-200">A</span>
        <span className="text-pink-200">N</span>
      </span>
      <span className="ml-3 text-[10px] uppercase tracking-[0.35em] text-cyan-300/60 font-mono">
        v1.0
      </span>
    </div>
  );
}

export default Logo;
