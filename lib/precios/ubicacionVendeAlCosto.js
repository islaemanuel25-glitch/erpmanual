// ¿EL POS DE ESTA UBICACIÓN COBRA EL COSTO?
//
// ── POR QUÉ EXISTE, Y POR QUÉ NO VIVE ADENTRO DE LA RUTA ──────────────────
//
// El catálogo necesita saber si el número grande de la tarjeta tiene que ser el
// costo o el precio de venta. La pregunta es sobre la UBICACIÓN y no sobre el
// producto, así que se contesta una vez por pedido.
//
// Podría haber quedado inline en `app/api/productos/listar/route.js`, y estuvo
// escrita así un rato. Se sacó acá por una razón concreta: **la degradación de
// los errores había que poder EJERCERLA en un candado.** Un try/catch adentro de
// una ruta de Next solo se ejerce levantando la ruta entera con sesión; copiado
// en un test, lo que se prueba es la copia. Acá el candado le pasa un `prisma`
// que explota y comprueba las dos mitades: que devuelve el caso seguro y que
// dejó rastro.
//
// ── QUÉ CONTESTA ───────────────────────────────────────────────────────────
//
//   { alCosto: boolean, redondea100: boolean }
//
// `alCosto` sale del MISMO resolver que usa el POS para decidir qué cobra, y del
// MISMO predicado que usa el motor de precios para elegir COSTO_PURO. No hay un
// tercer criterio acá: esta pieza los conecta, no los reimplementa.
//
// `redondea100` es del redondeo de la LISTA, no del producto: si la lista pide
// redondear, el POS cobra el costo redondeado y la tarjeta tiene que mostrar ese
// número. Hoy la lista al costo de producción no redondea.
//
// ── LA DEGRADACIÓN, Y POR QUÉ NO ES UN `catch` VACÍO ──────────────────────
//
// `resolverListaCliente` lanza errores de CONTEXTO con `.status`: 400 si faltan
// parámetros, 403 si el local no pertenece al grupo, 404 si el local no existe.
//
// Acá se descartan A PROPÓSITO, y el motivo es que este dato no cambia ningún
// número: solo decide cuál de dos números ya calculados se muestra. Tirar abajo
// un catálogo de 10.500 productos porque no se pudo resolver una lista sería
// cambiar un defecto de presentación por una pantalla caída.
//
// Lo que NO se hace es callarlo. Un `catch` vacío acá es la forma exacta del
// INC-0006, donde la pantalla descartaba el error y un 500 se veía igual que un
// botón que no hace nada. Queda el rastro con los cuatro datos que hacen falta
// para encontrarlo —ruta, grupo, local y status—, porque sin ellos el mensaje
// dice que algo falló y no dónde mirar.
//
// Al degradar devuelve `alCosto: false`, que es el comportamiento anterior a
// esta tanda: la tarjeta muestra el precio de venta. Se equivoca en el depósito,
// igual que antes, pero no rompe.

import { resolverListaCliente } from "./resolverListaCliente";
import { esListaAlCosto } from "./calcularPrecioConLista";

// El caso seguro, en un solo lugar: si algo sale mal, esto es lo que se devuelve.
const SIN_LISTA = { alCosto: false, redondea100: false };

export async function ubicacionVendeAlCosto({
  prisma,
  grupoId,
  localId,
  // Inyectable SOLO para que el candado pueda leer lo que se registró. En
  // producción es `console.error` y nadie le pasa nada.
  registrar = console.error,
} = {}) {
  try {
    // SIN `clienteId` a propósito: el catálogo es un LISTADO, no una venta, y no
    // tiene cliente en contexto. Eso deja un caso afuera y conviene saberlo: la
    // lista de un cliente gana sobre la de la ubicación, así que con uno de los
    // clientes que tienen lista al costo el POS cobra el costo también en un
    // local. Ese caso no se puede contestar sin cliente y está anotado aparte.
    const resolucion = await resolverListaCliente({ grupoId, localId, prisma });
    const alCosto = esListaAlCosto(resolucion.lista);
    return {
      alCosto,
      redondea100: alCosto && !!resolucion.lista?.redondeo_100,
    };
  } catch (err) {
    registrar(
      `productos/listar: no se pudo resolver la lista de la ubicación ` +
        `(grupoId=${grupoId} localId=${localId} status=${err?.status ?? "sin status"}): ${err?.message}`
    );
    return SIN_LISTA;
  }
}
