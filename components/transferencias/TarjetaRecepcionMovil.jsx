"use client";

// LA TARJETA DE UN PRODUCTO MIENTRAS SE RECIBE, EN EL TELÉFONO — V21.
//
// ── LO QUE CAMBIÓ, Y NO ES ESTÉTICA ──────────────────────────────────────
//
// La tarjeta DEJÓ DE EDITAR CANTIDADES. Hasta el V16 tenía un contador − / +,
// un enlace a "Cargar sueltas" y una fila de chips de motivo: tres formas de
// escribir el mismo dato, repartidas entre la tarjeta y el panel.
//
// Ahora la cantidad se toca en UN solo lugar —`FichaProductoRecepcion`, el panel
// que ya existía y que se abre con "Corregir"— y la tarjeta se ocupa de lo que
// una tarjeta hace bien: decir qué hay, qué falta y cuánto vale.
//
// ── EL MOTIVO DE FONDO: EL CONTADOR NO SERVÍA PARA TODO EL CATÁLOGO ──────
//
// Un contador de a uno supone que la cantidad es un entero chico. "Jamón cocido,
// 3,250 KG" no se cuenta tocando + tres mil doscientas cincuenta veces, y un
// pack incompleto —"5 cajones + 7 sueltas"— son DOS números que un contador de
// uno solo no puede representar sin aplastarlos en 5,833 cajones, que es
// exactamente el error de exactitud que este modelo evita.
//
// O sea que el contador nunca cubrió el catálogo entero: cubría el caso fácil y
// mandaba el resto al panel. El panel, que ya sabía los dos casos, ahora es el
// único camino y no hay dos lugares que puedan decir cosas distintas.
//
// ── DOS TOQUES, CADA UNO EN UNA ESQUINA FIJA ─────────────────────────────
//
// "✓ Coincide" arriba a la derecha: el caso feliz —llegó todo lo que decía el
// remito— en un toque, sin abrir nada. "Corregir" abajo a la izquierda: todo lo
// demás. Que cada acción esté SIEMPRE en el mismo lugar importa con la
// mercadería en una mano y el teléfono en la otra.
//
// ── LA TARJETA NO TIENE ESTADO DE NEGOCIO ────────────────────────────────
//
// Todo lo que dibuja se deriva de `d`. Lo único suyo es el mensaje de error de
// un guardado que falló. Antes tenía cuatro `useState` —cantidad, motivo,
// detalle, error— y esa cantidad local era una segunda fuente de verdad: podía
// decir "coincide" sobre una línea que el servidor iba a rechazar.
//
// ── LA DIFERENCIA SE MIDE EN FÍSICO ──────────────────────────────────────
//
// Con las MISMAS funciones que usa la barra de cierre y que respalda el
// servidor. 6 packs más 1 suelta contra 6 packs enviados es una diferencia
// aunque los dos números de packs sean 6; medirlo en la presentación haría que
// la tarjeta dijera "coincide" sobre una línea sin motivo.

import { useState } from "react";
import { Check } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import { formatearMoneda } from "@/lib/moneda";
import { chipsDeMotivo, fisicasEnviadasDe, fisicasRecibidasDe } from "@/lib/transferencias/recepcionUI";
import {
  descriptorDeEnvio,
  nombreDePresentacion,
  rotuloConSueltas,
  rotuloFisicoDeEnvio,
  unidadDeDiferencia,
} from "@/lib/transferencias/presentacionEnvio";

export const TEXTO_COINCIDE = "✓ Coincide";
export const TEXTO_CORREGIR = "Corregir";
export const TEXTO_CARGA_NO_DECLARADO = "Cargá la cantidad que llegó";

/**
 * Las dos clases de acción de la tarjeta, y por qué son distintas.
 *
 * `accent-soft` trae fondo tenue y `accent-outline` solo el contorno: las dos
 * salen de `--pos-accent` y ninguna escribe un color. La jerarquía es a
 * propósito — "Coincide" cierra la línea sin abrir nada y "Corregir" lleva al
 * panel, así que no pueden pesar igual en la misma tarjeta.
 *
 * ── POR QUÉ VAN EN `className` Y NO COMO `color` ────────────────────────
 *
 * `SunmiButton` enumera sus colores y estos dos no están en esa lista, a
 * propósito: el candado del kit lee `.sunmi-btn-<una-sola-palabra>` como color, y
 * las variantes con guión quedan afuera por la forma del nombre. Conviven con el
 * `sunmi-btn-<color>` que el componente agrega igual, y ganan porque
 * `styles/sunmi.css` las define DESPUÉS del bloque de colores. Eso no es un
 * accidente que haya que recordar: `variantesDeAccion.test.mjs` lo exige.
 */
