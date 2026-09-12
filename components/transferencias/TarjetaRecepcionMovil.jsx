"use client";

// LA TARJETA DE UN PRODUCTO MIENTRAS SE RECIBE, EN EL TELÉFONO — V15.
//
// ── POR QUÉ UN ARCHIVO NUEVO Y NO UNA VARIANTE DE `FilaProducto` ──────────
//
// `FilaProducto` la dibujan LAS DOS superficies: el teléfono y la lista de
// escritorio. Es una tarjeta que se toca entera y no tiene ningún control
// adentro — abrir la ficha es todo lo que hace.
//
// Esta tarjeta es otra cosa: tiene un contador, un botón y una fila de chips.
// Meterle eso a `FilaProducto` movería escritorio, que esta tanda no toca y que
// se mide a 1366 con huella exigida en cero. Son dos piezas porque son dos
// comportamientos, no porque se haya copiado una.
//
// ── EL CONTADOR ARRANCA CARGADO ──────────────────────────────────────────
//
// Con lo ENVIADO, no en cero. El caso normal es que llegue todo: si arrancara en
// cero, el operador tendría que teclear la cantidad correcta 77 veces para decir
// "está todo bien". Arrancando cargado, ese caso es un toque a "Coincide".
//
// Y arranca en la escala de la PRESENTACIÓN —6, no 144—, que es la que el
// rótulo de arriba dice. Proponer 144 debajo de un rótulo que dice "6 PACK x24"
// ya rompió esta pantalla una vez: el caso feliz guardaba 144 packs.
//
// ── LA DIFERENCIA SE MIDE EN FÍSICO ──────────────────────────────────────
//
// Con las MISMAS funciones que usa la ficha y que respalda el servidor. 6 packs
// más 1 suelta contra 6 packs enviados es una diferencia aunque los dos números
// de packs sean 6, y si acá se midiera en la presentación la tarjeta diría
// "coincide" sobre una línea que el servidor va a rechazar por falta de motivo.
//
// ── LAS SUELTAS SIGUEN VIVIENDO EN LA FICHA ──────────────────────────────
//
// El contador maneja un número. Un pack incompleto —"5 packs + 7 sueltas"— son
// dos, y aplastarlos en uno es escribir 5,833 packs, que es el error de
// exactitud que todo este modelo evita. Así que la tarjeta ofrece abrir la ficha
// cuando la presentación agrupa, y ahí está el desglose completo. No se pierde
// ninguna capacidad: se saca del camino del 95 % de los casos.

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiChipsFiltro from "@/components/sunmi/SunmiChipsFiltro";

import { formatearMoneda } from "@/lib/moneda";
import {
  chipsDeMotivo,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
} from "@/lib/transferencias/recepcionUI";
import {
  descriptorDeEnvio,
  nombreDePresentacion,
  agrupa,
  rotuloConSueltas,
} from "@/lib/transferencias/presentacionEnvio";

/** El motivo que además pide un texto. Es un valor de la base, no una etiqueta. */
const MOTIVO_OTRO = "Otro";

