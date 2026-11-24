import { initials } from '../lib/format';

// Stable hue per person, from a small set that reads well on white.
const HUES = [222, 262, 168, 24, 338, 196, 140, 290];
const hueOf = (name: string) => HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  if (!name) return <span className="avatar empty" style={{ width: size, height: size }} title="Unassigned" aria-label="Unassigned" />;
  const h = hueOf(name);
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${h} 70% 94%)`, color: `hsl(${h} 55% 34%)` }}>
      {initials(name)}
    </span>
  );
}
