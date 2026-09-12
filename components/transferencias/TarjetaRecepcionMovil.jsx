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
import { Check, Pencil } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
// La fila colapsada entera es el área tocable, y necesita un `<button>` de
// verdad SIN caja: la tarjeta ya es la caja. Ver el comentario en el render.
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import { formatearMoneda } from "@/lib/moneda";
import {
  chipsDeMotivo,
  correccionDeCantidad,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
} from "@/lib/transferencias/recepcionUI";
// `nombreDePresentacion` y `rotuloFisicoDeEnvio` se importaban para la fila 2,
// que el V26 sacó. Un import que solo sostenía código borrado deja el módulo
// diciendo que depende de algo que ya no usa.
import {
  descriptorDeEnvio,
  rotuloConSueltas,
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

  // ── LOS DOS IMPORTES DE LA LÍNEA ────────────────────────────────────────
  //
  // El endpoint manda los dos y son dos preguntas distintas:
  //
  //   `subtotal`          lo que salió del depósito. No se mueve al contar.
  //   `subtotalRecibido`  lo que vale lo que llegó. Sigue a la corrección, y es
  //                       el MISMO número que el servidor suma para el total
  //                       corregido del documento.
  //
  // Hasta la #191 la tarjeta leía el primero salvo para una agregada, así que
  // corregir 4 a 10 dejaba la línea en $38.000 mientras el total de abajo ya
  // decía $95.000. El número correcto llegaba a la pantalla y nadie lo dibujaba.
  //
  // Se muestran LOS DOS cuando difieren —el documento no se pierde y la
  // corrección se ve— y uno solo cuando no. La flecha es la marca de que hubo
  // corrección: sobre una línea que coincide diría que pasó algo que no pasó.
  //
  // Una agregada no tiene "antes": no venía en el remito, así que su `subtotal`
  // vale cero por definición y mostrarlo sería el $0,00 de la #195.
  const importeRemito = esAgregada ? null : d.subtotal;
  const importeRecibido = d.subtotalRecibido == null ? d.subtotal : d.subtotalRecibido;
  const hayCorreccionDeImporte =
    importeRemito != null && Number(importeRemito) !== Number(importeRecibido);

  // ── 3 · REVISADO: UNA SOLA LÍNEA, Y LA CORREGIDA SE DISTINGUE ────────────
  //
  // Hay 77 líneas. Una tarjeta revisada que siga ocupando seis renglones empuja
  // el trabajo que falta abajo de todo.
  //
  // ── EL DEFECTO QUE EL V23 ARREGLA, VISTO CON 77 LÍNEAS ──────────────────
  //
  // Todas las revisadas se veían IGUALES. Terminado el conteo no había forma de
  // saber cuáles se habían corregido ni cómo había cambiado la plata sin abrir
  // de a una. Y son justamente las que hay que repasar antes de confirmar.
  //
  // Ahora la corregida cambia en cuatro cosas, y las cuatro se leen sin
  // detenerse: borde en warning, lápiz en vez de tilde, la cantidad dicha como
  // corrección —"enviado 6 → contaste 10"— y los dos importes, el viejo tachado.
  // La que coincide queda exactamente como estaba.
  //
  // ── Y EL BOTÓN CON CAJA SE FUE ─────────────────────────────────────────
  //
  // La línea entera pasa a ser tocable. El motivo está medido en producción:
  // con el botón, a 390 px los nombres se truncaban a "DON SATUR BIZCO…" y
  // "COCA CO…". El nombre es lo que dice sobre qué línea se está trabajando, así
  // que gana él. La vuelta no se pierde — se agranda: el área tocable pasa de un
  // botón de 87 px a la fila completa.
  if (revisado) {
    const rotuloCantidad = rotuloConSueltas({
      ...envio,
      cantidad: d.cantidadRecibida ?? 0,
      sueltas: sueltasGuardadas,
    });
    // "Corregida" es lo MISMO que mide la barra de abajo —`contarCorregidas`— y
    // por eso se deriva del mismo par de físicas. Con dos criterios distintos,
    // la lista podría marcar tres y el pie decir dos.
    const corregida = !esAgregada && delta != null && delta !== 0;

    const cuerpo = (
      <div className="flex items-center gap-2">
        {corregida ? (
          <Pencil size={16} aria-hidden="true" className="shrink-0 sunmi-text-warning" />
        ) : (
          <Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />
        )}

        {/* El nombre no cede: sin el botón hay lugar para que entre entero. */}
        <span className="min-w-0 flex-auto truncate text-sm2 sunmi-text-strong text-left">
          {d.nombre}
        </span>

        <span
          className={`min-w-0 truncate text-sm2 text-right ${
            corregida ? "sunmi-text-warning" : "sunmi-text-muted"
          }`}
        >
          {/* La MISMA función que usa la tarjeta abierta cuando ya hay conteo y
              todavía no se revisó: es el mismo hecho en otro momento.

              Perdió dos palabras con el V26 —decía "enviado 6 → contaste 4 PACK
              x24"—. La flecha ya dice de qué a qué, y acá esos dos rótulos
              competían por el ancho con el nombre del producto, que es lo que
              dice sobre qué línea se está trabajando. El caso está medido cuatro
              párrafos más arriba: con el botón puesto, los nombres se truncaban
              a "DON SATUR BIZCO…". */}
          {corregida
            ? correccionDeCantidad({
                enviadas: envio.cantidad,
                recibidas: d.cantidadRecibida ?? 0,
                sueltas: sueltasGuardadas,
                envio,
              })
            : `${rotuloCantidad}${delta === 0 ? " · coincide" : ""}`}
        </span>

        {/* ── LOS DOS IMPORTES, APILADOS ──────────────────────────────────
            El viejo arriba, chico y tachado; el corregido abajo, en warning.
            Tachado y no solo gris: el tachado dice "esto ya no vale", que es
            otra cosa que "esto es secundario". */}
        {corregida && hayCorreccionDeImporte ? (
          <span className="shrink-0 whitespace-nowrap text-right">
            <span className="block text-xs2 tabular-nums line-through sunmi-text-muted">
              {formatearMoneda(importeRemito)}
            </span>
            <span className="block text-sm2 tabular-nums font-semibold sunmi-text-warning">
              {formatearMoneda(importeRecibido)}
            </span>
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 sunmi-text-strong">
            {formatearMoneda(importeRecibido)}
          </span>
        )}
      </div>
    );

    // El borde de la tarjeta es lo que se ve barriendo la lista sin leer nada.
    const tonoTarjeta = corregida ? "sunmi-state-warning border-1.5" : "";

    return (
      <SunmiCard className={`p-2 ${tonoTarjeta}`} data-tarjeta-recepcion={d.nombre}>
        {puedeRecibir ? (
          // ── POR QUÉ `SunmiLinkButton` Y NO `SunmiButton` ───────────────
          //
          // Hace falta un `<button>` de verdad —tocable con teclado, con foco—
          // y SIN caja: la fila ya tiene la suya, que es la tarjeta. Los
          // colores de `SunmiButton` traen fondo propio y dibujarían una caja
          // adentro de otra. `SunmiLinkButton` no trae ninguno; lo que sí trae
          // —subrayado, acento y `text-xs`— lo ceden las clases de acá, que son
          // utilidades y le ganan por el orden de la hoja.
          <SunmiLinkButton
            onClick={() => onAbrirFicha?.(d)}
            disabled={guardando}
            aria-label={`Corregir ${d.nombre}`}
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

  const tieneConteo = d.cantidadRecibida != null;
  // ── ACÁ SE ARMABA LA FILA 2, Y SE FUE ───────────────────────────────────
  //
  // `queHay` decía "PACK x12 · 12 unidades físicas" cuando no había conteo, y
  // "Recibido 4 PACK x6 + 3 unidades sueltas" cuando sí. La primera forma era la
  // presentación dicha por SEGUNDA vez —ya estaba arriba, en el enviado— más las
  // físicas, que son la misma cantidad en la escala en la que no se cuenta.
  //
  // La segunda sí traía un dato propio: cuánto conté. Ese no se perdió, subió al
  // renglón de arriba y con la forma de la línea corregida.
  //
  // La regla de que a 3,250 KG no se le dice "3,250 unidades físicas" no vivía
  // acá: vive en `rotuloFisicoDeEnvio`, con sus cinco candados en
  // `presentacionEnvio.test.mjs`, uno por presentación. Sacar esta línea no la
  // afloja.

  // ── LO CONTADO, CUANDO DIFIERE Y TODAVÍA NO SE REVISÓ ───────────────────
  //
  // La MISMA función que usa la línea ya revisada y corregida. Dos redacciones
  // para el mismo hecho se separan el día que una cambia, y esta pantalla ya se
  // comió ese defecto una vez.
  const correccionPendiente =
    !esAgregada && hayDiferencia && tieneConteo
      ? correccionDeCantidad({
          enviadas: envio.cantidad,
          recibidas: d.cantidadRecibida,
          sueltas: sueltasGuardadas,
          envio,
        })
      : null;

  // ── EL AVISO, QUE AHORA ES SOLO EL DEL NO DECLARADO ─────────────────────
  //
  // El de diferencia —"Ingreso físico 4 PACK x24 de 6 PACK x24 · faltan 48
  // unidades"— se fue: decía el enviado que ya está arriba, lo contado que ahora
  // está arriba también, y la resta de los dos.
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
          {/* ── QUÉ MANDÓ EL DEPÓSITO, Y QUÉ CONTÉ SI YA CONTÉ ─────────────
              Una línea no declarada no tiene remito, así que dice otra cosa en
              vez de inventar un "Enviado 0".

              ── EL V26 LE SACÓ EL PRECIO ───────────────────────────────────
              Decía "Enviado 1 PACK x12 · $47.400,00". El importe ya está abajo
              a la derecha y en grande: eran dos datos distintos peleando por el
              mismo renglón, y el de acá salía en gris chico. Y la presentación
              aparecía DOS veces en la tarjeta, las dos en gris: acá y en la fila
              de abajo. Ahora está una sola vez y con peso.

              ── Y CUANDO YA HAY UN CONTEO DISTINTO, LO DICE ACÁ ────────────
              Es el mismo hecho que la línea ya corregida —conté algo distinto
              del remito—, en otro momento: todavía sin revisar. Se dibuja igual,
              con la misma función y en warning. Son 7 líneas en producción,
              contadas el 2026-09-12 sobre las transferencias abiertas. */}
          {esAgregada ? (
            <p className="text-xs sunmi-text-muted break-words">{TEXTO_CARGA_NO_DECLARADO}</p>
          ) : correccionPendiente ? (
            <p className="text-base2 font-semibold tabular-nums sunmi-text-warning break-words">
              {correccionPendiente}
            </p>
          ) : (
            <p className="flex items-baseline gap-2 break-words">
              <span className="text-xs sunmi-text-muted shrink-0">Enviado</span>
              <span className="text-base2 font-semibold tabular-nums sunmi-text-accent">
                {rotuloConSueltas(envio)}
              </span>
            </p>
          )}
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

      {/* La fila 2 se fue con el V26. Ver arriba, donde se armaba `queHay`.
          La tarjeta queda en TRES filas: el nombre con el enviado y «Coincide»,
          el separador, y el pie con «Corregir» y el importe. */}

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

        {/* ── EL IMPORTE, CON SU ANTES CUANDO LO HAY ─────────────────────
            El del remito primero y en gris chico, la corrección después y en
            grande: se lee "de cuánto era" → "cuánto es". El orden no es
            decorativo — invertido diría que el documento cambió y no cambió.
            Ver el bloque de arriba para por qué son dos campos. */}
        <span className="shrink-0 whitespace-nowrap tabular-nums text-lg2 font-semibold sunmi-text-strong">
          {hayCorreccionDeImporte && (
            <span className="text-sm2 font-normal sunmi-text-muted">
              {formatearMoneda(importeRemito)} →{" "}
            </span>
          )}
          {formatearMoneda(importeRecibido)}
        </span>
      </div>
    </SunmiCard>
  );
}
