// LA PRESENTACIÓN QUE GUARDA UNA LÍNEA DE TRANSFERENCIA ARMADA A MANO.
//
// Los scripts de prueba y de siembra crean `TransferenciaDetalle` sin pasar por
// `crearTransferencia`. Desde el 2026-10-31 cada línea guarda la presentación con
// la que se valorizó su precio, y una línea sin ella no se puede valorizar: esto
// la lee de la ficha del producto y la arma con la misma función que la app,
// `presentacionParaGuardar`.

import { presentacionParaGuardar } from "../../lib/transferencias/costoTransferencia.js";

/** Las seis columnas `valorizacion*` de la ficha de un `ProductoLocal`. */
export async function presentacionDeLaFicha(prisma, productoLocalId) {
  const pl = await prisma.productoLocal.findUnique({ where: { id: productoLocalId }, include: { base: true } });
  return presentacionParaGuardar(pl?.base, "presentacionDeLaFicha");
}
