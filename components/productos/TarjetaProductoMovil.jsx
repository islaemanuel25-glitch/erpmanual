"use client";

// LA TARJETA DEL CATÁLOGO EN EL CELULAR, con sus dos caras.
//
// ── QUÉ ES CADA CARA ───────────────────────────────────────────────────────
//
//   FRENTE — VENTA CONFIGURADA. Cómo está decidido vender ese producto en la
//            ubicación activa: el número es el que cobra el POS y el rótulo es
//            su presentación. "$24.500,00 · PACK X 24" en el depósito.
//
//   DORSO  — REFERENCIA e IDENTIFICACIÓN. La otra escala para consultar, y los
//            códigos con los que se busca el producto. Dice, con todas las
//            letras, cuál sigue siendo la venta configurada.
//
// **Dar vuelta la tarjeta no cambia nada.** No toca el producto, ni `modo_envio`,
// ni el precio, ni la configuración, ni pide nada al servidor.
//
// ── LA NAVEGACIÓN VIVE ADENTRO DEL CUERPO ─────────────────────────────────
//
// El botón de dar vuelta estaba en la fila de acciones, al lado de Editar, y eso
// los ponía al mismo nivel: dos acciones hermanas, una que edita el producto y
// otra que cambia lo que se está mirando. No son lo mismo.
//
// Ahora el botón vive DENTRO del carrusel, en la misma fila que el indicador
// ● ○, que es donde se lee como "esto tiene dos caras y estoy en la primera".
// Editar queda solo, ancho completo, debajo y afuera del carrusel.
//
// ── CUÁNDO HAY DORSO ──────────────────────────────────────────────────────
//
// El dorso existe si aporta REFERENCIA o IDENTIFICACIÓN:
//
//   · referencia    — hay conversión pack ↔ unidad, o la línea de kilo/pieza.
//                     Eso lo decide `carasDeTarjeta`, con las funciones del POS.
//   · identificación — el usuario tiene prendido alguno de los dos códigos.
//
// Un suelto con los códigos prendidos SÍ tiene dorso, aunque no haya nada que
// convertir: la identificación es contenido del dorso. Y una tarjeta sin
// referencia y con los dos códigos apagados es de una sola cara, y tiene que
// funcionar así.
//
// La decisión se parte en dos a propósito: `carasDeTarjeta` es puro y no sabe
// nada de "Personalizar card", así que la parte de identificación la resuelve
// acá, que es donde esa configuración llega.
//
// ── LAS DOS CARAS TIENEN QUE MEDIR LO MISMO ───────────────────────────────
//
// La lista usa `auto-rows-fr`, que le da a todas las filas el alto de la más
// alta. Si el dorso fuera más alto que el frente, dar vuelta UNA tarjeta
// estiraría TODAS las filas de la grilla: el catálogo entero saltaría.
//
// Por eso el cuerpo tiene ranuras fijas y el frente RESERVA el lugar de lo que
// solo el dorso muestra. La reserva se hace con `invisible`, que oculta el
// contenido y conserva la caja — y además lo saca del árbol de accesibilidad, así
// que un lector de pantalla tampoco lo anuncia dos veces.
//
// Que los dos altos coincidan no se deduce: lo mide la sonda del navegador.
//
// ── EL GESTO NO PUEDE PELEARSE CON EL SCROLL ───────────────────────────────
//
// La lista se recorre deslizando el dedo hacia arriba. Si la tarjeta capturara
// cualquier movimiento, recorrer el catálogo daría vuelta tarjetas sin querer,
// que es peor que no tener gesto.
//
// Dos cosas lo evitan, y las dos hacen falta:
//
//   · `touch-action: pan-y` — le dice al NAVEGADOR que el desplazamiento
//     vertical sigue siendo suyo;
//   · se compara el desplazamiento horizontal contra el vertical antes de
//     decidir. Un gesto que se movió más en vertical NO da vuelta nada.
//
// El umbral son 45 px. Menos son toques temblorosos; más obliga a un gesto largo.
//
// Se usa Pointer Events y no una librería: es un gesto de un eje con un umbral, y
// una dependencia de carrusel son decenas de KB que además traen su propio
// scroll.

