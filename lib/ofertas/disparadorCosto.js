// lib/ofertas/disparadorCosto.js
//
// CUANDO UN COSTO CAMBIA DE VERDAD, LAS OFERTAS DE ESA UBICACIÓN SE REVISAN.
// Sin que nadie abra la pantalla de Ofertas.
//
// ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────────────
//
// El barrido era OPORTUNISTA: corría solo cuando alguien abría Ofertas. Si nadie
// entraba, la línea no se marcaba y el aviso no salía. La oferta se seguía
// cobrando al precio publicado —eso es correcto y no cambia—, pero nadie se
// enteraba de que el margen se había movido.
//
// ── POR QUÉ ACÁ Y NO EN CATORCE ENDPOINTS ──────────────────────────────────
//
// Porque ya existe una costura por la que pasan TODAS las escrituras de la
// aplicación: `lib/prisma.js` extiende el cliente con `auditoriaExtension`, y esa
// extensión ya hace lo más caro de este problema —leer el "antes", escribir, y
// guardar los dos estados en un buffer por request—, incluso dentro de
// transacciones.
//
// Relevados los escritores reales de costo con `git grep` sobre todo el repo:
// once rutas y `lib/combos/service.js` escriben `precio_costo` en un `data:` de
// Prisma. Ponerles a los doce un llamado sería doce lugares para olvidarse en el
// trece.
//
// Así que esto no detecta nada por su cuenta: LEE el buffer que la auditoría ya
// llenó y contesta una sola pregunta —¿algún `precio_costo` quedó distinto de
// como estaba?—.
//
// ── POR QUÉ ALCANZA CON SABER *QUÉ UBICACIÓN*, Y NO QUÉ PRODUCTOS ──────────
//
// Es la decisión que hace todo esto barato y a prueba de truncamiento. El
// barrido NO necesita que le digan qué productos mirar: compara el costo
// congelado en cada línea de oferta viva contra el de hoy, y su costo lo fija la
// cantidad de líneas de ofertas vivas —decenas—, no el catálogo.
//
// Eso importa porque el buffer de auditoría tiene un tope de 500 filas por
// operación masiva. Si un cambio de precios toca 5.000 productos, el buffer ve
// 500 — suficiente para saber QUE hubo un cambio de costo en esa ubicación, que
// es todo lo que hace falta. El barrido después mira todas las líneas igual.
//
// ── CUÁNDO CORRE ───────────────────────────────────────────────────────────
//
// En `after()`, después de responder. Cambiar un costo no puede ponerse más
// lento porque además haya que revisar ofertas.

// ── ESTE ARCHIVO NO IMPORTA NADA PESADO, Y ES DELIBERADO ───────────────────
//
// `lib/auth.js` lo importa, y a `lib/auth.js` lo importa prácticamente cada ruta
// del sistema. Un import estático de `./barrido.js` acá arrastraría Prisma, el
// módulo de notificaciones y `web-push` al árbol de TODOS los handlers, incluidos
// los que no tienen nada que ver con ofertas.
//
// Antes de este archivo, `lib/auth.js` no importaba Prisma. Que siga siendo así
// no es estética: es la diferencia entre cargar dos módulos y cargar la mitad del
// ERP para verificar una cookie.
//
// Por eso lo único estático es `after`, y todo lo demás se importa adentro del
// callback, que corre después de responder y solo cuando hay algo que hacer.
import { after } from "next/server";

/**
 * Las ubicaciones cuyo costo cambió en este request, leídas del buffer de
 * auditoría.
 *
 * Dos formas de aparecer, y las dos cuentan:
 *
 *   · `ProductoLocal.precio_costo` — el costo propio de una ubicación. Afecta
 *     solo a esa.
 *   · `ProductoBase.precio_costo` — el costo de la ficha. Afecta a TODA
 *     ubicación que no tenga costo propio, así que no se puede acotar desde el
 *     buffer: se devuelve la marca `base` y el llamador barre el grupo.
 *
 * @param {object} store el store del ALS de auditoría
 * @returns {{locales:number[], base:boolean}}
 */
export function ubicacionesConCostoCambiado(store) {
  const salida = { locales: [], base: false };
  const buffer = store?.__auditBuffer;
  if (!buffer || typeof buffer.forEach !== "function") return salida;

  const locales = new Set();
  buffer.forEach((entrada) => {
    if (!cambioElCosto(entrada)) return;
    if (entrada.modelo === "ProductoBase") {
      salida.base = true;
      return;
    }
    if (entrada.modelo === "ProductoLocal") {
      const localId = Number(entrada.antes?.localId ?? entrada.despues?.localId);
      if (Number.isInteger(localId)) locales.add(localId);
    }
  });

  salida.locales = [...locales];
  return salida;
}

