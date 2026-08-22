"use client";

// LA TARJETA DEL CATÁLOGO EN EL CELULAR, con sus dos caras.
//
// ── QUÉ ES CADA CARA ───────────────────────────────────────────────────────
//
//   FRENTE — cómo está decidido VENDER ese producto en la ubicación activa. El
//            número es el que cobra el POS y el rótulo es su presentación:
//            "$31.200 · PACK X 24" en el depósito, "$1.300 · UNIDAD" en un local.
//
//   DORSO  — la otra referencia, para consultar. Y dice, con todas las letras,
//            que la venta configurada sigue siendo la del frente.
//
// **Dar vuelta la tarjeta no cambia nada.** No toca el producto, ni `modo_envio`,
// ni el precio, ni la configuración, ni pide nada al servidor: los dos importes
// vienen ya calculados en `caras`, de una sola pasada por fila.
//
// ── POR QUÉ ES UN ENVOLTORIO Y NO UNA SEGUNDA TARJETA ──────────────────────
//
// Lo único que cambia entre las caras es el CUERPO —la fila del precio—. El
// nombre, el proveedor, el pie de códigos y la fila de acciones son los mismos, y
// tienen que serlo: si cambiaran, dar vuelta una tarjeta la haría irreconocible y
// además cambiaría de alto, con lo cual la grilla entera se movería.
//
// Así que `SunmiProductoCard` se queda como está y esto solo decide qué le pasa
// en `valor` y en `marca`. Dos componentes de tarjeta completos serían dos cosas
// que se rompen el día que una cambie.
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
//     vertical sigue siendo suyo. Sin esto, cualquier `preventDefault` nuestro
//     podría trabar el scroll, y con esto el navegador ni siquiera nos manda los
//     movimientos verticales como candidatos.
//   · se compara el desplazamiento horizontal contra el vertical antes de
//     decidir. Un gesto que se movió más en vertical NO da vuelta nada, aunque
//     supere el umbral horizontal.
//
// El umbral son 45 px. Menos que eso son toques temblorosos —el dedo se mueve
// aunque uno crea que no— y más obliga a un gesto largo en una tarjeta de 130 px
// de alto.
//
// Se usa Pointer Events y no una librería: es un gesto de un eje con un umbral, y
// una dependencia de carrusel para esto son decenas de KB para el celular que
// además traen su propio scroll.
//
// ── Y EL GESTO NO ES LA ÚNICA FORMA ───────────────────────────────────────
//
// Hay un botón explícito en la fila de acciones —"Ver unidad", "Ver pack"— y es
// el camino principal: un gesto que nadie descubre no existe. El botón nombra la
// cara A LA QUE LLEVA, no la que se está viendo, así que desde el dorso dice
// cómo volver.

import { useRef, useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";

import SunmiProductoCard, { AccionTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { nombreCortoDe } from "@/lib/productos/carasDeTarjeta";
import { formatearMoneda } from "@/lib/moneda";

/** Cuántos píxeles horizontales hacen falta para que el gesto cuente. */
const UMBRAL_GESTO = 45;

/** Lo que dice el número cuando el producto no tiene precio fijo. */
const SIN_PRECIO_FIJO = "Importe variable";

/**
 * El precio de una cara: el número y su presentación.
 *
 * Los dos juntos y no en dos bloques: "$31.200" sin la presentación no se puede
 * controlar, y la presentación sin el número no dice nada. Son un dato.
 */
function PrecioDeLaCara({ importe, presentacion, esCombo = false, atenuado = false }) {
  return (
    // ── ANCLAJES ESTABLES PARA QUIEN MIDA ─────────────────────────────────
    //
    // La sonda del navegador buscaba la franja de equivalencia por su TEXTO y por
    // tener cero hijos, y las dos cosas eran frágiles: el selector no la
    // encontraba nunca y la comparación se salteaba en silencio. Con un atributo,
    // medir no depende de adivinar cuál nodo es cuál.
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
              la franja de equivalencia, que se fue. Sin esto, los combos sueltos
              perderían su única marca sin que nadie lo hubiera pedido. */}
          {esCombo && " · COMBO"}
        </span>
      )}
    </span>
  );
}

/**
 * @param {object}   caras        de `carasDeTarjeta`: `{ frente, dorso }`
 * @param {node}     marca        el bloque de costo/regla del frente, o null
 * @param {function} onEditar
 */
