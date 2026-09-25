import React from 'react';

/** 24x24 line icons for the risk cards. Drawn in code, no external assets. */
export const RiskIcon: React.FC<{name: string; size?: number; color?: string}> = ({name, size = 28, color = 'currentColor'}) => {
  const common = {fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  let body: React.ReactNode;
  switch (name) {
    case 'soil':
      body = (<><path d="M3 8c4-3 8 3 12 0s6 0 6 0" /><path d="M3 13c4-3 8 3 12 0s6 0 6 0" /><path d="M3 18c4-3 8 3 12 0s6 0 6 0" /></>);
      break;
    case 'haul':
      body = (<><path d="M2 16h12V8H2z" /><path d="M14 11h4l3 3v2h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>);
      break;
    case 'cutfill':
      body = (<><path d="M2 18h20" /><path d="M2 14l5-6 4 4 5-8 6 10" strokeDasharray="0" /><path d="M2 18l5-4 4 2 5-3 6 5" /></>);
      break;
    case 'water':
      body = (<><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" /><path d="M3 21c3-2 6 2 9 0s6 2 9 0" /></>);
      break;
    case 'rock':
      body = (<><path d="M4 19l3-9 5-4 6 2 3 7-3 4H6z" /><path d="M7 10l5 3 6-2" /></>);
      break;
    case 'storm':
      body = (<><path d="M4 12a8 8 0 0 1 16 0" /><path d="M2 12h20" /><path d="M6 12v6M12 12v8M18 12v6" /><path d="M4 21h16" /></>);
      break;
    case 'utility':
      body = (<><path d="M3 6h8v6H3z" /><path d="M11 9h4v4" /><path d="M13 13h8v6h-8z" /><path d="M7 12v9" /></>);
      break;
    case 'road':
      body = (<><path d="M4 21L9 3h6l5 18" /><path d="M12 6v3M12 12v3M12 18v3" /><path d="M16 12h5" /></>);
      break;
    default:
      body = <circle cx="12" cy="12" r="8" />;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{display: 'block'}} {...common}>
      {body}
    </svg>
  );
};

export const Check: React.FC<{size?: number; color?: string}> = ({size = 18, color = 'currentColor'}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}>
    <path d="M4 12.5l5 5L20 7" />
  </svg>
);
