// lib/compras-proveedor/comprobante/envase.js
//
// LOS RENGLONES DE ENVASE: CUENTAN PARA EL TOTAL Y NADA MÁS.
//
// ── EL CASO (Secco #256, 2026-10-10) ──────────────────────────────────────
//
// "BOTELLA SECCO 3000 CAMBIO · 6 × 0,025 = 0,15" y "BOTELLA SECCO COLA S/CARGO
// 3 LT · 18 × 0,024 = 0,44". Son las botellas retornables: el proveedor las
// factura a un precio simbólico para que figuren en el papel. No son
// mercadería que se venda, así que no tienen producto en el catálogo.
//
// Regla de Emanuel: cuentan para el total del papel —están impresas y suman—,
// pero NO piden producto, NO entran al stock y NO tocan ningún costo. La
// pantalla las muestra aparte, como envases.
//
// ── CÓMO SE RECONOCEN ──────────────────────────────────────────────────────
//
// Por el precio unitario: menos de un peso. No por el texto —"BOTELLA",
// "ENVASE", "CAJÓN" cambian de proveedor en proveedor y una botella de vino es
// mercadería—, sino por lo que las hace envase: un cargo simbólico. Ningún
// producto que se compra para vender cuesta menos de un peso la unidad.
//
// Un precio de cero no es envase: es un renglón sin cargo o bonificado, que sí
// es mercadería.
//
// En la lectura interpretada no se aplica la regla del precio: lo dice el
// modelo en el tipo del renglón. Queda para una lectura de antes, que no lo
// trae: ésa no propone costos, pero un envase igual no pide producto ni entra
// al stock.
//
// Módulo puro: sin React y sin Prisma.

import { num } from "./lector/contrato.js";

/** Debajo de este precio unitario, el renglón es un cargo simbólico de envase. */
export const PRECIO_UNITARIO_MAXIMO_DE_ENVASE = 1;

/**
 * ¿ESTE RENGLÓN ES UN ENVASE?
 *
 * El precio impreso manda; sin él, el que se despeja del importe y la cantidad.
 * Sin ninguno de los dos no se sabe, y no se supone: es mercadería.
 *
 * @param linea  el renglón leído, guardado o ya analizado: `{ cantidad,
 *               netoUnitario, subtotalImpreso }`
 */
export function esRenglonDeEnvase(linea) {
  // ── EN LA LECTURA INTERPRETADA LO DICE EL MODELO ──────────────────────
  //
  // Leyó el papel entero y dijo qué es cada renglón (`TIPO_RENGLON`). Su
  // respuesta manda; la regla del precio queda para las lecturas de antes, que
  // no la traen.
  const tipo = linea?.tipoRenglon ?? linea?.tipo ?? null;
  if (tipo === "ENVASE") return true;
  if (tipo === "MERCADERIA") return false;
  const impreso = num(linea?.netoUnitario);
  const cantidad = num(linea?.cantidad);
  const importe = num(linea?.subtotalImpreso);
  const precio =
    impreso !== null
      ? impreso
      : importe !== null && cantidad !== null && cantidad > 0
        ? importe / cantidad
        : null;
  return precio !== null && precio > 0 && precio < PRECIO_UNITARIO_MAXIMO_DE_ENVASE;
}
