interface GradientOptions {
  steps?: number;
  angle?: number;
  from?: string;
  to?: string;
}

export const steppedGradient = (steps = 6, angle = 135, from = '#0a0a0a', to = '#1a1a1a') => {
  const stops = [];

  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 0;
    const start = (i / steps * 100).toFixed(2);
    const end   = ((i + 1) / steps * 100).toFixed(2);

    const color = lerpColor(from, to, t);
    stops.push(`${color} ${start}%`, `${color} ${end}%`);
  }

  return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
}

function lerpColor(from: string, to: string, t: number) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
