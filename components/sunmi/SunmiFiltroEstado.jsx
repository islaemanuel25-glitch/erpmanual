"use client";

// UN FILTRO SEGMENTADO DE 3 A 5 ESTADOS, DONDE TODOS SE VEN A LA VEZ.
//
// ── POR QUÉ NO ALCANZABA CON LO QUE HABÍA, MIRADO PIEZA POR PIEZA ─────────
//
// `SunmiSelectorUnidad` nació para "Pack | Un": DOS opciones que se alternan
// seguido. Se lo generalizó para aceptar una lista, y por eso terminó dibujando
// los cuatro tabs del control físico de recepción — pero su forma sigue siendo
// una fila de botones pegados que no envuelve. Con cuatro opciones que además
// llevan número, a 390 px se aplastan hasta cortar el texto. Y su nombre miente:
// el control de la unidad de un producto no es el mismo control que el filtro de
// estado de una lista, aunque hoy se dibujen parecido.
//
// `SunmiChipsFiltro` es la otra mitad del problema y lo dice en su propio
// encabezado: existe para una TAXONOMÍA de muchas opciones —diez categorías— y
// por eso scrollea en horizontal. Eso es correcto cuando no se sabe cuántas hay
// y ninguna es más importante que otra. Acá son cuatro, fijas, y son los estados
// del trabajo: esconder "Todos" detrás de un arrastre obliga a descubrir que
// existe.
//
// `SunmiToggleEstado` es un interruptor booleano, otra cosa.
//
// Así que faltaba: **pocas opciones, todas visibles, sin scroll y sin cortar
// texto**. Eso es esta pieza.
//
// ── QUÉ NO SABE ──────────────────────────────────────────────────────────
//
// Qué se está filtrando. Recibe opciones con clave, texto y un conteo opcional,
// dice cuál está elegida y avisa cuando cambia. No sabe de recepción, de
// productos ni de transferencias: la pantalla arma las opciones. Por eso se
// llama por lo que hace y no por dónde se estrenó.
//
// ── POR QUÉ UNA GRILLA Y NO UNA FILA ─────────────────────────────────────
//
// Una fila con cuatro botones a 390 px da ~90 px por botón, y "Diferencias 0" no
// entra. En dos columnas cada uno tiene ~185 px y entra entero, que es la única
// forma de que el filtro se pueda leer sin abrirlo.
//
// La cantidad de columnas sale de cuántas opciones hay, con primitivas de la
// escala y sin un solo valor arbitrario. De `sm` para arriba entran todas en una
// fila, que es donde el ancho alcanza.

//
// ── `porPagina`: CUANDO SON MÁS DE LAS QUE ENTRAN, UN CARRUSEL ────────────
//
// El Control de stock sumó un quinto filtro —"En negativo"— y la grilla de dos
// por dos tenía que quedar como estaba. Con `porPagina` las opciones se parten
// en páginas de esa cantidad, cada una con la MISMA grilla, y se pasa de una a
// otra deslizando de costado, con un puntito por página. Todas las páginas
// miden lo que la más alta —son hijas estiradas de la misma pista— y la grilla
// tiene sus filas fijas, así que una página con un solo botón deja los demás
// casilleros vacíos y lo de abajo no se mueve. Arranca en la página del filtro
// elegido.
//
// La pista y los puntitos salen de `CarruselControles` (productos), que es el
// carrusel de a cuatro que ya funciona: la misma pista con snap y sin barra, y
// el mismo botón de 24 con el puntito adentro. Los colores, de tokens: el
// activo `sunmi-bg-accent` —el de `sunmi-btn-primary`— y el otro `sunmi-bg-borde`.
//
// Sin `porPagina`, o con las opciones que entran en una, el marcado es el de
// siempre.

