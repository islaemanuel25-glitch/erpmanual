"use client";

import SunmiProductoCard, {
  AccionTarjeta,
  BloqueValorTarjeta,
  NumeroBloqueValor,
  RotuloBloqueValor,
} from "@/components/sunmi/SunmiProductoCard";
import { Pencil, SlidersHorizontal } from "lucide-react";
import {
  esPackDeposito,
  formatLimiteStock,
  getUnidadDeposito,
  getUnidadLocal,
  presentacionCantidadStock,
} from "@/lib/stock/presentacion";

// LA TARJETA DE UN PRODUCTO EN STOCK, PARA EL CELULAR.
//
// ── ESTA PIEZA NO DIBUJA UNA TARJETA: ADAPTA STOCK A LA DEL KIT ───────────
//
// La primera versión armaba su propia card con `SunmiPanel` y su propio layout.
// Andaba, y estaba mal: eran dos tarjetas de producto distintas creciendo en
// paralelo, y el día que una cambiara —el padding, el límite visible contra el
// fondo, el ritmo vertical, la miniatura— la otra se quedaba vieja sin que nada
// avisara. Es exactamente lo que la regla 1 del repo llama "escribir una
// parecida al lado".
//
// Ahora se consume `SunmiProductoCard`, que es la MISMA pieza que dibuja el
// catálogo, y acá solo se decide QUÉ va en cada ranura. La tarjeta sabe dibujar;
// no sabe de stock.
//
// ── LO QUE CAMBIA DE UNA PANTALLA A LA OTRA, RANURA POR RANURA ────────────
//
//   nombre / empresa   igual: el producto y su proveedor.
//   valor              en el catálogo es el PRECIO; acá es el STOCK con su
//                      unidad. Misma caja, otro dato.
//   marca              en el catálogo es la regla de ganancia; acá el mínimo y
//                      el máximo, que entran en la mitad izquierda de la fila
//                      del valor SIN costar un renglón. Es la única forma de
//                      agregarle algo a esta tarjeta: cualquier bloque nuevo la
//                      hace crecer y a 390 px se pierde la tercera.
//   aviso              en el catálogo va en null; acá es "Bajo mínimo" o
//                      "Stock negativo". La ranura existía y estaba sin usar.
//   acciones           Ajustar y Límites, SEPARADAS.
//
// ── EL CÓDIGO DE PROVEEDOR SE OCULTA, NO SE DEJA VACÍO ────────────────────
//
// El kit distingue `false` —"esta pantalla no lo muestra", el renglón
// desaparece— de `null` —"no hay dato", el renglón se queda y dice qué falta—.
//
// Acá va `false` A PROPÓSITO. `/api/stock_locales/listar` no devuelve el código
// de proveedor, así que pasarle `null` haría que la tarjeta escribiera "Sin cód.
// prov." en TODAS las filas: una afirmación falsa sobre el catálogo entero, en
// vez de un renglón que no corresponde a esta pantalla. Traerlo es una tarea
// aparte y tiene una decisión de negocio antes que la técnica —un producto puede
// tener más de uno y hay que elegir cuál—.

/** Un límite configurado, en su escala. */
function textoLimite(valor, item, esDeposito) {
  // Solo el depósito pack necesita cambiar de escala. En locales y en los
  // productos sueltos se conserva el texto corto que ya tenía la card.
  if (esPackDeposito(item, esDeposito)) {
    return formatLimiteStock(valor, item, esDeposito);
  }
  return Number(valor).toLocaleString("es-AR");
}

export const TEXTO_SIN_LIMITES = "Sin mín/máx";

/**
 * QUÉ DICE EL RENGLÓN DE LOS LÍMITES, en el lugar que le deja el recuadro de
 * STOCK a la derecha:
 *
 *   · sin ninguno (o nunca configurados): "Sin mín/máx";
 *   · con uno solo: "mín 4" o "máx 10", el que existe;
 *   · con los dos: "mín 4 · máx 10", como siempre.
 *
 * "mín Sin ajustar · máx Sin ajustar" no entraba: el recuadro tapaba el final
 * ("máx Sin ajus", visto en Control de stock el 2026-10-22). Un 0 configurado
 * es un límite, no la falta de uno.
 *
 * @returns {{ min: string|null, max: string|null }} | {{ ninguno: string }}
 */
export function textoMinMax(item, esDeposito) {
  const hay = (v) => v !== null && v !== undefined;
  const configurados = item?.limitesConfigurados === true;
  const min = configurados && hay(item?.stockMin) ? textoLimite(item.stockMin, item, esDeposito) : null;
  const max = configurados && hay(item?.stockMax) ? textoLimite(item.stockMax, item, esDeposito) : null;
  if (min === null && max === null) return { ninguno: TEXTO_SIN_LIMITES };
  return { min, max };
}

/**
 * El renglón dibujado. Con los dos va en los MISMOS nodos de texto que antes
 * —"mín ", el valor, " · ", "máx ", el valor—: juntarlos en una cadena mueve
 * píxeles (regla 1 de CLAUDE.md).
 */
function RenglonDeLimites({ item, esDeposito }) {
  const t = textoMinMax(item, esDeposito);
  return (
    <span className="text-xs sunmi-text-muted whitespace-nowrap">
      {t.ninguno ? (
        t.ninguno
      ) : t.min !== null && t.max !== null ? (
        <>
          mín {t.min}
          {" · "}
          máx {t.max}
        </>
      ) : t.min !== null ? (
        <>mín {t.min}</>
      ) : (
        <>máx {t.max}</>
      )}
    </span>
  );
}

