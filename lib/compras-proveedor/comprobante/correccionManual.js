// lib/compras-proveedor/comprobante/correccionManual.js
//
// LO QUE ALGUIEN PUSO A MANO EN UN RENGLÓN DEL PAPEL, DICHO PARA LA SEGUNDA
// REVISIÓN.
//
// Secco #256 (2026-10-10): un papel que no cierra se arregla poniendo a mano lo
// que dice la foto en un renglón —cantidad, precio, importe—. Lo que se puso
// reemplaza a lo que leyó el lector, y quien revisa después tiene que poder
// leerlo en una línea: qué renglón, qué cambió de qué a qué, quién y cuándo.
// La fila sale de `CorreccionManualRenglon`, con el nombre de quien la hizo.
//
// Módulo puro: sin React y sin Prisma.

import { formatearMoneda } from "@/lib/moneda";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";

const CAMPOS = Object.freeze([
  ["cantidad", "cantidad", (v) => String(Number(v)).replace(".", ",")],
  ["netoUnitario", "precio", (v) => formatearMoneda(v)],
  ["subtotal", "total", (v) => formatearMoneda(v)],
  // En la lectura interpretada se corrige el costo final del renglón.
  ["costoFinal", "costo final", (v) => formatearMoneda(v)],
]);

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * "SECCO COLA 3 LTS X 6 U. · total $93.961,90 → $94.000,00 · Ana, 10/10 12:30"
 *
 * Solo nombra lo que cambió. Un campo que se puso igual a lo leído no se dice:
 * no es una corrección.
 */
export function textoDeLaCorreccionManual(c) {
  const leido = c?.leido ?? {};
  const puesto = c?.puesto ?? {};
  const cambios = CAMPOS.filter(([campo]) => num(puesto[campo]) !== null && num(puesto[campo]) !== num(leido[campo])).map(
    ([campo, nombre, formato]) =>
      `${nombre} ${num(leido[campo]) === null ? "—" : formato(leido[campo])} → ${formato(puesto[campo])}`
  );
  const quien = c?.quien ? `${c.quien}, ` : "";
  const cuando = c?.creadaEn ? `${diaMesAR(c.creadaEn)} ${horaAR(c.creadaEn)}` : "";
  return [c?.textoCrudo ?? `Renglón ${c?.orden ?? "—"}`, cambios.join(", ") || "sin cambios", `${quien}${cuando}`.trim()]
    .filter(Boolean)
    .join(" · ");
}
