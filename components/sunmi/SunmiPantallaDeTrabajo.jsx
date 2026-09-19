"use client";

// EL ARMADO DE UNA PANTALLA DE TRABAJO EN EL TELÉFONO.
//
// ── QUÉ RESUELVE, Y POR QUÉ NO ES UNA PIEZA MÁS ────────────────────────────
//
// Las pantallas donde alguien recorre una lista decidiendo cosa por cosa
// —recibir una transferencia, armar un pedido a proveedor— tienen todas la
// misma forma: dónde estoy, buscar, filtrar, la lista, y una barra abajo con el
// total y la acción. Lo que compartían hasta ahora eran las PIEZAS de adentro
// —`SunmiCard`, `SunmiCampoBusquedaVoz`, `SunmiFiltroEstado`— y no el armado,
// que estaba escrito a mano una sola vez, dentro de `RecepcionMovil`.
//
// El resultado fue cinco tandas seguidas acercando la pantalla del pedido a la
// de recepción y encontrando una diferencia nueva cada vez: el gutter, el
// pegajoso de arriba, el pie que tapaba la última tarjeta, el ancho de los
// filtros. Ninguna era descuido. Mientras el armado se escriba en cada
// pantalla, cada pantalla lo escribe distinto.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/transferencias/RecepcionMovil.jsx`, TAL CUAL ESTABA. No se
// diseñó nada acá: las clases, el orden de los bloques, la separación y el
// comportamiento del pie son los que esa pantalla ya tenía andando. La prueba
// de que la extracción salió bien no es que compile: es que la recepción quede
// idéntica, medida y no mirada.
//
// Medido en producción a 360 px antes de extraer, con el tema claro: el
// contenido arranca en x=21 y mide 310 de ancho; los filtros 310 × 77; el
// bloque de categoría 310 × 52; el pie 338 × 57 arrancando en x=7. Esos son los
// números que esta pieza tiene que seguir dando.
//
// ── QUÉ FIJA LA PIEZA Y NINGUNA PANTALLA PUEDE CAMBIAR ────────────────────
//
// 1. QUÉ SCROLLEA. Nada de acá adentro. El que scrollea es el `<main>` del
//    shell, y esta pieza no declara ni alto ni desbordamiento — por eso no hay
//    un solo `overflow` ni un solo `h-` en todo el archivo. Una pantalla que
//    quiera clavar su encabezado arriba tiene que dejar de usar la pieza, que
//    es exactamente la fricción que se busca: el pegajoso de arriba convierte
//    el resto en una ventanita que se desplaza sola.
//
// 2. EL GUTTER. Uno solo para todo, y NO lo pone la pieza: lo pone el `p-4` del
//    `<main>` más el padding de la página. Por eso el pie usa `-mx-4 px-4`, que
//    neutraliza el del `<main>` para que la barra llegue al borde del contenido
//    en vez de quedar flotando adentro. Si una pantalla agrega padding lateral
//    propio, se desalinea sola contra la otra.
//
// 3. LA SEPARACIÓN ENTRE BLOQUES. `space-y-3`, que con `1rem = 14px` son 10,5.
//    Y `space-y-3.5` entre las tarjetas de la lista, que es más aire porque
//    cada tarjeta es una decisión aparte y no un renglón de una tabla.
//
// 4. CÓMO SE COMPORTA EL PIE. `sticky` y no `fixed`, y el porqué está medido:
//    pegado con `fixed` sale del flujo, tapa la última tarjeta y obliga a
//    compensar con un relleno al final que nadie mantiene sincronizado —el
//    pedido tenía 96 px de relleno contra una barra de 98 y la última tarjeta
//    quedaba cortada—. Con `sticky` el pie ocupa su lugar y el problema no
//    existe. El nivel de apilado es `z-10` y es de la escala, no un número
//    escrito a mano: esto NO es un modal y tiene que quedar por debajo de las
//    hojas del kit.
//
// ── QUÉ NO SABE ───────────────────────────────────────────────────────────
//
// Qué se está trabajando. No conoce transferencias ni pedidos, no busca, no
// filtra y no sabe qué es un producto. Recibe nodos y los ordena. Todo lo que
// se vea adentro lo pone la pantalla, que es lo que las diferencia.
//
// ── POR QUÉ LAS RANURAS SON ÉSTAS ─────────────────────────────────────────
//
// Son los bloques que la recepción ya tenía, ni uno más. `antesDeLista` y
// `despuesDeLista` existen porque ahí viven los caminos de excepción —el aviso
// de que un producto no figura, el catálogo del origen, el resumen de cierre—,
// y son de la pantalla, no del armado.
//
// Las ranuras condicionales se pasan como `null` y no como `false`: un hijo
// nulo no genera caja, así que `space-y-3` no le reserva separación. Es lo que
// hace que una pantalla sin categoría no quede con un hueco de 10,5 px.

import SunmiCard from "@/components/sunmi/SunmiCard";

/** El rótulo del selector de categoría. Es el mismo en las dos pantallas. */
export const ROTULO_CATEGORIA = "Categoría";

export default function SunmiPantallaDeTrabajo({
  /** Contenido de la tarjeta de contexto. La tarjeta la pone la pieza. */
  contexto = null,
  /** El campo de búsqueda, normalmente `SunmiCampoBusquedaVoz`. */
  buscador = null,
  /** Los filtros de estado, normalmente `SunmiFiltroEstado`. */
  filtros = null,
  /** El desplegable de categoría. El rótulo y su caja los pone la pieza. */
  categoria = null,
  /** Para que el `<label>` apunte al desplegable. */
  idCategoria = undefined,
  rotuloCategoria = ROTULO_CATEGORIA,
  /** Avisos y caminos de excepción, entre los filtros y la lista. */
  antesDeLista = null,
  /** Las tarjetas. La pieza pone el contenedor y su separación. */
  lista = null,
  /** Bloques de cierre, entre la lista y el pie. */
  despuesDeLista = null,
  /** Contenido de la barra de abajo. La barra la pone la pieza.
   *
   *  Se llama `pieDePantalla` y no `pie` a propósito: `pie={` ya significa
   *  otra cosa en este repo —el pie de `SunmiTabla`, con sus `valores` por
   *  columna— y hay un candado que exige que toda clave de ese pie exista
   *  como columna. Dos props con el mismo nombre y distinto contrato es cómo
   *  un candado empieza a mirar el archivo equivocado. */
  pieDePantalla = null,
  /** Lo que no ocupa lugar: hojas, modales y paneles que la pantalla monta
   *  después del pie. Van adentro de la `<section>` y no sueltos porque ahí
   *  estaban —salen del flujo por su `position`, así que `space-y-3` no les
   *  reserva separación—. */
  despuesDelPie = null,
}) {
  return (
    <section className="space-y-3">
      {contexto && <SunmiCard className="p-3 space-y-1">{contexto}</SunmiCard>}

      {buscador}

      {filtros}

      {categoria && (
        <div>
          <label className="text-sm2 sunmi-text-muted mb-1 block" htmlFor={idCategoria}>
            {rotuloCategoria}
          </label>
          {categoria}
        </div>
      )}

      {antesDeLista}

      <div className="space-y-3.5">{lista}</div>

      {despuesDeLista}

      {pieDePantalla && (
        <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-2 pb-2 border-t sunmi-divider sunmi-surface">
          {pieDePantalla}
        </div>
      )}

      {despuesDelPie}
    </section>
  );
}