const CLASE_COINCIDE = "sunmi-btn-accent-outline";
const CLASE_CORREGIR = "sunmi-btn-accent-suave";

/** Cantidades: enteras sin decimales, fraccionarias con hasta 3 útiles. */
const fmtCant = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Number.isInteger(v) ? v.toLocaleString("es-AR") : v.toLocaleString("es-AR", { maximumFractionDigits: 3 });
};

export default function TarjetaRecepcionMovil({
  d,
  puedeRecibir = false,
  guardando = false,
  onRevisar,
  onAbrirFicha,
}) {
  const [error, setError] = useState("");

  if (!d) return null;

  const envio = descriptorDeEnvio(d);
  const esAgregada = d.agregadoEnRecepcion === true;
  const revisado = d.revisadoEnRecepcion === true;
  const sueltasGuardadas = Number(d.recibidoUnidadesSueltas || 0);

  // ── LAS FÍSICAS, DE LA FUENTE CANÓNICA ──────────────────────────────────
  //
  // Sin argumentos, `fisicasRecibidasDe` lee lo PERSISTIDO y devuelve `null`
  // cuando todavía no se contó nada. Ese `null` es el que hace que una línea
  // recién abierta no tenga diferencia y pueda cerrarse con "Coincide".
  const fisicasContadas = fisicasRecibidasDe(d);
  const fisicasEnviadas = fisicasEnviadasDe(d);

  const chips = chipsDeMotivo({
    enviada: fisicasEnviadas,
    recibida: fisicasContadas,
    agregadoEnRecepcion: esAgregada,
  });
  const hayDiferencia = chips.length > 0;

  const delta =
    fisicasContadas == null || fisicasEnviadas == null ? null : fisicasContadas - fisicasEnviadas;

  // ── 3 · REVISADO: UNA SOLA LÍNEA, Y CON VUELTA ───────────────────────────
  //
  // Hay 77 líneas. Una tarjeta revisada que siga ocupando seis renglones empuja
  // el trabajo que falta abajo de todo.
  //
  // ── POR QUÉ TIENE "Corregir" Y NO ES UN AGREGADO DE MÁS ─────────────────
  //
  // El V21 sacó "Volver a contar", que era una barra a todo el ancho y hacía
  // otra cosa: DESMARCABA sin tocar el conteo. Con el panel eso dejó de hacer
  // falta —se corrige y se vuelve a guardar en un paso—, pero sacarlo sin poner
  // nada dejaba la línea revisada sin ningún camino de vuelta DESDE EL TELÉFONO.
  //
  // Y ahí se recibe: en el local, con la mercadería en la mano y sin una
  // computadora cerca. Contar mal y guardar es normal; que la única forma de
  // arreglarlo sea ir hasta el escritorio, no.
  //
  // Va el MISMO botón chico del pie, no la barra de antes: es la misma acción y
  // el mismo verbo en las dos formas de la tarjeta.
  if (revisado) {
    return (
      <SunmiCard className="p-2" data-tarjeta-recepcion={d.nombre}>
        {/* ── QUÉ CEDE ANCHO Y QUÉ NO, Y NO ES UN DETALLE ──────────────────
            Con el botón en la línea, a 390 px sobra poco. La primera versión
            tenía el bloque de la derecha en `shrink-0`, así que TODO el apretón
            se lo comía el nombre: quedaba "V15 Co…", y una línea se quedó sin
            nombre visible. Justamente el nombre es lo que hay que leer para
            saber qué línea se va a corregir.
            Ahora el que trunca es el rótulo de la cantidad —que es el dato que
            el panel muestra entero apenas se abre— y el nombre y el importe
            conservan su lugar. */}
        <div className="flex items-center gap-2">
          <Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />
          <span className="min-w-0 flex-auto truncate text-sm2 sunmi-text-strong">{d.nombre}</span>
          <span className="min-w-0 truncate text-sm2 sunmi-text-muted">
            {rotuloConSueltas({ ...envio, cantidad: d.cantidadRecibida ?? 0, sueltas: sueltasGuardadas })}
            {delta === 0 ? " · coincide" : ""}
          </span>
          {/* Mismo criterio que el pie: una agregada no tiene importe de
              remito, así que el suyo es el de lo recibido. */}
          <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 sunmi-text-strong">
            {formatearMoneda(esAgregada ? d.subtotalRecibido : d.subtotal)}
          </span>
          {puedeRecibir && (
            <SunmiButton
              onClick={() => onAbrirFicha?.(d)}
              disabled={guardando}
              className={`shrink-0 ${CLASE_CORREGIR}`}
            >
              {TEXTO_CORREGIR}
            </SunmiButton>
          )}
        </div>
      </SunmiCard>
    );
  }

  /** El caso feliz: lo que el remito dice, tal cual, sin abrir el panel. */
  const coincidir = async () => {
    setError("");
    const r = await onRevisar?.({
      detalleId: d.id,
      // En la escala de la PRESENTACIÓN, que es la que el rótulo muestra.
      // Mandar las físicas acá guardaría 144 packs sobre un envío de 6 PACK x24.
      recibido: envio.cantidad,
      recibidoUnidadesSueltas: envio.sueltas || 0,
      motivoPrincipal: null,
      motivoDetalle: null,
    });
    if (r && r.ok === false) setError(r.error || "No se pudo guardar la revisión.");
  };

  // ── 1, 2 y 4 · PENDIENTE / DIFERENCIA / NO DECLARADO ─────────────────────
  //
  // El tono lo decide el estado, con las clases del kit: warning cuando lo
  // contado se separó de lo enviado, danger cuando el producto ni siquiera
  // estaba en el remito. Nada de colores escritos a mano.
  const tono = esAgregada ? "sunmi-state-danger" : hayDiferencia ? "sunmi-state-warning" : "";

  // ── FILA 2: QUÉ HAY, EN TEXTO ────────────────────────────────────────────
  //
  // Mientras nadie contó, la referencia es la presentación del envío. En cuanto
  // hay un conteo guardado, lo que importa es ESE número y no el del remito.
  //
  // `rotuloFisicoDeEnvio` devuelve `null` en KG, PIEZA y UNIDAD a propósito:
  // llamar "unidades físicas" a 3,250 KG es la mentira que ese helper existe
  // para no decir.
  const tieneConteo = d.cantidadRecibida != null;
  const fisicoDelEnvio = rotuloFisicoDeEnvio(envio);
  const queHay = tieneConteo
    ? `Recibido ${rotuloConSueltas({ ...envio, cantidad: d.cantidadRecibida, sueltas: sueltasGuardadas })}`
    : `${nombreDePresentacion(envio)}${fisicoDelEnvio ? ` · ${fisicoDelEnvio}` : ""}`;

  // ── EL AVISO DE DIFERENCIA, EN UNA LÍNEA ─────────────────────────────────
  //
  // La unidad se nombra solo cuando decir el número pelado sería ambiguo: en KG
  // y en PIEZA la diferencia vive en esa escala, en los agrupados son unidades y
  // escribirlo sería ruido en la línea más angosta de la tarjeta.
  const unidadDif = unidadDeDiferencia(envio);
  const sufijoDif = unidadDif === "unidades" ? "" : ` ${unidadDif}`;
  let aviso = null;
  if (esAgregada) {
    // ── EL RÓTULO "No declarado" SE QUEDA, Y NO ES EL MISMO CASO QUE "Pendiente"
    //
    // El V21 saca "Pendiente" porque no dice nada: toda tarjeta que no está
    // colapsada está pendiente, y el rótulo ocupaba el lugar donde ahora va
    // "✓ Coincide". "No declarado" es lo contrario: es la única palabra que
    // explica por qué esta tarjeta está en rojo y por qué no tiene con qué
    // comparar. Sacarlo dejaba el tono como única señal, y un color no se lee.
    //
    // Y no hay remito contra el cual contrastar: no existe "de cuántas". Lo
    // único que se puede afirmar es cuánto entró.
    aviso = `No declarado · ingreso físico ${fmtCant(fisicasContadas ?? 0)}${
      unidadDif === "unidades" ? " unidades" : sufijoDif
    }`;
  } else if (hayDiferencia && delta != null) {
    const falta = delta < 0;
    const abs = Math.abs(delta);
    const verbo = falta ? (abs === 1 ? "falta" : "faltan") : abs === 1 ? "sobra" : "sobran";
    aviso = `Ingreso físico ${fmtCant(fisicasContadas)} de ${fmtCant(fisicasEnviadas)} · ${verbo} ${fmtCant(abs)}${sufijoDif}`;
  }

  return (
    // ── EL ANCLA DEL ARNÉS, Y POR QUÉ ES UN ATRIBUTO Y NO UNA CLASE ────────
    //
    // El arnés necesita leer UNA tarjeta y no la pantalla entera. Lo hacía con
    // una heurística —"el div más chico que contiene el nombre y algún botón"—
    // y el V21 la rompió sin tocarla: al mudar "✓ Coincide" al encabezado, esa
    // fila pasó a contener nombre Y botón, así que ganaba ella y el pie con
    // "Corregir" quedaba afuera. El síntoma era que la tarjeta "no tenía"
    // Corregir cuando sí lo tenía.
    //
    // Un atributo estable no depende de la forma del DOM, que es justamente lo
    // que un rediseño cambia. `SunmiCard` reenvía props de más a propósito.
    <SunmiCard className={`p-4 space-y-3 ${tono}`} data-tarjeta-recepcion={d.nombre}>
      {/* ── FILA 1: NOMBRE, REFERENCIA Y EL CASO FELIZ ─────────────────────
          "✓ Coincide" NO aparece cuando ya hay una diferencia declarada: no
          tiene sentido ofrecer "coincide" en una línea donde alguien ya contó y
          dijo que no coincide. Ahí el único camino es "Corregir". */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-md2 font-semibold sunmi-text-strong break-words">{d.nombre}</p>
          {/* Qué mandó el depósito y a qué precio. Una línea no declarada no
              tiene remito, así que dice otra cosa en vez de inventar
              un "Enviado 0". */}
          <p className="text-xs sunmi-text-muted break-words">
            {esAgregada
              ? TEXTO_CARGA_NO_DECLARADO
              : `Enviado ${rotuloConSueltas(envio)} · ${formatearMoneda(d.precioCosto)}`}
          </p>
        </div>

        {puedeRecibir && !esAgregada && !hayDiferencia && (
          <SunmiButton
            onClick={coincidir}
            disabled={guardando}
            className={`shrink-0 ${CLASE_COINCIDE}`}
          >
            {TEXTO_COINCIDE}
          </SunmiButton>
        )}
      </div>

      {/* ── FILA 2: LO QUE HAY. ES TEXTO, NO UN CONTROL ────────────────── */}
      <p className="text-sm2 sunmi-text-muted break-words">{queHay}</p>

      {aviso && (
        <p
          className={`text-sm2 ${esAgregada ? "sunmi-text-danger" : "sunmi-text-warning"}`}
          aria-live="polite"
        >
          {aviso}
        </p>
      )}

      {error && <p className="text-sm2 sunmi-text-danger">{error}</p>}

      <SunmiSeparator />

      {/* ── FILA 3, EL PIE: LA ACCIÓN A LA IZQUIERDA, EL IMPORTE A LA DERECHA
          Sin rótulo al lado del importe. "Total línea" no le decía nada a nadie:
          en una tarjeta de una línea, el número grande de abajo a la derecha ya
          es el total de esa línea. */}
      <div className="flex items-center justify-between gap-3">
        {puedeRecibir ? (
          <SunmiButton
            onClick={() => onAbrirFicha?.(d)}
            disabled={guardando}
            className={`shrink-0 ${CLASE_CORREGIR}`}
          >
            {TEXTO_CORREGIR}
          </SunmiButton>
        ) : (
          <span />
        )}

        {/* ── DE DÓNDE SALE EL IMPORTE, Y POR QUÉ NO ES SIEMPRE EL MISMO ────
            `subtotal` es el del REMITO: cuánto salió del depósito. Para una
            línea agregada vale CERO y es correcto por definición —de un no
            declarado no salió nada—, pero la tarjeta lo mostraba igual y el
            operador veía $0,00 sobre mercadería que sí llegó. Eso se vio en
            la #195.

            `subtotalRecibido` es lo que vale lo que entró, el MISMO número que
            alimenta `importeCorregido` del resumen. */}
        <span className="shrink-0 whitespace-nowrap tabular-nums text-lg2 font-semibold sunmi-text-strong">
          {formatearMoneda(esAgregada ? d.subtotalRecibido : d.subtotal)}
        </span>
      </div>
    </SunmiCard>
  );
}
