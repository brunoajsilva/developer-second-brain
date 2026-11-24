/** Marca: quadrado preto, ponto terracota (o mesmo do estado "Em curso") e um anel com um nó. */
export function Logo({ tamanho = 36, titulo }: { tamanho?: number; titulo?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 512 512" role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true} style={{ flex: 'none' }}>
      <rect width="512" height="512" rx="116" fill="#141414" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#3A3A3A" strokeWidth="18" />
      <circle cx="256" cy="256" r="74" fill="#E5683C" />
      <circle cx="362" cy="150" r="30" fill="#EFEEEC" />
    </svg>
  );
}