import { useRef, useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";

import SunmiProductoCard, {
  AccionTarjeta,
  PieDeCodigosTarjeta,
} from "@/components/sunmi/SunmiProductoCard";
import { nombreCortoDe, nombreDelDorso } from "@/lib/productos/carasDeTarjeta";
import { formatearMoneda } from "@/lib/moneda";

/** Cuántos píxeles horizontales hacen falta para que el gesto cuente. */
const UMBRAL_GESTO = 45;

/** Lo que dice el número cuando el producto no tiene precio fijo. */
const SIN_PRECIO_FIJO = "Importe variable";

/** Cómo se nombra cada cara. Es la jerarquía que pide el diseño. */
const ROTULO_FRENTE = "VENTA CONFIGURADA";
const ROTULO_DORSO_REFERENCIA = "REFERENCIA";
const ROTULO_DORSO_IDENTIFICACION = "IDENTIFICACIÓN";

/** `false` es "esta pantalla no lo muestra"; `null` es "no hay dato". */
const OCULTO = (valor) => valor === false;

/**
 * El precio de una cara: el número y su presentación.
 *
 * Los dos juntos y no en dos bloques: "$31.200" sin la presentación no se puede
 * controlar, y la presentación sin el número no dice nada. Son un dato.
 */
function PrecioDeLaCara({ importe, presentacion, esCombo = false, atenuado = false }) {
  return (
    <span className="flex flex-col items-end leading-none">
      <span
        data-cara-importe
        className={`text-[22px] font-bold whitespace-nowrap [font-variant-numeric:tabular-nums] tracking-[-.01em] ${
          atenuado ? "sunmi-text-muted" : "sunmi-text-strong"
        }`}
      >
        {importe === null || importe === undefined ? SIN_PRECIO_FIJO : formatearMoneda(importe)}
      </span>
      {presentacion && (
        <span
          data-cara-presentacion
          className="mt-1 text-[11.5px] font-medium sunmi-text-muted whitespace-nowrap"
        >
          {presentacion}
          {/* EL COMBO SE SIGUE DICIENDO, Y ACÁ ES DONDE LE QUEDA LUGAR.
              Era lo único que distinguía un combo en toda la tarjeta y vivía en
              la franja de equivalencia, que se fue. */}
          {esCombo && " · COMBO"}
        </span>
      )}
    </span>
  );
}

/**
 * @param {object}   caras          de `carasDeTarjeta`: `{ frente, dorso }`
 * @param {node}     regla          el renglón de la regla de ganancia, o null
 * @param {bool}     muestraCosto   si "Personalizar card" lo tiene prendido
 * @param {function} onEditar
 *
 * `codigoBarra` y `codigoInterno` siguen la convención del kit: `false` es
 * "apagado en Personalizar card" y `null` es "no hay dato".
 */
export default function TarjetaProductoMovil({
  nombre,
  empresa = null,
  codigoBarra = null,
  codigoInterno = null,
  caras,
  regla = null,
  muestraCosto = true,
  onEditar,
}) {
  const [enDorso, setEnDorso] = useState(false);
  const gesto = useRef(null);

  const { frente, dorso } = caras;

  // ── LAS DOS COSAS QUE PUEDEN JUSTIFICAR UN DORSO ───────────────────────
  const hayReferencia = !!dorso;
  const hayIdentificacion = !OCULTO(codigoBarra) || !OCULTO(codigoInterno);
  const hayDorso = hayReferencia || hayIdentificacion;
  const mirandoDorso = hayDorso && enDorso;

  const alSoltar = (e) => {
    const inicio = gesto.current;
    gesto.current = null;
    if (!inicio || !hayDorso) return;
    const dx = e.clientX - inicio.x;
    const dy = e.clientY - inicio.y;
    // El vertical manda: si el dedo se movió más hacia abajo que hacia el
    // costado, era scroll y no un gesto de la tarjeta.
    if (Math.abs(dx) < UMBRAL_GESTO || Math.abs(dx) <= Math.abs(dy)) return;
    setEnDorso(dx < 0);
  };

  const manejadoresDeGesto = {
    onPointerDown: (e) => {
      gesto.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: alSoltar,
    onPointerCancel: () => {
      gesto.current = null;
    },
  };

  // La cara cuyo precio se dibuja. Un dorso de solo identificación no tiene
  // precio propio: ahí el cuerpo lo ocupan los códigos.
  const caraConPrecio = mirandoDorso ? dorso : frente;
  const dorsoSoloIdentificacion = mirandoDorso && !hayReferencia;

  /** El rótulo de la cara, con la aclaración de qué se vende cuando hace falta. */
  const rotuloDeLaCara = () => {
    if (!mirandoDorso) return ROTULO_FRENTE;
    const base = hayReferencia ? ROTULO_DORSO_REFERENCIA : ROTULO_DORSO_IDENTIFICACION;
    // ── LA ACLARACIÓN VA ACÁ Y NO EN UN RENGLÓN PROPIO ────────────────────
    //
    // Es el requisito de que el dorso no deje duda de qué se vende. Va pegada al
    // rótulo por dos motivos: se lee junto con "REFERENCIA", que es donde nace la
    // pregunta, y no gasta un renglón — un renglón de más en el dorso rompe la
    // igualdad de altos y hace saltar la grilla entera.
    const venta =
      frente.importe === null
        ? frente.presentacion
        : `${frente.presentacion} · ${formatearMoneda(frente.importe)}`;
    return `${base} · se vende ${venta}`;
  };

  const costoDeLaCara = muestraCosto ? caraConPrecio?.costo ?? null : null;

  return (
    <SunmiProductoCard
      nombre={nombre}
      empresa={empresa}
      // Los códigos NO van al pie del kit: pertenecen al dorso, y acá se dibujan
      // adentro del cuerpo del carrusel. Se le pasa `false` para que la pieza deje
      // su espaciador y las acciones sigan ancladas abajo.
      codigoBarra={false}
      codigoInterno={false}
      valor={
        // ── EL CUERPO DEL CARRUSEL ────────────────────────────────────────
        //
        // Ocupa la ranura `valor` de la pieza del kit, que es la única que la
        // tarjeta deja libre. Adentro van las ranuras fijas de la cara.
        <span
          data-tarjeta-cara={mirandoDorso ? "dorso" : "frente"}
          className="flex-1 min-w-0 flex flex-col"
          style={{ touchAction: "pan-y" }}
          {...manejadoresDeGesto}
        >
          {/* RANURA 1 · EL RÓTULO DE LA CARA. Una línea, siempre, en las dos
              caras: es lo que hace que no haya que adivinar cuál se está
              mirando. `truncate` porque en el dorso lleva además qué se vende. */}
          {/* `text-xs2` son 10 px y está declarado en `tailwind.config.js`: mismo
              tamaño de rótulo, sin sumar al contador de medidas escritas a mano. */}
          <span
            data-cara-rotulo
            className="block text-xs2 font-semibold tracking-wide sunmi-text-muted truncate leading-none mb-1.5"
          >
            {rotuloDeLaCara()}
          </span>

          {/* RANURA 2 · EL CUERPO. El precio con su presentación y, a la
              izquierda, el costo en LA ESCALA DE ESTA CARA más la regla.
              En un dorso de sola identificación, acá van los códigos: sin eso
              quedaría un hueco del alto del precio. */}
          {dorsoSoloIdentificacion ? (
            // Sin `min-h` propio: la fila del valor de la pieza del kit ya
            // reserva 30 px, y escribirlo otra vez acá sería el mismo número en
            // dos lugares — el día que uno cambie, las dos caras dejan de medir
            // lo mismo y la grilla salta.
            <span className="flex-1 flex items-center">
              <PieDeCodigosTarjeta
                codigoBarra={codigoBarra}
                codigoInterno={codigoInterno}
                className="w-full border-t-0 pt-0"
              />
            </span>
          ) : (
            <span className="flex justify-end items-center gap-1.5">
              {(costoDeLaCara !== null || regla) && (
                <span className="mr-auto min-w-0 flex flex-col items-start leading-tight">
                  {costoDeLaCara !== null && (
                    <span
                      className="text-xs [font-variant-numeric:tabular-nums] whitespace-nowrap sunmi-text-muted"
                      title="Costo, en la misma escala que el precio de esta cara"
                    >
                      Costo {formatearMoneda(costoDeLaCara)}
                    </span>
                  )}
                  {regla}
                </span>
              )}
              <PrecioDeLaCara
                importe={caraConPrecio.importe}
                presentacion={caraConPrecio.presentacion}
                esCombo={!mirandoDorso && frente.esCombo}
                // El dorso va atenuado: es una consulta, no lo que se cobra. Que
                // los dos números se vieran igual de fuertes es lo que haría
                // dudar de cuál manda.
                atenuado={mirandoDorso}
              />
            </span>
          )}

          {/* Kilo y pieza no tienen una segunda ESCALA con su importe: tienen una
              línea de referencia, la misma que dibujaba la franja. */}
          {mirandoDorso && caraConPrecio?.detalle && (
            <span className="mt-1 block text-sm sunmi-text-strong text-right leading-snug [font-variant-numeric:tabular-nums]">
              {caraConPrecio.detalle}
            </span>
          )}

          {/* RANURA 3 · LA IDENTIFICACIÓN. Solo en el dorso.
              En el frente se RESERVA su lugar con `invisible`: oculta el
              contenido, conserva la caja y lo saca del árbol de accesibilidad.
              Sin la reserva, dar vuelta una tarjeta estiraría todas las filas de
              la grilla. */}
          {hayIdentificacion && !dorsoSoloIdentificacion && (
            <PieDeCodigosTarjeta
              codigoBarra={codigoBarra}
              codigoInterno={codigoInterno}
              className={`mt-2 ${mirandoDorso ? "" : "invisible"}`}
            />
          )}

          {/* RANURA 4 · LA NAVEGACIÓN, ADENTRO DEL CARRUSEL.
              El indicador dice en cuál de las dos caras se está; el botón nombra
              la cara a la que lleva, así que el mismo control explica cómo
              volver. Van juntos porque son lo mismo: moverse entre caras. */}
          {hayDorso && (
            <span className="mt-2 flex items-center justify-between gap-2">
              <span
                data-tarjeta-indicador
                className="flex items-center gap-1.5"
                aria-hidden="true"
              >
                {[false, true].map((esDorso) => (
                  <span
                    key={String(esDorso)}
                    className="block w-1.5 h-1.5 rounded-full transition-opacity"
                    style={{
                      background: "var(--pos-accent)",
                      opacity: mirandoDorso === esDorso ? 1 : 0.3,
                    }}
                  />
                ))}
              </span>
              {/* 44 px de alto: el mínimo táctil de WCAG 2.5.5, escrito porque en
                  esta aplicación 1 rem son 14 px y `h-11` daría 38,5. */}
              <button
                type="button"
                data-tarjeta-voltear
                onClick={() => setEnDorso((v) => !v)}
                aria-pressed={mirandoDorso}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mr-2 text-xs font-medium sunmi-text-strong"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Ver{" "}
                {mirandoDorso
                  ? nombreCortoDe(frente.presentacion)
                  : nombreDelDorso(hayReferencia ? dorso : null)}
              </button>
            </span>
          )}
        </span>
      }
      aviso={null}
      // ── EDITAR, SOLO Y ANCHO COMPLETO ─────────────────────────────────────
      //
      // Es la única acción de la tarjeta. El botón de dar vuelta se fue de acá
      // adentro: no es una acción sobre el producto, es moverse entre caras, y
      // ponerlos hermanos los igualaba.
      acciones={
        <AccionTarjeta icono={Pencil} onClick={onEditar}>
          Editar
        </AccionTarjeta>
      }
    />
  );
}

export { UMBRAL_GESTO, SIN_PRECIO_FIJO, ROTULO_FRENTE, ROTULO_DORSO_REFERENCIA };