export default function TarjetaProductoMovil({
  nombre,
  empresa = null,
  codigoBarra = null,
  codigoInterno = null,
  caras,
  marca = null,
  onEditar,
}) {
  const [enDorso, setEnDorso] = useState(false);
  const gesto = useRef(null);

  const { frente, dorso } = caras;
  // Sin segunda referencia la tarjeta es de UNA cara, y tiene que funcionar
  // igual: es el caso de un suelto, de un kilo sin precio y de un servicio.
  const hayDorso = !!dorso;
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

  const caraVisible = mirandoDorso ? dorso : frente;

  return (
    <SunmiProductoCard
      nombre={nombre}
      empresa={empresa}
      codigoBarra={codigoBarra}
      codigoInterno={codigoInterno}
      // ── EL GESTO VIVE EN EL CUERPO, NO EN LA TARJETA ENTERA ──────────────
      //
      // Si envolviera también la fila de acciones, un dedo que arranca sobre
      // "Editar" y se corre un poco daría vuelta la tarjeta en vez de entrar a
      // editar. Los botones quedan afuera del área del gesto.
      marca={
        <span
          className="flex-1 min-w-0 self-stretch flex items-center"
          style={{ touchAction: "pan-y" }}
          onPointerDown={(e) => {
            gesto.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={alSoltar}
          onPointerCancel={() => {
            gesto.current = null;
          }}
        >
          {mirandoDorso ? (
            // ── EL DORSO DICE QUÉ SE VENDE, Y NO DEJA DUDA ─────────────────
            //
            // Es el requisito del diseño y es lo que hace que consultar sea
            // seguro: alguien que da vuelta la tarjeta para ver el unitario
            // tiene que seguir viendo, sin volver, que lo configurado es el pack.
            <span className="flex flex-col items-start leading-tight min-w-0">
              <span className="text-xs sunmi-text-muted">Se vende como</span>
              <span className="text-xs font-medium sunmi-text-strong [font-variant-numeric:tabular-nums] truncate max-w-full">
                {frente.presentacion}
                {frente.importe !== null && ` · ${formatearMoneda(frente.importe)}`}
              </span>
            </span>
          ) : (
            marca
          )}
        </span>
      }
      valor={
        <span
          data-tarjeta-cara={mirandoDorso ? "dorso" : "frente"}
          style={{ touchAction: "pan-y" }}
          onPointerDown={(e) => {
            gesto.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={alSoltar}
          onPointerCancel={() => {
            gesto.current = null;
          }}
        >
          {mirandoDorso && caraVisible.importe === null && caraVisible.detalle ? (
            // KILO Y PIEZA: no hay una segunda ESCALA con su importe, hay una
            // línea de referencia. Sale de `lineaDeEquivalencia`, la misma de
            // antes, y por eso no se le inventa un número que no existe.
            // `text-sm` son 12,25 px acá —1 rem son 14— y está en la escala, así
            // que no suma al contador de medidas escritas a mano.
            <span className="text-sm sunmi-text-strong text-right leading-snug [font-variant-numeric:tabular-nums]">
              {caraVisible.detalle}
            </span>
          ) : (
            <PrecioDeLaCara
              importe={caraVisible.importe}
              presentacion={caraVisible.presentacion}
              esCombo={!mirandoDorso && frente.esCombo}
              // El dorso va atenuado: es una consulta, no lo que se cobra. Que
              // los dos números se vieran igual de fuertes es justamente lo que
              // haría dudar de cuál manda.
              atenuado={mirandoDorso}
            />
          )}
        </span>
      }
      aviso={null}
      acciones={
        <>
          {/* EL BOTÓN NOMBRA LA CARA A LA QUE LLEVA. Desde el frente dice "Ver
              unidad"; desde el dorso, "Ver pack". Así el mismo botón explica
              cómo volver, sin un segundo control. */}
          {hayDorso && (
            <AccionTarjeta
              icono={RefreshCw}
              onClick={() => setEnDorso((v) => !v)}
              aria-pressed={mirandoDorso}
              data-tarjeta-voltear
            >
              Ver {nombreCortoDe(mirandoDorso ? frente.presentacion : dorso.presentacion)}
            </AccionTarjeta>
          )}
          <AccionTarjeta icono={Pencil} onClick={onEditar}>
            Editar
          </AccionTarjeta>
        </>
      }
    />
  );
}

export { UMBRAL_GESTO, SIN_PRECIO_FIJO };
