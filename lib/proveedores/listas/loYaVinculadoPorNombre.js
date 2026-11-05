// lib/proveedores/listas/loYaVinculadoPorNombre.js
//
// UNA LISTA YA SUBIDA ALCANZA SOLA LO QUE YA SE VINCULÓ POR SU NOMBRE.
//
// ── EL CASO (Mauro, 2026-11-05) ─────────────────────────────────────────────
//
// La lista de Mauro se subió cuando la conciliación de listas buscaba solo por
// código. Los productos ya estaban vinculados en sus remitos por la descripción,
// pero la lista no los vio: todas las tarjetas decían "no está" y los renglones
// quedaron "Sin producto en tu catálogo". Desde esta tanda el motor los
// encuentra (`vincularFilaConCatalogo`, escalón 3), pero solo al conciliar, y la
// lista ya está conciliada. Emanuel no tiene que volver a subirla.
//
// ── POR QUÉ NO ES `reconciliarImportacion` ─────────────────────────────────
//
// Porque ésa BORRA y reescribe todas las filas: perdería lo que una persona ya
// hizo en esta lista —excluir, confirmar una lectura, vincular a mano—, y por eso
// sus dos rutas la llaman solo a pedido y sin nada aplicado. Esto corre solo al
// abrir, así que no puede tocar nada que alguien decidió. Toca ÚNICAMENTE los
// renglones que siguen SIN producto, sin aplicar y sin excluir, y de esos
// únicamente los que el motor ate a un producto por un alias ya guardado.
//
// ── NO ESCRIBE NINGÚN COSTO ────────────────────────────────────────────────
//
// Escribe el veredicto del motor en la FILA de la lista —a qué producto
// corresponde y qué costo propone—, el mismo que habría dejado la
// conciliación. El costo del producto lo sigue escribiendo solo `aplicar`.
//
// ── CUANDO NO HAY NADA QUE HACER, NO CARGA NADA ────────────────────────────
//
// Se llama en cada apertura. Antes de cargar el catálogo se compara el texto de
// los renglones sin producto contra las descripciones ya vinculadas del
// proveedor: si ninguno coincide, se vuelve sin más.

import { normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";
import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra, TIPO_COINCIDENCIA } from "./conciliarLista.js";
import { cargarDatosDeConciliacion } from "./cargaErp.js";
import { esImportacionAbierta } from "./persistencia.js";
import { resolverParserPorId } from "./registro.js";
import { filaParaElMotor, motorParaEstaLista } from "./vincularConUnaFila.js";
import { datosDeLaFilaVinculada } from "./vincularFilaSinProducto.js";
import { recalcularContadores } from "./contadores.js";
import { intentarRecalcularPuedenSer } from "./puedenSer.js";

/** Los renglones que esto puede tocar: sin producto, sin aplicar, sin excluir, sin decisión de nadie. */
export function filasLibresWhere(importacionId) {
  return {
    importacionId,
    productoBaseId: null,
    aplicada: false,
    excluidaManual: false,
    vinculadoPorUsuarioId: null,
  };
}

/** Los textos de un renglón que el motor compara contra un alias. Ver `vincularFilaConCatalogo`. */
export function textosDelRenglon(fila) {
  return [fila?.descripcionProveedor, fila?.codigoCrudo].map((t) => normalizarTexto(t ?? "")).filter(Boolean);
}

/**
 * ¿Algún renglón libre trae un texto ya vinculado? Puro: decide si vale la pena
 * cargar el catálogo.
 */
export function hayAlgoQueAlcanzar(filas = [], vinculos = []) {
  const descripciones = new Set(
    vinculos
      .filter((v) => v?.activo !== false)
      .map((v) => normalizarTexto(v?.descripcionProveedor ?? ""))
      .filter(Boolean)
  );
  if (descripciones.size === 0) return false;
  return filas.some((f) => textosDelRenglon(f).some((t) => descripciones.has(t)));
}