/**
 * ¿ESTA entrada del buffer significa que el costo cambió?
 *
 * La pregunta es "quedó distinto", no "se escribió". Guardar $650 encima de
 * $650 no es un cambio, y avisar por eso enseñaría a ignorar el aviso — que es
 * la forma de romper una alerta sin tocar una línea de código.
 *
 * Se comparan CENTAVOS ENTEROS: `precio_costo` es un Decimal y llega como
 * string o como objeto, así que `===` sobre el valor crudo diría que 650 y
 * "650.00" son distintos.
 */
export function cambioElCosto(entrada) {
  if (!entrada || (entrada.modelo !== "ProductoBase" && entrada.modelo !== "ProductoLocal")) return false;
  const antes = aCentavos(entrada.antes?.precio_costo);
  const despues = aCentavos(entrada.despues?.precio_costo);
  // Sin "antes" no hay cambio que declarar: es un producto recién creado, y un
  // producto nuevo no puede estar en una oferta que ya existe.
  if (antes == null || despues == null) return false;
  return antes !== despues;
}

function aCentavos(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Programa la revisión de ofertas para después de responder.
 *
 * Se llama UNA vez por request, al lado de `programarFlush`. Acá no se mira
 * nada: la decisión de si hay algo que hacer se toma dentro del `after()`,
 * cuando el buffer ya está completo —si se mirara ahora, el request todavía no
 * escribió nada—.
 *
 * NUNCA rompe el request. Un fallo revisando ofertas no puede voltear la
 * escritura del costo que lo produjo, igual que el flush de auditoría.
 */
export function programarRevisionPorCosto(store) {
  if (!store || store.__revisionOfertasRegistrada) return;
  store.__revisionOfertasRegistrada = true;
  try {
    after(async () => {
      try {
        const { locales, base } = ubicacionesConCostoCambiado(store);
        if (locales.length === 0 && !base) return;

        // Los dos imports son dinámicos, por lo que dice el encabezado: acá
        // adentro ya se sabe que hay costo cambiado, así que el costo de cargar
        // Prisma y el barrido se paga solo en ese caso.
        const { default: prisma } = await import("@/lib/prisma");
        const { ejecutarBarrido } = await import("./barrido.js");

        const grupoId = Number(store.grupoId) || (await grupoDeLocal(prisma, locales[0] ?? store.localId));
        if (!grupoId) return;

        // Un cambio en la ficha afecta a toda ubicación sin costo propio, así
        // que no se puede acotar: se barre el grupo. Igual es barato — el costo
        // lo fijan las líneas de ofertas vivas, no la cantidad de locales.
        const localIds = base ? await localesDelGrupo(prisma, grupoId) : locales;

        // `forzar`: esto es un EVENTO. Un costo que cambió y no se avisa porque
        // el acelerador corrió hace diez minutos sería justo el agujero que este
        // archivo viene a tapar.
        await ejecutarBarrido(prisma, { grupoId, localIds, forzar: true });
      } catch (e) {
        console.error("[ofertas] revisión por cambio de costo:", e?.message);
      }
    });
  } catch {
    // `after()` no disponible (fuera de un request). Se deja sin registrar para
    // que un próximo request con contexto sí lo programe.
    store.__revisionOfertasRegistrada = false;
  }
}

async function grupoDeLocal(prisma, localId) {
  if (!localId) return null;
  const fila = await prisma.grupoLocal.findFirst({
    where: { localId: Number(localId) },
    select: { grupoId: true },
  });
  if (fila) return fila.grupoId;
  const dep = await prisma.grupoDeposito.findFirst({
    where: { localId: Number(localId) },
    select: { grupoId: true },
  });
  return dep?.grupoId ?? null;
}

async function localesDelGrupo(prisma, grupoId) {
  const [locales, depositos] = await Promise.all([
    prisma.grupoLocal.findMany({ where: { grupoId }, select: { localId: true } }),
    prisma.grupoDeposito.findMany({ where: { grupoId }, select: { localId: true } }),
  ]);
  return [...new Set([...locales, ...depositos].map((f) => f.localId))];
}
