// LA ÚNICA ESCRITURA DE LA IDENTIDAD COMPARTIDA.
//
// ── POR QUÉ ES UNA FUNCIÓN Y NO EL MISMO BUCLE EN CADA RUTA ────────────────
//
// Ya estaba escrito dos veces, igual, en la ruta de crear y en la de aplicar.
// Las dos andaban el día que se escribieron; el problema aparece el día que una
// cambie. Y esta escritura es exactamente donde una regla que cambie sola es
// cara: decide si una deducción puede pisar lo que una persona confirmó.
//
// ── RECIBE LA TRANSACCIÓN, NO LA ABRE ──────────────────────────────────────
//
// Se le pasa el `tx` de quien llama. El vínculo y el pedido —o la fila de la
// lista— tienen que entrar juntos o no entrar: si el pedido se guarda y la
// memoria no, el próximo documento vuelve a preguntar lo que alguien ya
// contestó, y si entra la memoria sin el pedido queda un vínculo que nadie
// justificó.

import { datosDeActualizacion } from "./servicioIdentidad.js";

/**
 * Guarda las filas de identidad respetando lo que ya está.
 *
 * NO es un upsert ciego. Lee la fila existente y le pregunta a
 * `datosDeActualizacion` si la entrante puede pisarla — una deducción
 * automática no puede reemplazar el producto que una persona confirmó.
 *
 * @param tx     el cliente de la transacción abierta por quien llama
 * @param filas  las que devolvió `filasDeIdentidad`
 * @returns {{ creadas: number, actualizadas: number, respetadas: number }}
 */
export async function persistirIdentidad(tx, filas = []) {
  const resumen = { creadas: 0, actualizadas: 0, respetadas: 0 };

  for (const fila of filas) {
    const clave = {
      grupoId: fila.grupoId,
      proveedorId: fila.proveedorId,
      codigoInterno: fila.codigoInterno,
    };
    const existente = await tx.productoCodigoProveedor.findUnique({
      where: { codigo_interno_unico_por_proveedor: clave },
    });

    if (!existente) {
      await tx.productoCodigoProveedor.create({ data: fila });
      resumen.creadas += 1;
      continue;
    }

    const decision = datosDeActualizacion({ existente, entrante: fila });
    if (!decision.actualizar) {
      // Se respeta y NO se toca. No es un error: es la regla funcionando.
      resumen.respetadas += 1;
      continue;
    }
    await tx.productoCodigoProveedor.update({
      where: { codigo_interno_unico_por_proveedor: clave },
      data: decision.data,
    });
    resumen.actualizadas += 1;
  }

  return resumen;
}
