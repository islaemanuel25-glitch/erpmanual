// LA RECETA QUE NO NOMBRA LA PERCEPCIÓN QUE EL PAPEL TRAE.
//
// ── EL CASO (OLIMAR, 2026-11-02) ──────────────────────────────────────────
//
// El remito trae «(Percepciones = 34839.57)» al pie. Desde esta tanda la
// percepción se reparte sola en el costo (`repartirLoDelPieQueFalta`) aunque
// el lector no lo haya hecho, así que el papel CIERRA con Flash, no escala al
// modelo grande, y el modelo grande era el único que dejaba una receta
// propuesta. La receta confirmada del proveedor seguiría sin nombrar la
// percepción para siempre, y la próxima lectura dependería otra vez de que el
// sistema la arregle.
//
// Lo previsto para la primera boleta de cada proveedor es que quede una receta
// PROPUESTA y una persona la confirme en Recetas de facturas
// (`RecetaPropuestaProveedor`, «Está bien, guardar»). Se hace lo mismo: cuando
// el sistema tuvo que repartir algo del pie y la receta confirmada de ese tipo
// de papel no lo nombra, se propone la confirmada con una frase más. Nunca se
// pisa la confirmada: la confirmación sigue siendo de una persona.
//
// La frase dice "cuando viene impresa", no "siempre": una percepción puede
// depender del importe (`percepcionQueDependeDelImporte.test.mjs`).

import { esPercepcionOImpuesto } from "./lector/lecturaInterpretada.js";
import { explicacionesConfirmadas, explicacionDelTipo, tipoDePapel } from "./explicacionPorTipo.js";

/**
 * La explicación confirmada con la frase de lo que el sistema repartió, o null
 * si no hace falta: sin confirmada no hay qué ajustar —la arma el modelo
 * grande, como en cualquier primera boleta—, y si ya nombra la percepción ya
 * dice lo que tiene que decir.
 *
 * @param confirmada  el texto de la explicación confirmada de ese tipo de papel
 * @param conceptos   los nombres de lo que se repartió, como estaban impresos
 */
export function explicacionConLoDelPie(confirmada, conceptos = []) {
  const texto = String(confirmada ?? "").trim();
  if (!texto) return null;
  const nombres = (Array.isArray(conceptos) ? conceptos : []).map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!nombres.length) return null;
  if (esPercepcionOImpuesto(texto)) return null;
  const cuales = nombres.map((n) => `«${n}»`).join(", ");
  return (
    `${texto.replace(/[.\s]+$/, "")}. ` +
    `Al pie, antes del total, puede venir ${cuales} —a veces entre paréntesis o en un renglón suelto—: ` +
    `cuando viene impreso se suma, repartido en el costo de los productos en proporción a su importe.`
  );
}

/**
 * Deja propuesta la receta ajustada, si corresponde. Best-effort: quien llama
 * ya guardó lo importante —los costos y el estado— y una propuesta que no se
 * pudo dejar la vuelve a armar el próximo papel.
 *
 * @param db       cliente de Prisma
 * @param papel    `{ id, grupoId, proveedorId, recetaUsada, modeloLectura }`
 * @param tipo     el tipo de papel con el que se leyó; sin tipo no hay receta
 * @param conceptos lo que se repartió
 * @param lectura  la lectura que cerró, para "Así lo entendió"
 * @returns la explicación propuesta, o null
 */
export async function proponerRecetaConLoDelPie(db, { papel, tipo, conceptos, lectura }) {
  if (!papel?.grupoId || !papel?.proveedorId || !tipo) return null;
  const tipoComprobante = tipoDePapel(tipo);
  const filas = await db.explicacionPorTipo.findMany({
    where: { grupoId: papel.grupoId, proveedorId: papel.proveedorId },
    select: { tipoComprobante: true, explicacion: true, version: true },
  });
  const confirmada = explicacionDelTipo(explicacionesConfirmadas(filas), tipoComprobante);
  const explicacion = explicacionConLoDelPie(confirmada?.explicacion, conceptos);
  if (!explicacion) return null;
  const propuesta = {
    respuestas: { explicacion },
    lectura: lectura ?? {},
    comprobanteId: papel.id ?? null,
    modelo: papel.modeloLectura ?? "",
    creadaEn: new Date(),
  };
  // Una propuesta que ya espera confirmación para ese tipo no se pisa: la armó
  // el modelo grande mirando el papel entero, y ésta es solo una frase más.
  const clave = { grupoId: papel.grupoId, proveedorId: papel.proveedorId, tipoComprobante };
  const yaHay = await db.recetaPropuestaProveedor.findUnique({
    where: { grupoId_proveedorId_tipoComprobante: clave },
    select: { id: true },
  });
  if (yaHay) return null;
  await db.recetaPropuestaProveedor.create({ data: { ...clave, ...propuesta } });
  return explicacion;
}
