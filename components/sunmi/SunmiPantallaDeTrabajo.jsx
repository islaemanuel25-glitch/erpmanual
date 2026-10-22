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
//    `<main>` más el padding de la página. Por eso el lugar del pie usa `-mx-4`,
//    que neutraliza el del `<main>` para que la barra llegue al borde del
//    contenido en vez de quedar flotando adentro, y la barra lleva `px-4`. Si
//    una pantalla agrega padding lateral propio, se desalinea sola contra la
//    otra.
//
// 3. LA SEPARACIÓN ENTRE BLOQUES. `space-y-3`, que con `1rem = 14px` son 10,5.
//    Y `space-y-3.5` entre las tarjetas de la lista, que es más aire porque
//    cada tarjeta es una decisión aparte y no un renglón de una tabla.
//
// 4. CÓMO SE COMPORTA EL PIE. `fixed`, clavado al borde de abajo de la
//    PANTALLA, con un lugar reservado en el flujo del alto MEDIDO de la barra.
//
//    Fue `sticky` hasta el 2026-10-22, y se cambió porque se movía. El que
//    scrollea es el `<main>` del shell, que tiene padding abajo (`pb-4`, y
//    `pb-20` en modo topbar). Un `sticky bottom-0` se pega al borde del
//    CONTENIDO de ese contenedor, no al de la pantalla: por la franja del
//    padding se veían pasar las tarjetas por debajo de la barra. Y al llegar al
//    final la barra volvía a su lugar en el flujo con el padding de la página y
//    el del `<main>` debajo, que era el hueco vacío entre la barra y el borde
//    del teléfono. Con una lista corta quedaba a mitad de pantalla. Emanuel lo
//    marcó en pedidos y en la recepción: "dejalo abajo o arriba pero no puede
//    moverse".
//
//    Antes de `sticky` había sido `fixed`, y se dejó porque tapaba la última
//    tarjeta: el relleno que la compensaba estaba escrito a mano —96 px contra
//    una barra de 98— y nadie lo mantenía al día. El problema no era `fixed`,
//    era el número a ojo. Por eso el lugar reservado no se escribe: es un `div`
//    en el flujo, al final de la sección, cuyo alto es el de la barra MEDIDO en
//    el navegador, y que se vuelve a medir cuando la barra cambia de alto (un
//    renglón que aparece, un botón que se parte en dos) o cambia la ventana.
//    La barra toma del lugar reservado su izquierda y su ancho, así que ocupa
//    exactamente lo mismo que ocupaba siendo `sticky`.
//
//    LA BARRA DE NAVEGACIÓN DEL CELULAR. En modo topbar el shell dibuja la suya
//    `fixed bottom-0` (`MobileNav`, marcada `data-nav-inferior`). El pie se apoya
//    ENCIMA de ella, a la distancia de su alto medido: es donde quedaba con
//    `sticky` gracias al `pb-20`, y si se clavara en 0 la barra de navegación lo
//    taparía. Sin ella —modo lateral, o escritorio, donde está oculta— mide 0.
//
//    El nivel de apilado es `z-10` y es de la escala, no un número escrito a
//    mano: esto NO es un modal y tiene que quedar por debajo de las hojas del
//    kit.
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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";

/** El rótulo del selector de categoría. Es el mismo en las dos pantallas. */
export const ROTULO_CATEGORIA = "Categoría";

/** La barra de navegación del celular que el shell dibuja abajo, si la hay. */
export const SELECTOR_NAV_INFERIOR = "[data-nav-inferior]";

/** `useLayoutEffect` en el navegador, `useEffect` en el servidor. */
const useEfectoAntesDePintar = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * El pie clavado al borde de abajo de la pantalla, y su lugar reservado en el
 * flujo. Ver el punto 4 de arriba.
 */
function PieClavado({ children }) {
  const lugarRef = useRef(null);
  const barraRef = useRef(null);
  // Lo medido: el alto de la barra, de dónde a dónde va, y cuánto ocupa abajo
  // la barra de navegación del celular. `null` hasta la primera medida.
  const [medida, setMedida] = useState(null);

  const medir = useCallback(() => {
    const lugar = lugarRef.current;
    const barra = barraRef.current;
    if (!lugar || !barra) return;
    const deLugar = lugar.getBoundingClientRect();
    const nav = document.querySelector(SELECTOR_NAV_INFERIOR);
    const nueva = {
      alto: barra.getBoundingClientRect().height,
      izquierda: deLugar.left,
      ancho: deLugar.width,
      abajo: nav ? nav.getBoundingClientRect().height : 0,
    };
    setMedida((previa) =>
      previa &&
      previa.alto === nueva.alto &&
      previa.izquierda === nueva.izquierda &&
      previa.ancho === nueva.ancho &&
      previa.abajo === nueva.abajo
        ? previa
        : nueva
    );
  }, []);

  // Antes de pintar, y otra vez en cada render: lo que hay adentro de la barra
  // cambia con la pantalla (un renglón que aparece, "Enviando...").
  useEfectoAntesDePintar(() => {
    medir();
  });

  useEffect(() => {
    window.addEventListener("resize", medir);
    let observador = null;
    if (typeof ResizeObserver !== "undefined") {
      observador = new ResizeObserver(medir);
      if (barraRef.current) observador.observe(barraRef.current);
      if (lugarRef.current) observador.observe(lugarRef.current);
      const nav = document.querySelector(SELECTOR_NAV_INFERIOR);
      if (nav) observador.observe(nav);
    }
    return () => {
      window.removeEventListener("resize", medir);
      observador?.disconnect();
    };
  }, [medir]);

  return (
    <>
      {/* El lugar reservado: del alto medido de la barra, para que la última
          tarjeta y lo que venga después de la lista se vean enteros arriba de
          ella al llegar al final. */}
      <div ref={lugarRef} data-pie-reservado="" aria-hidden="true" className="-mx-4" style={{ height: medida ? medida.alto : 0 }} />
      <div
        ref={barraRef}
        data-pie-de-pantalla=""
        className="fixed z-10 px-4 pt-2 pb-2 border-t sunmi-divider sunmi-surface"
        style={
          medida
            ? { left: medida.izquierda, width: medida.ancho, bottom: medida.abajo }
            : { left: 0, right: 0, bottom: 0 }
        }
      >
        {children}
      </div>
    </>
  );
}

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

      {pieDePantalla && <PieClavado>{pieDePantalla}</PieClavado>}

      {despuesDelPie}
    </section>
  );
}
