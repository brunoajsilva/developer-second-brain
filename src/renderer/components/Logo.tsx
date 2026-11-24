/** Brand mark: a dark tile, a ring with a node, and the cobalt "link" dot at the centre. */
export function Logo({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: 'none' }}>
      <rect width="512" height="512" rx="128" fill="#14161B" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#3A3F4B" strokeWidth="20" />
      <circle cx="256" cy="256" r="74" fill="#2D4BF0" />
      <circle cx="362" cy="150" r="30" fill="#E6FF7A" />
    </svg>
  );
}