export const TEXTO_COINCIDE = "✓ Coincide";
export const TEXTO_MOTIVO_OBLIGATORIO = "Motivo obligatorio";
export const TEXTO_CARGA_NO_DECLARADO = "Cargá la cantidad que llegó";

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
  onDesmarcar,
}) {
  const envio = descriptorDeEnvio(d || {});
  const esAgregada = d?.agregadoEnRecepcion === true;

  // Lo persistido gana sobre lo propuesto; un 0 guardado NO se vuelve a
  // proponer como "todo bien", porque 0 es un conteo hecho.
  const propuesto = d?.cantidadRecibida == null ? envio.cantidad : d.cantidadRecibida;

  const [cantidad, setCantidad] = useState(() => Number(esAgregada ? (d?.cantidadRecibida ?? 0) : propuesto) || 0);
  const [motivo, setMotivo] = useState(() => d?.motivoPrincipal || "");
  const [detalle, setDetalle] = useState(() => d?.motivoDetalle || "");
  const [error, setError] = useState("");

  if (!d) return null;

  const revisado = d.revisadoEnRecepcion === true;
  const presentacion = nombreDePresentacion(envio);
  const sueltasGuardadas = Number(d.recibidoUnidadesSueltas || 0);
  const puedeTenerSueltas = agrupa(envio.presentacion);

  // ── LAS FÍSICAS, CON EL FACTOR CONGELADO Y LA ESCALA CANÓNICA ───────────
  //
  // De `recepcionUI`, la MISMA fuente que usa la barra de cierre. Con una copia
  // acá, la tarjeta podría decir "diferencia" mientras el botón de abajo dice
  // que no hay ninguna — sobre la misma línea y en la misma pantalla.
  const fisicasContadas = fisicasRecibidasDe(d, { cantidad, sueltas: sueltasGuardadas });
  const fisicasEnviadas = fisicasEnviadasDe(d);

  // Los chips salen del signo, con la misma función que respalda el servidor.
  const chips = chipsDeMotivo({
    enviada: fisicasEnviadas,
    recibida: fisicasContadas,
    agregadoEnRecepcion: esAgregada,
  });
  const hayDiferencia = chips.length > 0;
  const faltaMotivo = hayDiferencia && (!motivo || (motivo === MOTIVO_OTRO && !detalle.trim()));

  const delta =
    fisicasContadas == null || fisicasEnviadas == null ? null : fisicasContadas - fisicasEnviadas;

  const guardar = async (cant, motivoElegido, detalleElegido) => {
    setError("");
    const r = await onRevisar?.({
      detalleId: d.id,
      recibido: cant,
      recibidoUnidadesSueltas: sueltasGuardadas,
      motivoPrincipal: motivoElegido || null,
      motivoDetalle: motivoElegido === MOTIVO_OTRO ? detalleElegido : null,
    });
    if (r && r.ok === false) setError(r.error || "No se pudo guardar la revisión.");
  };

  // ── 3 · REVISADO: UNA SOLA LÍNEA ─────────────────────────────────────────
  //
  // Hay 77 líneas. Una tarjeta revisada que siga ocupando seis renglones empuja
  // el trabajo que falta abajo de todo.
  if (revisado) {
    return (
      <SunmiCard className="p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />
            <span className="min-w-0 truncate text-sm2 sunmi-text-strong">{d.nombre}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-sm2 sunmi-text-muted">
            {rotuloConSueltas({ ...envio, cantidad: d.cantidadRecibida ?? 0, sueltas: sueltasGuardadas })}
            {delta === 0 ? " · coincide" : ""}{" "}
            <span className="tabular-nums sunmi-text-strong">{formatearMoneda(d.subtotal)}</span>
          </span>
        </div>
        {puedeRecibir && (
          <div className="pt-1">
            <SunmiButton color="slate" onClick={() => onDesmarcar?.(d)} className="w-full justify-center">
              Volver a contar
            </SunmiButton>
          </div>
        )}
      </SunmiCard>
    );
  }

  // ── 1, 2 y 4 · PENDIENTE / DIFERENCIA / NO DECLARADO ─────────────────────
  //
  // El tono de la tarjeta lo decide el estado, con las clases del kit: warning
  // cuando el contador se separó de lo enviado, danger cuando el producto ni
  // siquiera estaba en el remito. Nada de colores escritos a mano.
  const tono = esAgregada ? "sunmi-state-danger" : hayDiferencia ? "sunmi-state-warning" : "";

  return (
    <SunmiCard className={`p-3 space-y-2 ${tono}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold sunmi-text-strong break-words">{d.nombre}</span>
        <span className={`shrink-0 text-sm2 ${esAgregada ? "sunmi-text-danger" : hayDiferencia ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
          {esAgregada ? "No declarado" : hayDiferencia ? "Diferencia" : "Pendiente"}
        </span>
      </div>

      {/* La referencia de arriba: qué mandó el depósito y a qué precio. En una
          línea no declarada el remito no dice nada, y por eso se dice otra cosa
          en vez de inventar un "Enviado 0". */}
      <p className="text-sm2 sunmi-text-muted truncate">
        {esAgregada
          ? TEXTO_CARGA_NO_DECLARADO
          : `Enviado ${rotuloConSueltas(envio)} · ${formatearMoneda(d.precioCosto)}`}
      </p>

      {/* ── LA PRESENTACIÓN A LA IZQUIERDA, EL CONTADOR A LA DERECHA ──────── */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm2 sunmi-text-muted">{presentacion}</span>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg p-1 ${
            hayDiferencia ? "sunmi-state-warning" : "sunmi-border"
          }`}
        >
          <SunmiButton
            color="slate"
            onClick={() => setCantidad((n) => Math.max(0, Number(n) - 1))}
            disabled={!puedeRecibir || guardando || cantidad <= 0}
            aria-label={`Restar uno a ${d.nombre}`}
          >
            <Minus size={16} aria-hidden="true" />
          </SunmiButton>
          <span className="tabular-nums font-semibold sunmi-text-strong" aria-live="polite">
            {fmtCant(cantidad)}
          </span>
          <SunmiButton
            color="slate"
            onClick={() => setCantidad((n) => Number(n) + 1)}
            disabled={!puedeRecibir || guardando}
            aria-label={`Sumar uno a ${d.nombre}`}
          >
            <Plus size={16} aria-hidden="true" />
          </SunmiButton>
        </span>
      </div>

      {/* Las sueltas no caben en un contador de un número. La ficha sigue siendo
          el lugar donde se cargan, y desde acá se llega de un toque. */}
      {puedeRecibir && puedeTenerSueltas && (
        <SunmiButton color="slate" onClick={() => onAbrirFicha?.(d)} className="w-full justify-center">
          {sueltasGuardadas > 0
            ? `Unidades sueltas · ${fmtCant(sueltasGuardadas)}`
            : "Cargar unidades sueltas"}
        </SunmiButton>
      )}

      {/* ── 2 · LA DIFERENCIA SE DISPARA SOLA ───────────────────────────────
          No hay botón de "agregar diferencia": aparece cuando el contador se
          separa de lo enviado, y desaparece cuando vuelve a coincidir. */}
      {hayDiferencia && (
        <div className="space-y-1.5 rounded-lg p-2 sunmi-state-warning-soft">
          {delta != null && !esAgregada && (
            <p className="text-sm2 sunmi-text-muted">
              Enviado {fmtCant(fisicasEnviadas)} · contaste {fmtCant(fisicasContadas)} ·{" "}
              {delta < 0 ? "faltan" : "sobran"} {fmtCant(Math.abs(delta))}
            </p>
          )}
          <p className="text-sm2 font-semibold sunmi-text-warning">{TEXTO_MOTIVO_OBLIGATORIO}</p>
          <SunmiChipsFiltro
            opciones={chips}
            valor={motivo || null}
            onCambiar={(v) => setMotivo(v == null ? "" : String(v))}
            textoTodas={null}
            rotulo={null}
          />
          {motivo === MOTIVO_OTRO && (
            <SunmiInput
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Detallá el motivo"
              aria-label={`Detalle del motivo de ${d.nombre}`}
            />
          )}
        </div>
      )}

      {error && <p className="text-sm2 sunmi-text-danger">{error}</p>}

      {/* ── EL CIERRE DE LA LÍNEA ───────────────────────────────────────────
          Sin diferencia el botón dice "Coincide" y guarda lo enviado de un
          toque. Con diferencia dice qué falta hacer y no se destraba hasta que
          haya motivo — la tarjeta NO puede quedar revisada sin él, y el
          servidor lo vuelve a exigir. */}
      {puedeRecibir && (
        <div className="flex items-center justify-between gap-2">
          <SunmiButton
            color={hayDiferencia ? "amber" : "cyan"}
            onClick={() => guardar(cantidad, hayDiferencia ? motivo : null, detalle)}
            disabled={guardando || faltaMotivo}
            className="min-w-0 flex-1 justify-center"
          >
            {hayDiferencia ? (faltaMotivo ? "Elegí un motivo" : "Guardar diferencia") : TEXTO_COINCIDE}
          </SunmiButton>
          <span className="shrink-0 whitespace-nowrap text-sm2 sunmi-text-muted">
            <span className="tabular-nums font-semibold sunmi-text-strong">
              {formatearMoneda(d.subtotal)}
            </span>
          </span>
        </div>
      )}
    </SunmiCard>
  );
}
