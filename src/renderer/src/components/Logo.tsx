import tanLogoSrc from '../assets/tan-logo.jpeg';

interface LogoProps {
  compact?: boolean;
}

function Logo({ compact = false }: LogoProps): JSX.Element {
  if (compact) {
    return (
      <div className="flex items-center gap-3 select-none">
        <div className="logo-img-frame h-8 w-8 shrink-0 overflow-hidden">
          <img src={tanLogoSrc} alt="TAN" className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-col">
          <span
            className="font-mono text-sm font-black leading-none tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #e879f9 0%, #a855f7 45%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.8))',
            }}
          >
            ) TAN
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-cyan-300/50">
            Forensic Archival Suite
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* Logo image + wordmark */}
      <div className="flex items-center gap-3">
        <div className="logo-img-frame h-12 w-12 shrink-0 overflow-hidden">
          <img src={tanLogoSrc} alt="TAN logo" className="h-full w-full object-cover" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono text-3xl font-black tracking-tight leading-none"
              style={{
                background: 'linear-gradient(135deg, #e879f9 0%, #a855f7 42%, #f472b6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter:
                  'drop-shadow(0 0 8px rgba(168,85,247,0.9)) drop-shadow(0 0 22px rgba(168,85,247,0.4)) drop-shadow(0 0 40px rgba(244,114,182,0.25))',
              }}
            >
              <span style={{ filter: 'drop-shadow(0 0 10px rgba(244,114,182,1))' }}>)</span>
              {' '}TAN
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.38em] text-cyan-300/50 pb-1">
              v1.0
            </span>
          </div>
        </div>
      </div>

      {/* Subtitle rule */}
      <div className="flex items-center gap-2 pl-[60px]">
        <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/50 via-purple-400/25 to-transparent" />
        <span className="font-mono text-[9px] uppercase tracking-[0.36em] text-fuchsia-300/45">
          Forensic Archival Suite
        </span>
      </div>
    </div>
  );
}

export default Logo;
