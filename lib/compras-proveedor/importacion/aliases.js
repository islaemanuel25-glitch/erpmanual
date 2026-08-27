// LAS DECISIONES DE PRODUCTO DE UNA IMPORTACIÓN, EN LA FORMA COMPARTIDA.
//
// ── POR QUÉ YA NO USA `aliasAEscribir` ─────────────────────────────────────
//
// Aquella función tenía `origenAlta: "VINCULACION_MANUAL"` escrito adentro, así
// que TODA línea guardaba su alias como si una persona lo hubiera elegido —
// incluidas las que el motor vinculó solo por terminación de código, que son
// justamente las que hay que poder revocar el día que salgan mal. La columna
// existe para separar los deducidos de los humanos, y llenarla con una constante
// la apagaba sin que nadie lo notara.
//
// Ahora la procedencia sale de si HUBO una persona, y quien la arma es
// `servicioIdentidad`, el mismo módulo que usa Listas de precios. Es lo que hace
// que lo confirmado en un módulo aparezca en el otro: no hay dos memorias.

import { filasDeIdentidad, METODO_DETECCION } from "@/lib/proveedores/identidad/servicioIdentidad";

/**
 * @param items                 los del cuerpo, con sus `aliases` por renglón
 * @param productosPorLocal     Map productoLocalId → producto (con baseId)
 * @param confirmadaPorUsuarioId quién está guardando, si corresponde
 * @param confirmadaEn          cuándo. Las dos mitades o ninguna.
 */
export function aliasesDeImportacion({
  items = [],
  productosPorLocal,
  grupoId,
  proveedorId,
  confirmadaPorUsuarioId = null,
  confirmadaEn = null,
} = {}) {
  const salida = new Map();
  for (const item of items) {
    const producto = productosPorLocal?.get?.(Number(item?.productoLocalId));
    const productoBaseId = producto?.baseId ?? producto?.base?.id ?? null;
    for (const crudo of Array.isArray(item?.aliases) ? item.aliases : []) {
      const filas = filasDeIdentidad({
        grupoId,
        proveedorId,
        productoBaseId,
        codigoProveedor: crudo?.codigoProveedor ?? null,
        descripcionProveedor: crudo?.descripcionProveedor ?? null,
        // Cómo se llegó al producto lo dice el renglón. Sin dato, lo más flojo:
        // suponer que fue exacto haría pasar por cierto lo que no consta.
        metodoDeteccion: crudo?.metodoDeteccion || METODO_DETECCION.APROXIMADO,
        presentacionProveedor: crudo?.presentacionProveedor ?? null,
        unidadesPorPresentacion: crudo?.unidadesPorPresentacion ?? null,
        // ── LA CONFIRMACIÓN ES POR RENGLÓN, NO POR DOCUMENTO ─────────────
        //
        // Tocar "Crear borrador" no confirma cada vínculo: confirma el pedido.
        // Un renglón que el motor vinculó solo y que nadie tocó NO puede quedar
        // registrado como elegido por una persona, aunque el documento entero se
        // haya guardado a mano — es la diferencia entre "alguien lo miró" y
        // "alguien no lo objetó", y solo la primera sirve para no revocarlo.
        confirmadaPorUsuarioId: crudo?.productoElegidoAMano === true ? confirmadaPorUsuarioId : null,
        confirmadaEn: crudo?.productoElegidoAMano === true ? confirmadaEn : null,
      });
      // Un detalle consolidado puede venir de dos renglones del mismo producto,
      // y cada renglón puede dejar dos claves —el código y la descripción—. Se
      // deduplican por clave: la última gana, que es la del renglón más reciente.
      for (const fila of filas) {
        salida.set(`${fila.grupoId}:${fila.proveedorId}:${fila.codigoInterno}`, fila);
      }
    }
  }
  return [...salida.values()];
}
