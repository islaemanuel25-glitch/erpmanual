// lib/proveedores/listas/tarjetasTocadas.js
//
// DESPUÉS DE TOCAR UNA TARJETA, SE TRAE ESA TARJETA Y NO LA LISTA ENTERA.
//
// ── EL CASO (Emanuel, 2026-11-25) ──────────────────────────────────────────
//
// Lista de Arcor de 975 renglones: cada «Usar», «Dejar como está» o «Listo»
// releía el resultado entero —400 tarjetas, 270 KB— para cambiar una. Ahora la
// pantalla pide `resultado?productos=<id>`: la ruta hace las MISMAS cuentas
// sobre la lista entera —los contadores, la barra, la muestra y lo que aplicar
// va a omitir salen completos, de la misma función— y de las tarjetas manda
// solo las pedidas, más el ORDEN de todas. Esto las une con las que la
// pantalla ya tenía.
//
// ── POR QUÉ VIAJA EL ORDEN ─────────────────────────────────────────────────
//
// Una tarjeta tocada puede entrar o salir de una lista —«✓ Sí» pasa un
// producto a «Confirmados»— y su lugar lo decide el `orderBy` de la base, con
// la intercalación de Postgres. Ordenar acá por nombre sería una segunda
// regla de orden que no coincide con la primera en los acentos.
//
// Si el orden nombra una tarjeta que ni estaba ni llegó, no se adivina: se
// devuelve null y la pantalla relee entera.
//
// Módulo puro: sin BD, sin Next, sin React.

/** Separa los ids de un parámetro `productos=1,2,3`. Null si no pide ninguno. */
export function productosPedidos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const ids = String(valor)
    .split(",")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

/** Las tarjetas pedidas y el orden de todas: lo que viaja de una lista de tarjetas. */
export function soloLasPedidas(items = [], pedidos) {
  return {
    items: items.filter((it) => pedidos.has(it.productoBaseId)),
    orden: items.map((it) => it.productoBaseId),
  };
}

/**
 * Lo que `tusProductosDeLaLista` recibe para TODAS las tarjetas y no por
 * producto: el rango, si la lista está abierta, desde dónde se cambian los
 * costos y el nombre del proveedor. Viaja en la cabecera. Sumar a la lista un
 * producto creado en otra ubicación, por ejemplo, cambia quién administra los
 * costos, y con eso el «Usar» de cada tarjeta.
 */
function loQueValeParaTodas(datos) {
  const c = datos?.cabecera ?? {};
  return JSON.stringify([c.estado ?? null, c.rango ?? null, c.costos ?? null, c.proveedor ?? null]);
}

function unir(antes = [], nuevas = [], orden = []) {
  const porId = new Map((antes ?? []).map((it) => [it.productoBaseId, it]));
  for (const it of nuevas ?? []) porId.set(it.productoBaseId, it);
  const out = [];
  for (const id of orden ?? []) {
    const it = porId.get(id);
    if (!it) return null;
    out.push(it);
  }
  return out;
}

/**
 * El resultado entero, armado con la respuesta parcial y lo que ya había.
 *
 * @param previo   el último resultado entero que tiene la pantalla
 * @param parcial  la respuesta de `resultado?productos=`
 * @returns el resultado con la forma de siempre, o null si no se puede unir
 */
export function conLasTarjetasTocadas(previo, parcial) {
  if (!previo?.tusProductos || !parcial?.tusProductos?.orden || !parcial?.puedenSer?.ordenConfirmados) return null;
  // Si cambió algo que dibuja TODAS las tarjetas, las que no se pidieron
  // también cambiaron: se relee entera.
  if (loQueValeParaTodas(previo) !== loQueValeParaTodas(parcial)) return null;
  const { orden, ...tusProductos } = parcial.tusProductos;
  const { ordenConfirmados, ...puedenSer } = parcial.puedenSer;
  const items = unir(previo.tusProductos.items, tusProductos.items, orden);
  const confirmados = unir(previo.puedenSer?.confirmados, puedenSer.confirmados, ordenConfirmados);
  if (!items || !confirmados) return null;
  return {
    ...parcial,
    tusProductos: { ...tusProductos, items },
    puedenSer: { ...puedenSer, confirmados },
  };
}