import { useEffect, useRef, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * Cuántas columnas por cantidad de opciones.
 *
 * Es un mapa explícito y no una cuenta: `grid-cols-${n}` no existe para Tailwind,
 * que solo genera las clases que encuentra ESCRITAS. Una clase construida por
 * interpolación no se genera nunca y la grilla se caería a una sola columna sin
 * que nada avise — es la misma trampa que la sonda de cascada documenta.
 */
const COLUMNAS = Object.freeze({
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
});

/**
 * La grilla de UNA página, por cuántas entran. Las filas van fijas para que una
 * página incompleta mida lo mismo que una llena. Solo la de cuatro, que es la
 * que se usa: dos columnas por dos filas en todos los anchos.
 */
const GRILLA_DE_PAGINA = Object.freeze({
  4: "grid-cols-2 grid-rows-2",
});

export default function SunmiFiltroEstado({
  /** `[{ clave, texto, cantidad? }]`. Entre 3 y 5; con menos usá el selector. */
  opciones = [],
  valor = null,
  onCambiar,
  rotulo = null,
  /** Para el `role="group"` cuando no hay rótulo visible. */
  ariaLabel = undefined,
  className = "",
  /** Cuántas opciones por página; con más, un carrusel. Hoy, 4. */
  porPagina = null,
}) {
  const lista = Array.isArray(opciones) ? opciones : [];
  const elegida = valor == null ? null : String(valor);
  const paginado = GRILLA_DE_PAGINA[porPagina] != null && lista.length > porPagina;
  const paginas = [];
  if (paginado) for (let i = 0; i < lista.length; i += porPagina) paginas.push(lista.slice(i, i + porPagina));
  const indiceElegida = lista.findIndex((o) => String(o.clave) === elegida);
  const paginaDeLaElegida = paginado && indiceElegida >= 0 ? Math.floor(indiceElegida / porPagina) : 0;

  const pistaRef = useRef(null);
  const [paginaVisible, setPaginaVisible] = useState(paginaDeLaElegida);

  // A la página del elegido: al montar —volver a la pantalla con "En negativo"
  // arranca en la 2—, sin animación, y si el elegido cambia de página.
  const yaLlevoRef = useRef(false);
  useEffect(() => {
    if (!paginado) return;
    const pista = pistaRef.current;
    if (!pista) return;
    let intentos = 0;
    const llevar = () => {
      const ancho = pista.clientWidth;
      // Sin ancho el navegador no terminó de maquetar: se reintenta en el cuadro
      // siguiente, unas pocas veces —en un entorno sin maqueta no llega nunca—.
      if (!ancho) {
        intentos += 1;
        if (intentos < 10 && typeof requestAnimationFrame === "function") requestAnimationFrame(llevar);
        return;
      }
      const suave = yaLlevoRef.current;
      yaLlevoRef.current = true;
      pista.scrollTo?.({ left: paginaDeLaElegida * ancho, behavior: suave ? "smooth" : "auto" });
    };
    llevar();
    setPaginaVisible(paginaDeLaElegida);
  }, [paginado, paginaDeLaElegida]);

  if (lista.length === 0) return null;

  const boton = (o) => {
          const clave = String(o.clave);
          const activa = clave === elegida;
          return (
            <SunmiButton
              key={clave}
              type="button"
              color={activa ? "primary" : "slate"}
              aria-pressed={activa}
              onClick={() => onCambiar?.(o.clave)}
              // `w-full` para que ocupe su celda entera y los cuatro midan igual;
              // `justify-center` porque un botón de ancho completo con el texto
              // pegado a la izquierda no se lee como un segmento.
              //
              // Y `gap-1` es lo que separa el rótulo del número. NO alcanza con
              // un `{" "}` entre los dos: el botón del kit es `inline-flex`, y un
              // nodo de texto que solo tiene un espacio no genera caja en un
              // contenedor flex — se descarta. Se vio en la captura de 390 px,
              // que decía "Pendientes45" pegado; leyendo el JSX parecía bien.
              className="w-full justify-center gap-1"
            >
              {o.texto}
              {/* El conteo adentro: saber cuántos hay antes de tocarlo es la
                  mitad de para qué sirve el filtro.

                  El `{" "}` es obligatorio y no decorativo: JSX descarta el
                  espacio al principio de una expresión, así que sin él se
                  dibujaba "Pendientes45" pegado. Se vio en la captura de 390 px,
                  no leyendo el código. */}
              {/* ── EN EL ELEGIDO, EL NÚMERO VA DEL COLOR DE SU ETIQUETA ──────
                  Llevaba `sunmi-text-muted` siempre. Sobre el fondo del botón
                  elegido ese gris quedaba del color del fondo y el número no se
                  leía —lo vio Emanuel en el detalle de la transferencia 504, y
                  la Lista de precios usa esta misma pieza—. Elegido, el número
                  no pide color y hereda el de la etiqueta; sin elegir, sigue
                  apagado, que es lo que lo distingue del rótulo. */}
              {o.cantidad != null && (
                <span data-cantidad className={activa ? undefined : "sunmi-text-muted"}>
                  {o.cantidad}
                </span>
              )}
            </SunmiButton>
          );
  };

  if (!paginado) {
    // Fuera del rango previsto se cae a dos columnas, que entra siempre. No se
    // lanza un error: una pantalla no se rompe por un filtro.
    const columnas = COLUMNAS[lista.length] || "grid-cols-2";
    return (
      <div className={className}>
        {rotulo && <div className="text-sm2 sunmi-text-muted mb-1">{rotulo}</div>}
        <div
          role="group"
          aria-label={ariaLabel || rotulo || undefined}
          className={`grid ${columnas} gap-1.5`}
        >
          {lista.map(boton)}
        </div>
      </div>
    );
  }

  const alDesplazar = (e) => {
    const ancho = e.currentTarget.clientWidth || 1;
    const indice = Math.round(e.currentTarget.scrollLeft / ancho);
    if (indice !== paginaVisible) setPaginaVisible(indice);
  };

  const irA = (indice) => {
    const pista = pistaRef.current;
    if (!pista) return;
    pista.scrollTo?.({ left: indice * pista.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={className}>
      {rotulo && <div className="text-sm2 sunmi-text-muted mb-1">{rotulo}</div>}
      <div
        ref={pistaRef}
        onScroll={alDesplazar}
        role="group"
        aria-label={ariaLabel || rotulo || undefined}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paginas.map((pagina, i) => (
          <div key={i} data-pagina={i + 1} className={`grid ${GRILLA_DE_PAGINA[porPagina]} gap-1.5 shrink-0 w-full snap-start`}>
            {pagina.map(boton)}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 mt-1.5">
        {paginas.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => irA(i)}
            aria-label={`Página ${i + 1} de ${paginas.length}`}
            aria-current={i === paginaVisible}
            className="w-6 h-6 flex items-center justify-center"
          >
            <span className={`block w-1.5 h-1.5 rounded-full ${i === paginaVisible ? "sunmi-bg-accent" : "sunmi-bg-borde"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