/** Lo que el motor necesita de la cabecera. Lo pide esta función: quien llama pasa el id. */
const CAMPOS_CABECERA = Object.freeze({
  id: true,
  estado: true,
  proveedorId: true,
  parser: true,
  recargoPct: true,
  impuestoAdicionalPct: true,
  aumentoEsperadoMinPct: true,
  aumentoEsperadoMaxPct: true,
  modo: true,
  localOperativoId: true,
});

/**
 * Ata a su producto los renglones libres de una lista abierta que el motor
 * encuentra por un nombre ya vinculado.
 *
 * @param db              cliente de Prisma
 * @param importacionId   la lista; quien llama ya comprobó que la puede ver
 * @returns `{ vinculadas }`
 */
export async function alcanzarLoYaVinculadoPorNombre(db, { importacionId, grupoId, depositoLocalId = null }) {
  const cab = await db.importacionListaProveedor.findFirst({
    where: { id: importacionId, grupoId },
    select: CAMPOS_CABECERA,
  });
  if (!cab?.id || !cab?.proveedorId || !esImportacionAbierta(cab.estado)) return { vinculadas: 0 };

  const libres = await db.importacionListaFila.findMany({ where: filasLibresWhere(cab.id) });
  if (libres.length === 0) return { vinculadas: 0 };

  const vinculos = await db.productoCodigoProveedor.findMany({
    where: { grupoId, proveedorId: cab.proveedorId, activo: true, descripcionProveedor: { not: null } },
    select: { descripcionProveedor: true, activo: true },
  });
  if (!hayAlgoQueAlcanzar(libres, vinculos)) return { vinculadas: 0 };

  const reg = resolverParserPorId(cab.parser);
  if (!reg.ok) return { vinculadas: 0 };

  // El universo y los vínculos de la ubicación donde se subió la lista, como la
  // conciliación (`reconciliarImportacion`).
  const { codigosProveedor, productos, lecturasRecordadas, productosQueNoSeCambian } =
    await cargarDatosDeConciliacion({ grupoId, proveedorId: cab.proveedorId, localId: cab.localOperativoId }, db);
  const { config, contexto } = motorParaEstaLista({
    cab,
    reg,
    grupoId,
    operandoEnLocalId: cab.localOperativoId,
    depositoLocalId,
  });
  const indice = indexarCodigosProveedor(codigosProveedor);
  const indiceBarra = indexarCodigosBarra(productos);
  const productosPorId = new Map(productos.map((p) => [p.productoBaseId, p]));
  const ahora = new Date();

  const aEscribir = [];
  for (const fila of libres) {
    const r = conciliarFila({
      fila: filaParaElMotor(fila, { vinculadoEn: null }),
      indice,
      indiceBarra,
      productosPorId,
      contexto: { ...contexto, lecturasRecordadas, productosQueNoSeCambian },
      config,
    });
    // Solo lo que este escalón encontró. Cualquier otro veredicto ya lo tenía
    // la fila desde que se concilió, y no hay por qué reescribirlo.
    if (r.tipoCoincidencia !== TIPO_COINCIDENCIA.ALIAS_CONFIRMADO || !r.producto) continue;
    aEscribir.push({ id: fila.id, datos: datosDeLaFilaVinculada(r, { ahora }) });
  }
  if (aEscribir.length === 0) return { vinculadas: 0 };

  let vinculadas = 0;
  await db.$transaction(async (tx) => {
    for (const { id, datos } of aEscribir) {
      // Con la condición de libre en el `where`: si alguien la vinculó o la
      // excluyó mientras tanto, no se pisa.
      const r = await tx.importacionListaFila.updateMany({
        where: { id, ...filasLibresWhere(cab.id) },
        data: datos,
      });
      vinculadas += r.count;
    }
    await recalcularContadores(tx, cab.id);
  });
  // Atar renglones cambia cuáles quedan libres para "Pueden ser de…".
  if (vinculadas > 0) await intentarRecalcularPuedenSer(db, { grupoId, importacionId: cab.id });
  return { vinculadas };
}
