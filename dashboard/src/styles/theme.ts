export const theme = {
  colors: {
    bg: '#0F1117',
    panel: '#1A1D27',
    card: '#242837',
    cardHover: '#2E3347',
    border: '#2E3347',

    textPrimary: '#FFFFFF',
    textSecondary: '#8E8E93',
    textMuted: '#5E5E63',

    accent: '#276EF1',
    accentHover: '#3D82FF',
    accentGlow: 'rgba(39, 110, 241, 0.3)',

    green: '#05A357',
    amber: '#FF9500',
    red: '#E11900',

    greenGlow: 'rgba(5, 163, 87, 0.3)',
    amberGlow: 'rgba(255, 149, 0, 0.3)',
    redGlow: 'rgba(225, 25, 0, 0.3)',
  },

  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    full: '9999px',
  },

  glass: {
    background: 'rgba(26, 29, 39, 0.85)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },

  shadows: {
    panel: '0 8px 32px rgba(0, 0, 0, 0.4)',
    card: '0 4px 16px rgba(0, 0, 0, 0.3)',
    glow: (color: string) => `0 0 20px ${color}`,
  },

  transitions: {
    smooth: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  speedColors: {
    stopped: '#E11900',   // <2 km/h
    slow: '#FF9500',      // 2-20 km/h
    normal: '#05A357',    // 20-40 km/h
    fast: '#276EF1',      // >40 km/h
  },
} as const;

export type Theme = typeof theme;

export function getSpeedColor(speedKmh: number): string {
  if (speedKmh < 2) return theme.speedColors.stopped;
  if (speedKmh < 20) return theme.speedColors.slow;
  if (speedKmh < 40) return theme.speedColors.normal;
  return theme.speedColors.fast;
}
