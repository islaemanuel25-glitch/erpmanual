// lib/proveedores/listas/losQueNoCambian.js
//
// TUS PRODUCTOS DE ESTE PROVEEDOR QUE ESTA LISTA NO VA A CORREGIR.
//
// ── LA PREGUNTA ES DE EMANUEL, Y ES OTRA ───────────────────────────────────
//
// Todo el módulo mira las FILAS DEL ARCHIVO: qué trajo el proveedor y qué se
// puede hacer con cada renglón. Esta pantalla mira al revés, desde el CATÁLOGO:
// de mis productos de M Y F, ¿cuáles van a quedar con el costo viejo después de
// aplicar?
//
// Esa pregunta no se contestaba en ningún lado, y los tres pedazos de la
// respuesta estaban repartidos en tres tarjetas que no se hablaban: los que hay
// que revisar, los que él dejó igual a propósito, y los que el proveedor
// directamente no informó. Son tres motivos distintos y un solo resultado —el
// costo no cambia— y lo que se hace con cada uno es distinto.
//
// ── POR QUÉ UN PRODUCTO CAE EN UN SOLO GRUPO ───────────────────────────────
//
// Porque un producto puede tener VARIAS filas en la misma importación: el
// proveedor lo informa dos veces, o dos códigos suyos apuntan al mismo producto.
// Si se listara por fila, el mismo producto aparecería dos veces, los chips
// sumarían más que el total, y el número de la tarjeta del resultado no cerraría
// contra la lista que abre. Eso ya pasó en este módulo con el detalle por
// producto, y está anotado en `detalleSistema.js`.
//
// Acá el producto entra UNA vez y el orden de abajo decide con qué motivo.
//
// Módulo puro: sin BD, sin Next.

import { motivoDeRevision, laDejaronComoEsta, MOTIVO_REVISION } from "./resultadoDeLaLista.js";

/** Por qué este producto no cambia con esta lista. */
export const GRUPO_NO_CAMBIA = {
  /** El proveedor no lo informó: no hay precio nuevo para él. */
  NO_VINO: "NO_VINO",
  /** Vino, y su fila está esperando una decisión. */
  PARA_REVISAR: "PARA_REVISAR",
  /** Vino, y alguien decidió dejarlo con el costo de ahora. */
  DEJADO: "DEJADO",
};

export const TEXTO_GRUPO_NO_CAMBIA = {
  NO_VINO: "No vino en la lista",
  PARA_REVISAR: "Para revisar",
  DEJADO: "Lo dejaste igual",
};

/** El tono de cada motivo. Ámbar es el único que pide trabajo. */
export const TONO_GRUPO_NO_CAMBIA = {
  NO_VINO: "sunmi-text-muted",
  PARA_REVISAR: "sunmi-text-warning",
  DEJADO: "sunmi-text-muted",
};

/** Los chips, en el orden en que se ofrecen. `null` es "Todos". */
export const ORDEN_NO_CAMBIAN = [
  GRUPO_NO_CAMBIA.NO_VINO,
  GRUPO_NO_CAMBIA.PARA_REVISAR,
  GRUPO_NO_CAMBIA.DEJADO,
];

/**
 * ¿Este producto cambia con esta lista, o no? Y si no, ¿por qué?
 *
 * ── EL ORDEN DE LAS RAMAS ES LA MITAD DE LO QUE AFIRMA ────────────────────
 *
 * 1. **Si alguna fila suya se va a escribir, el producto SÍ cambia** y no entra
 *    acá, por más que otra de sus filas esté excluida o pendiente. Mostrarlo en
 *    "no cambian" sería decirle a Emanuel que un producto conserva el costo
 *    viejo cuando en un rato se le va a escribir uno nuevo. Ésta va primero
 *    porque es la única que saca al producto de la pantalla.
 *
 * 2. **Para revisar le gana a dejado.** Si una fila quedó excluida y otra sigue
 *    pendiente, todavía hay trabajo: contarlo como "lo dejaste igual" esconde
 *    una decisión que falta tomar. Al revés no pierde nada.
 *
 * 3. **Sin filas, no vino.** Es el único caso que no puede chocar con los otros.
 *
 * "No está en tu catálogo" NO aparece nunca acá, y no es un olvido: esta
 * pantalla recorre EL CATÁLOGO, así que una fila sin producto no tiene por dónde
 * entrar. Se miran en su propia tarjeta del resultado.
 *
 * @param filas  las filas de ESTA importación que apuntan a este producto
 * @param rango  el rango esperado, para que `motivoDeRevision` pueda juzgar
 * @returns uno de GRUPO_NO_CAMBIA, o `null` si la lista sí lo corrige
 */
export function grupoQueNoCambia(filas = [], rango = null) {
  if (filas.length === 0) return GRUPO_NO_CAMBIA.NO_VINO;

  let hayParaRevisar = false;
  let hayDejada = false;

  for (const f of filas) {
    // Ya aplicada: el costo nuevo YA está escrito. Es la forma más fuerte de
    // "esta lista sí lo corrigió".
    if (f?.aplicada === true) return null;

    if (laDejaronComoEsta(f)) {
      hayDejada = true;
      continue;
    }

    const m = motivoDeRevision(f, rango);
    // `null` es "se va a aplicar". El producto cambia.
    if (m === null) return null;
    // Una fila sin producto no puede llegar acá —se llega desde el catálogo—
    // pero si llegara, no dice nada sobre este producto.
    if (m === MOTIVO_REVISION.SIN_PRODUCTO) continue;
    hayParaRevisar = true;
  }

  if (hayParaRevisar) return GRUPO_NO_CAMBIA.PARA_REVISAR;
  if (hayDejada) return GRUPO_NO_CAMBIA.DEJADO;

  // Tiene filas, ninguna se aplica, ninguna está pendiente y ninguna se dejó a
  // mano. Hoy eso significa SIN_CAMBIOS: el proveedor mandó el mismo precio. El
  // producto no cambia, y el motivo honesto es que la lista no lo corrige
  // porque no hay nada que corregir — no entra en la pantalla.
  return null;
}

/**
 * Cuántos hay de cada motivo, y el total.
 *
 * Los chips salen de ACÁ y no de contar el array ya filtrado en la pantalla:
 * así el número del chip y la lista que abre no pueden decir cosas distintas,
 * que es el defecto que este módulo ya tuvo tres veces.
 */
export function contarLosQueNoCambian(productos = []) {
  const porGrupo = {};
  for (const g of ORDEN_NO_CAMBIAN) porGrupo[g] = 0;
  let total = 0;
  for (const p of productos) {
    if (!p?.grupo) continue;
    if (!(p.grupo in porGrupo)) continue;
    porGrupo[p.grupo] += 1;
    total += 1;
  }
  return { porGrupo, total };
}

/**
 * ¿Los chips suman el total?
 *
 * Se informa en vez de suponerse, igual que `resultadoCierra`. Un chip que no
 * cierra esconde productos que nadie mira.
 */
export function chipsCierran(conteo) {
  const suma = ORDEN_NO_CAMBIAN.reduce((acc, g) => acc + (conteo?.porGrupo?.[g] ?? 0), 0);
  return suma === conteo?.total;
}
