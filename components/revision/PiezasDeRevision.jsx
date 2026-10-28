"use client";

// components/revision/PiezasDeRevision.jsx
//
// LA FORMA DE UNA LÍNEA QUE SE REVISA DE A UNA, EN EL TELÉFONO.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/transferencias/TarjetaRecepcionMovil.jsx` (la recepción de una
// transferencia, en producción), tal cual, el 2026-10-22: cuando el depósito
// necesitó preparar un pedido con la misma mecánica con que el local lo recibe
// —"el que prepara y el que recibe trabajan igual"—. La recepción las usa desde
// ese día y dibuja exactamente lo mismo que antes: lo compara, renglón por
// renglón de HTML, `components/transferencias/tarjetaRecepcionIgual.test.mjs`.
//
// Lo que se sacó es la FORMA, no el negocio. Qué dice cada renglón, qué se
// guarda y cuándo se colapsa lo sigue decidiendo cada pantalla.
//
//   · `TarjetaDeRevision`: la línea abierta. El nombre con lo que hay debajo,
//     la acción del caso feliz arriba a la derecha, los avisos, el separador, y
//     el pie con la acción de corregir a la izquierda y un dato a la derecha.
//   · `FilaRevisada`: la línea ya revisada, achicada a un renglón; tocable
//     entera cuando hay una acción.
//   · Las dos clases de acción, que no pueden pesar igual en la misma tarjeta.

import SunmiCard from "@/components/sunmi/SunmiCard";
// La fila colapsada entera es el área tocable, y necesita un `<button>` de
// verdad SIN caja: la tarjeta ya es la caja. Ver el comentario en `FilaRevisada`.
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

/**
 * Las dos clases de acción de la tarjeta, y por qué son distintas.
 *
 * `accent-outline` trae solo el contorno y `accent-suave` fondo tenue: las dos
 * salen de `--pos-accent` y ninguna escribe un color. La jerarquía es a
 * propósito — la acción rápida cierra la línea sin abrir nada y la de corregir
 * lleva a la hoja, así que no pueden pesar igual en la misma tarjeta.
 *
 * Van en `className` y no como `color` de `SunmiButton`: el candado del kit lee
 * `.sunmi-btn-<una-sola-palabra>` como color, y las variantes con guión quedan
 * afuera por la forma del nombre. Conviven con el `sunmi-btn-<color>` que el
 * componente agrega igual, y ganan porque `styles/sunmi.css` las define DESPUÉS
 * del bloque de colores (`variantesDeAccion.test.mjs` lo exige).
 */
// La rápida vive en el kit, con su pieza (`SunmiAccionRapida`): se reexporta
// para quien solo necesita la clase.
export { CLASE_ACCION_RAPIDA } from "@/components/sunmi/SunmiAccionRapida";
export const CLASE_ACCION_CORREGIR = "sunmi-btn-accent-suave";

/**
 * La línea abierta.
 *
 * @param {object} p
 * @param {import("react").ReactNode} p.nombre       en negrita, entero (no se trunca)
 * @param {string}  [p.tono]                         clases de estado de la tarjeta (`sunmi-state-*`)
 * @param {import("react").ReactNode} [p.debajo]     el renglón de abajo del nombre
 * @param {import("react").ReactNode} [p.accionArriba] el caso feliz, arriba a la derecha
 * @param {import("react").ReactNode} [p.avisos]     entre la cabecera y el separador
 * @param {import("react").ReactNode} [p.accionAbajo] corregir, abajo a la izquierda; sin ella, un lugar vacío
 * @param {import("react").ReactNode} [p.alPie]      abajo a la derecha
 * El resto (los `data-*` de cada pantalla) va a la tarjeta.
 */
export function TarjetaDeRevision({
  nombre,
  tono = "",
  debajo = null,
  accionArriba = null,
  avisos = null,
  accionAbajo = null,
  alPie = null,
  ...resto
}) {
  return (
    <SunmiCard className={`p-4 space-y-3 ${tono}`} {...resto}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-md2 font-semibold sunmi-text-strong break-words">{nombre}</p>
          {debajo}
        </div>
        {accionArriba}
      </div>

      {avisos}

      <SunmiSeparator />

      <div className="flex items-center justify-between gap-3">
        {accionAbajo ?? <span />}
        {alPie}
      </div>
    </SunmiCard>
  );
}

