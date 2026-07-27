"use client";

// Íconos de medios de pago — SVG propios, self-contained (sin dependencias ni assets
// externos), estilo "detallado y de color" para el cobro del POS:
//   Efectivo    → billete verde
//   Débito      → tarjeta azul
//   Crédito     → tarjeta violeta
//   MercadoPago → isologo (apretón de manos) de Mercado Pago en su celeste de marca

export function IconoEfectivo({ size = 22, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="7" width="28" height="18" rx="3.5" fill="#27ae60" />
      <rect x="4.6" y="9.6" width="22.8" height="12.8" rx="2" fill="none" stroke="#a7f3d0" strokeWidth="1.1" opacity="0.6" />
      <circle cx="16" cy="16" r="4.7" fill="#ffffff" />
      <path
        d="M16 12.6v6.8M14.1 13.9c0-.9.8-1.5 1.9-1.5s1.9.5 1.9 1.4c0 1-.9 1.3-1.9 1.6s-1.9.6-1.9 1.7c0 .9.8 1.4 1.9 1.4s1.9-.6 1.9-1.5"
        stroke="#1e874b" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoTarjeta({ size = 22, className = "", base, stripe }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="6.5" width="28" height="19" rx="3.2" fill={base} />
      <rect x="2" y="10.8" width="28" height="4.4" fill={stripe} />
      <rect x="5.6" y="18.4" width="6.8" height="4.9" rx="1.1" fill="#fcd34d" />
      <path d="M20.6 17.8c1.7 1.5 1.7 5.1 0 6.6" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity="0.95" />
      <path d="M23.2 16.2c2.7 2.3 2.7 7.7 0 10" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function IconoDebito(props) {
  return <IconoTarjeta {...props} base="#2f80ed" stripe="#1b4fa8" />;
}

export function IconoCredito(props) {
  return <IconoTarjeta {...props} base="#8b5cf6" stripe="#5b21b6" />;
}

export function IconoMercadoPago({ size = 22, className = "" }) {
  // Logo OFICIAL de Mercado Pago servido como asset (public/logos/mercado-pago.png).
  // Es un óvalo (más ancho que alto): fijamos la ALTURA y dejamos el ancho automático
  // para no deformarlo. Para actualizarlo, basta reemplazar ese archivo.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/mercado-pago.png"
      alt="Mercado Pago"
      draggable={false}
      style={{ height: size, width: "auto" }}
      className={className}
    />
  );
}

// Mapa medio → componente de ícono (fuente única, usada por cobro simple y Dividir pago).
export const ICONO_POR_MEDIO = {
  efectivo: IconoEfectivo,
  debito: IconoDebito,
  credito: IconoCredito,
  mercadopago: IconoMercadoPago,
};

export function IconoMedio({ medio, size = 22, className = "" }) {
  const Comp = ICONO_POR_MEDIO[medio];
  if (!Comp) return null;
  return <Comp size={size} className={`shrink-0 ${className}`} />;
}
