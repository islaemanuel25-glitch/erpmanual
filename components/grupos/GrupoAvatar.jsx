"use client";

const COLOR_VARIANTS = [
  { bg: "bg-amber-500/15", text: "text-amber-300", ring: "ring-amber-500/30" },
  { bg: "bg-cyan-500/15", text: "text-cyan-300", ring: "ring-cyan-500/30" },
  { bg: "bg-violet-500/15", text: "text-violet-300", ring: "ring-violet-500/30" },
  { bg: "bg-rose-500/15", text: "text-rose-300", ring: "ring-rose-500/30" },
  { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/30" },
  { bg: "bg-blue-500/15", text: "text-blue-300", ring: "ring-blue-500/30" },
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function calcularIniciales(nombre) {
  const limpio = String(nombre || "").trim();
  if (!limpio) return "?";
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

export default function GrupoAvatar({ nombre, size = 40, className = "" }) {
  const variant =
    COLOR_VARIANTS[hashString(String(nombre || "")) % COLOR_VARIANTS.length];
  const iniciales = calcularIniciales(nombre);
  const fontSize = Math.max(11, Math.round(size * 0.38));

  return (
    <div
      className={`shrink-0 rounded-md flex items-center justify-center font-bold ring-1 ${variant.bg} ${variant.text} ${variant.ring} ${className}`}
      style={{ width: size, height: size, fontSize }}
      aria-hidden="true"
    >
      {iniciales}
    </div>
  );
}
