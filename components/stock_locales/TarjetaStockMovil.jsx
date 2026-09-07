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

/** El alfa de "no hay dato" se decide acá y no en cada renglón. */
function textoLimite(valor, configurados, item, esDeposito) {
  if (!configurados) return "Sin ajustar";
  if (valor === null || valor === undefined) return "—";
  // Solo el depósito pack necesita cambiar de escala. En locales y en los
  // productos sueltos se conserva el texto corto que ya tenía la card.
  if (esPackDeposito(item, esDeposito)) {
    return formatLimiteStock(valor, item, esDeposito);
  }
  return Number(valor).toLocaleString("es-AR");
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
}) {
  const stock = Number(item?.stock ?? 0);
  const presentacion = presentacionCantidadStock(item, localEsDeposito);
  const unidad = localEsDeposito
    ? getUnidadDeposito(item || {})
    : getUnidadLocal(item || {});
  const configurados = item?.limitesConfigurados === true;
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
      marca={
        <span className="text-xs sunmi-text-muted whitespace-nowrap">
          mín {textoLimite(item?.stockMin, configurados, item, localEsDeposito)}
          {" · "}
          máx {textoLimite(item?.stockMax, configurados, item, localEsDeposito)}
        </span>
      }
      valor={
        <BloqueValorTarjeta className="flex-col justify-center">
          <RotuloBloqueValor className="sunmi-text-muted">
            STOCK · {unidad}
          </RotuloBloqueValor>
          {/* El número grande es lo que la persona vino a ver. La presentación
              es la MISMA pieza que usa la tabla de escritorio: en depósito un
              Pack x10 con 45 unidades se lee "4 bultos + 5 uds". */}
          <NumeroBloqueValor className={negativo ? "sunmi-text-danger" : ""}>
            {presentacion.texto}
          </NumeroBloqueValor>
        </BloqueValorTarjeta>
      }
      aviso={
        negativo ? (
          <span className="sunmi-text-danger">Stock negativo</span>
        ) : bajoMinimo ? (
          <span className="sunmi-text-warning">Bajo mínimo</span>
        ) : null
      }
      acciones={
        puedeAjustar ? (
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