export default function TarjetaStockMovil({
  item,
  // El nombre del proveedor no viene en la respuesta del listado —`mapItem` solo
  // expone `proveedorId`—, así que lo resuelve la pantalla con el catálogo que
  // ya tiene cargado. La tarjeta dibuja, no consulta.
  proveedorNombre = null,
  onAjustar,
  onLimites,
  puedeAjustar = true,
  localEsDeposito = false,
  // ── EL CONTROL DE STOCK USA ESTA MISMA TARJETA ───────────────────────────
  //
  // Con `filaDeAbajo`, la fila de abajo es la que trae la pantalla —el campo "Contado"—
  // en lugar de Ajustar y Límites. Lo de arriba no cambia: nombre, proveedor,
  // código y el STOCK con su presentación, que es lo que tiene que leerse igual
  // en las dos pantallas. `resaltada` pinta el borde de acción mientras se
  // escribe, y `ancla` deja encontrar la tarjeta después de escanear.
  filaDeAbajo = null,
  resaltada = false,
  ancla = null,
  // Un renglón chico debajo del número: el control pone ahí el total en
  // unidades de un desglose ("= −48 un").
  notaDelStock = null,
}) {
  const stock = Number(item?.stock ?? 0);
  const presentacion = presentacionCantidadStock(item, localEsDeposito);
  const unidad = localEsDeposito
    ? getUnidadDeposito(item || {})
    : getUnidadLocal(item || {});
  const negativo = stock < 0;
  // `faltante` lo calcula el servidor con la MISMA regla que cuenta la card de
  // "Bajo mínimo". Recalcularlo acá sería el modo de que las dos se separaran.
  const bajoMinimo = item?.faltante === true;

  return (
    <SunmiProductoCard
      nombre={item?.nombre || "—"}
      empresa={proveedorNombre}
      codigoBarra={item?.codigoBarra ?? null}
      // `false`, no `null`: ver el comentario de arriba.
      codigoInterno={false}
      marca={<RenglonDeLimites item={item} esDeposito={localEsDeposito} />}
      valor={
        // `min-w-0`: el recuadro mide su ancho del tema, pero dentro de la fila
        // nunca puede empujar más allá del borde de la tarjeta.
        <BloqueValorTarjeta className="flex-col justify-center min-w-0">
          <RotuloBloqueValor className="sunmi-text-muted">
            STOCK · {unidad}
          </RotuloBloqueValor>
          {/* El número grande es lo que la persona vino a ver. La presentación
              es la MISMA pieza que usa la tabla de escritorio: en depósito un
              Pack x10 con 45 unidades es 4 bultos y 5 uds. */}
          {/* ── EL DESGLOSE VA EN DOS RENGLONES, SIEMPRE ────────────────────
              "-3 bultos + -8 uds" en un renglón se cortaba contra el borde: la
              versión anterior dejaba que el navegador decidiera dónde cortar, y
              no alcanzó. Ahora no depende del ancho: los bultos en un renglón,
              las sueltas en el siguiente, sin el "+", cada uno su elemento. Con
              un lado en 0 queda el otro solo.

              Y si un caso futuro no entrara igual, `break-words` lo parte
              adentro del recuadro en vez de dejarlo salir. Nunca puntos
              suspensivos: un stock cortado es un stock que no se puede leer.

              LA CUENTA, a 360 px: la pantalla deja 328 (px-4 a cada lado), la
              tarjeta 302 (13 px de cada lado) y el recuadro mide 202
              (`--sunmi-product-value-width`), con 8,75 de cada lado de padding
              (px-2.5, 1rem = 14 px): 184,5 px para el renglón. "−9999 bultos"
              a 25 px son 12 caracteres; aun tomando 0,6 em para cada uno —los
              dígitos tabulares miden eso y las letras de "bultos" menos— da
              12 × 15 = 180 px, adentro. Está escrito en el candado. */}
          {presentacion.esDesglose ? (
            <NumeroBloqueValor className={`whitespace-normal break-words ${negativo ? "sunmi-text-danger" : ""}`}>
              {presentacion.partes.map((parte) => (
                <span key={parte} data-renglon-stock="" className="block">
                  {parte}
                </span>
              ))}
            </NumeroBloqueValor>
          ) : (
            <NumeroBloqueValor className={negativo ? "sunmi-text-danger" : ""}>
              {presentacion.texto}
            </NumeroBloqueValor>
          )}
          {notaDelStock}
        </BloqueValorTarjeta>
      }
      aviso={
        negativo ? (
          <span className="sunmi-text-danger">Stock negativo</span>
        ) : bajoMinimo ? (
          <span className="sunmi-text-warning">Bajo mínimo</span>
        ) : null
      }
      resaltada={resaltada}
      ancla={ancla}
      acciones={
        filaDeAbajo ? (
          filaDeAbajo
        ) : puedeAjustar ? (
          <>
            {/* Las dos acciones quedan SEPARADAS, que es la regla de negocio:
                Ajustar mueve cantidad, Límites mueve mínimo y máximo. */}
            <AccionTarjeta icono={Pencil} onClick={() => onAjustar?.(item)}>
              Ajustar
            </AccionTarjeta>
            <AccionTarjeta icono={SlidersHorizontal} onClick={() => onLimites?.(item)}>
              Límites
            </AccionTarjeta>
          </>
        ) : null
      }
    />
  );
}