/**
 * El renglón de la cantidad, resaltada: un rótulo chico en suave y, al lado, la
 * cantidad en su presentación comercial —"2 PACK x10"— grande, en negrita y en
 * el color de acento. Lo que va después (el precio de la presentación en la
 * recepción) va como `children`.
 *
 * Salió de `TarjetaRecepcionMovil` ("Enviado 2 PACK x10") el 2026-10-23, tal
 * cual, cuando la tarjeta del depósito tuvo que decir "Pidió 2 PACK x24" igual
 * (lo comparan `tarjetaRecepcionIgual.test.mjs` y
 * `app/modulos/pos-transferencias/cantidadPedidaDestacada.test.mjs`).
 *
 * El texto de la cantidad NO se arma acá: lo trae quien la usa, de
 * `rotuloConSueltasCorto` (`lib/transferencias/presentacionEnvio.js`).
 *
 * No se trunca la cantidad: es el dato que hay que leer. Lo que cede es lo de
 * después, que baja solo cuando no entra —`min-w-0` en la cantidad le da
 * prioridad al reparto—. Cuando entran los dos, comparten renglón.
 */
export function CantidadDestacada({ rotulo, cantidad, children = null }) {
  return (
    <p className="flex items-baseline gap-x-2 flex-wrap break-words">
      {/* Sin rótulo cuando la columna ya lo dice (el escritorio de preparar,
          2026-10-28): sin el nodo vacío, que correría la cantidad con el gap. */}
      {rotulo ? <span className="text-xs sunmi-text-muted shrink-0">{rotulo}</span> : null}
      <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-accent">
        {cantidad}
      </span>
      {children}
    </p>
  );
}

/**
 * Las cantidades de la hoja de corrección: los completos y, cuando la
 * presentación agrupa, las sueltas, uno al lado del otro. Salió de
 * `FichaProductoRecepcion` el mismo día, tal cual (lo compara
 * `components/transferencias/fichaRecepcionIgual.test.mjs`).
 *
 * Al 35 % cada uno y con un hueco en el medio: ocupaban la mitad cada uno y
 * llenaban el ancho; el hueco VACÍO es lo que separa dos cantidades que se leen
 * de un vistazo de una columna que haya que llenar. `justify-between` y no un
 * grid de tres columnas: la del medio tendría que existir para quedar vacía.
 */
export function ParDeCantidades({ children }) {
  return <div className="flex justify-between gap-2">{children}</div>;
}

/**
 * Una de las dos cajas del par: el rótulo arriba —11 px y no 10: dice en qué
 * escala está el número de abajo, así que leerlo no es opcional— y el campo.
 */
export function CajaDeCantidad({ rotulo, children }) {
  return (
    <div className="w-35p">
      <div className="text-sm2 sunmi-text-muted truncate">{rotulo}</div>
      {children}
    </div>
  );
}

/**
 * La línea revisada, en un renglón: icono, nombre (que cede ante nada: es lo
 * que dice sobre qué línea se trabaja) y lo de la derecha.
 *
 * Con `onTocar`, la fila ENTERA es el área tocable, con un `SunmiLinkButton`:
 * hace falta un `<button>` de verdad —tocable con teclado, con foco— y SIN caja,
 * porque la fila ya tiene la suya, que es la tarjeta. Los colores de
 * `SunmiButton` traen fondo propio y dibujarían una caja adentro de otra. Lo que
 * `SunmiLinkButton` sí trae —subrayado, acento y `text-xs`— lo ceden las clases
 * de acá, que son utilidades y le ganan por el orden de la hoja.
 *
 * `bajoElNombre` (2026-10-28, la preparación con dos depósitos): un renglón
 * chico debajo del nombre —"Lo preparó Depósito Frío"—. Sin él, la fila es la de
 * siempre, nodo por nodo.
 */
export function FilaRevisada({
  icono = null,
  nombre,
  bajoElNombre = null,
  derecha = null,
  tono = "",
  onTocar = null,
  disabled = false,
  ariaLabel,
  ...resto
}) {
  const cuerpo = (
    <div className="flex items-center gap-2">
      {icono}

      {/* El nombre no cede: sin un botón al lado hay lugar para que entre entero. */}
      {bajoElNombre ? (
        <span className="min-w-0 flex-auto text-left">
          <span className="block truncate text-sm2 sunmi-text-strong">{nombre}</span>
          {bajoElNombre}
        </span>
      ) : (
        <span className="min-w-0 flex-auto truncate text-sm2 sunmi-text-strong text-left">
          {nombre}
        </span>
      )}

      {derecha}
    </div>
  );

  return (
    <SunmiCard className={`p-2 ${tono}`} {...resto}>
      {onTocar ? (
        <SunmiLinkButton
          onClick={onTocar}
          disabled={disabled}
          aria-label={ariaLabel}
          className="block w-full text-left no-underline text-sm2 sunmi-text-strong"
        >
          {cuerpo}
        </SunmiLinkButton>
      ) : (
        cuerpo
      )}
    </SunmiCard>
  );
}
