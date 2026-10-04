"use client";

// components/tesoreria/HojaVerificarEfectivo.jsx
//
// LA HOJA "VERIFICAR EFECTIVO" (Figma D0 18:608, D 18:676, E 18:771).
//
// Dos pasos, como el diseño:
//   1. CONTAR: las entregas incluidas, agrupadas por caja, el total declarado
//      —sale de las entregas y no se edita— y "¿Cuánto contaste realmente?".
//      "Correcto" prepara el contado igual al declarado; "Confirmar importe"
//      toma lo escrito. Ninguno de los dos graba.
//   2. CONFIRMAR: declarado, contado y la diferencia ANTES de confirmar, la
//      observación opcional, y recién ahí "Confirmar verificación" envía.
//
// LO QUE SE ENVÍA es `cuerpoDeVerificacion`: los ids, lo contado, la clave y la
// observación. El declarado y la diferencia que se ven acá son para la persona;
// el servidor los calcula de nuevo con la base y rechaza el pedido si vinieran.
//
// IDEMPOTENCIA. La clave nace al abrir la hoja (un intento) y se conserva en
// cada reintento del MISMO contenido —un corte de red, un error del servidor—:
// el servidor devuelve la misma verificación en vez de crear otra. Si después de
// un error se cambia el importe o la observación, es otro intento y lleva clave
// nueva (`claveParaEnvio`). Mientras hay un envío en vuelo, el botón está
// apagado y un segundo toque no sale (`enviandoRef`).

import { useRef, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { showSuccess } from "@/components/sunmi/SunmiToast";
import { formatearMoneda } from "@/lib/moneda";
import { aCentavos } from "@/lib/caja/efectivoEsperado";
import {
  ESTADO_TESORERIA,
  claveParaEnvio,
  cuerpoDeVerificacion,
  diferenciaPrevia,
  entregasPorCaja,
  leerImporteContado,
  nuevaClaveDeVerificacion,
  totalDeclarado,
} from "@/lib/tesoreria/pantallaTesoreria";

import { BotonTesoreria, InsigniaDeEstado, Renglon, colorDeDiferencia, textoDeDiferencia } from "./PiezasTesoreria";
import { enviarVerificacion } from "./accionesTesoreria";

export const PASO_VERIFICAR = Object.freeze({ CONTAR: "contar", CONFIRMAR: "confirmar" });

/** Las entregas incluidas, por caja, y el total declarado que no se edita. */
export function EntregasIncluidas({ entregas, cajas }) {
  const porCaja = entregasPorCaja(entregas, cajas);
  return (
    <div className="space-y-3">
      <div className="text-xs2 font-semibold sunmi-text-muted tracking-wider">ENTREGAS INCLUIDAS</div>
      {porCaja.map((c) => (
        <Renglon key={c.turnoId} rotulo={c.etiqueta} nota={c.nota} valor={formatearMoneda(c.total)} />
      ))}
      <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 text-xs2">
          <div className="font-semibold sunmi-text-muted tracking-wider">TOTAL DECLARADO</div>
          <div className="sunmi-text-muted opacity-80">Sale de las entregas · no se edita</div>
        </div>
        <output className="text-xl2 font-semibold tabular-nums sunmi-text-strong" data-total-declarado aria-label="Total declarado">
          {formatearMoneda(totalDeclarado(entregas))}
        </output>
      </div>
    </div>
  );
}

/** El campo del importe contado: teclado numérico y el "$" adelante. */
export function CampoContado({ valor, onCambiar, soloLectura = false, invalido = false }) {
  return (
    <div className="space-y-2">
      <label htmlFor="tesoreria-contado" className="block text-sm3 font-semibold sunmi-text-strong">
        ¿Cuánto contaste realmente?
      </label>
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-medium sunmi-text-muted" aria-hidden="true">
          $
        </span>
        <SunmiInput
          id="tesoreria-contado"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Importe que contaste"
          value={valor}
          readOnly={soloLectura}
          onChange={(e) => onCambiar?.(e.target.value)}
          aria-invalid={invalido || undefined}
          className={`flex-1 min-h-toque text-lg3 font-semibold ${invalido ? "sunmi-border-danger" : soloLectura ? "sunmi-border-accent" : ""}`}
        />
      </div>
    </div>
  );
}

/** PASO 1 · CONTAR (D0). */
export function PasoContar({ entregas, cajas, texto, onTexto, onCorrecto, onConfirmarImporte, error }) {
  const leido = leerImporteContado(texto);
  const declarado = totalDeclarado(entregas);
  return (
    <>
      <EntregasIncluidas entregas={entregas} cajas={cajas} />
      <CampoContado valor={texto} onCambiar={onTexto} invalido={Boolean(texto) && Boolean(leido.error)} />
      <div className="flex gap-2.5">
        <BotonTesoreria className="flex-1" onClick={onCorrecto}>
          Correcto
        </BotonTesoreria>
        <BotonTesoreria tipo="secundario" className="flex-1" disabled={Boolean(leido.error)} onClick={onConfirmarImporte}>
          Confirmar importe
        </BotonTesoreria>
      </div>
      <p className="text-sm2 sunmi-text-muted">
        “Correcto” significa que contaste exactamente {formatearMoneda(declarado)}. Si contaste otra cosa, escribila y
        confirmá el importe.
      </p>
      {error ? (
        <SunmiAviso tono="danger" titulo="No se registró">
          {error}
        </SunmiAviso>
      ) : null}
    </>
  );
}

/** PASO 2 · CONFIRMAR (D correcto, E con diferencia). */
export function PasoConfirmar({
  entregas,
  cajas,
  texto,
  contadoCentavos,
  observacion,
  onObservacion,
  onConfirmar,
  onCambiarImporte,
  enviando,
  error,
}) {
  const declarado = totalDeclarado(entregas);
  const diferencia = diferenciaPrevia(declarado, contadoCentavos);
  const conDiferencia = aCentavos(diferencia) !== 0;
  return (
    <>
      <EntregasIncluidas entregas={entregas} cajas={cajas} />
      <CampoContado valor={texto} soloLectura />
      <div className="sunmi-surface rounded-xl border sunmi-border p-3 space-y-2" data-antes-de-confirmar>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 text-xs2 font-semibold sunmi-text-muted tracking-wider">ANTES DE CONFIRMAR</div>
          <InsigniaDeEstado estado={conDiferencia ? ESTADO_TESORERIA.CON_DIFERENCIA : ESTADO_TESORERIA.CORRECTO} />
        </div>
        <Renglon rotulo="Declarado" valor={formatearMoneda(declarado)} />
        <Renglon rotulo="Contado" valor={formatearMoneda(contadoCentavos / 100)} />
        <Renglon
          rotulo="Diferencia Tesorería"
          valor={textoDeDiferencia(diferencia)}
          colorValor={colorDeDiferencia(diferencia)}
          notaValor="contado − declarado"
        />
      </div>
      {conDiferencia && (
        <p className="text-sm2 sunmi-text-warning">
          La diferencia queda registrada en Tesorería, a nombre de esta verificación. No cambia la diferencia de ninguna caja.
        </p>
      )}
      <SunmiTextarea
        // El cuerpo de la hoja es una columna flex con scroll: sin `shrink-0`, con
        // el teclado abierto el campo se aplasta a una raya y no se ve lo escrito.
        className="shrink-0"
        rows={2}
        maxLength={500}
        value={observacion}
        onChange={(e) => onObservacion(e.target.value)}
        placeholder="Observación (opcional)"
        aria-label="Observación de la verificación"
      />
      {error ? (
        <SunmiAviso tono="danger" titulo="No se registró">
          {error}
        </SunmiAviso>
      ) : null}
      <BotonTesoreria onClick={onConfirmar} disabled={enviando} aria-busy={enviando || undefined}>
        {enviando ? "Registrando…" : "Confirmar verificación"}
      </BotonTesoreria>
      <BotonTesoreria tipo="fantasma" onClick={onCambiarImporte} disabled={enviando}>
        Cambiar importe
      </BotonTesoreria>
    </>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.abierto
 * @param {object[]} props.entregas  las PENDIENTES que se verifican, como las da la lectura
 * @param {object[]} props.cajas     `lectura.cajas`, para nombrarlas
 * @param {string} props.subtitulo   "Turno · día"
 * @param {number} props.localId     para la clave del intento
 * @param {function} props.onHecho   después de un éxito confirmado por el servidor
 */
export default function HojaVerificarEfectivo({ abierto, ...props }) {
  // Cada apertura es un intento nuevo: la hoja se monta de cero, con estado y
  // clave en limpio. Cerrada no dibuja nada, igual que el modal del kit.
  if (!abierto) return null;
  return <HojaAbierta {...props} />;
}

function HojaAbierta({ entregas = [], cajas = [], subtitulo, localId, onCerrar, onHecho }) {
  const [paso, setPaso] = useState(PASO_VERIFICAR.CONTAR);
  const [texto, setTexto] = useState("");
  const [contado, setContado] = useState(0);
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const intentoRef = useRef({ clave: null, firma: null });
  const enviandoRef = useRef(false);

  const declarado = totalDeclarado(entregas);

  const prepararCorrecto = () => {
    setTexto(formatearMoneda(declarado, { sinSimbolo: true }));
    setContado(aCentavos(declarado));
    setError("");
    setPaso(PASO_VERIFICAR.CONFIRMAR);
  };
  const prepararImporte = () => {
    const leido = leerImporteContado(texto);
    if (leido.error) {
      setError(leido.error);
      return;
    }
    setContado(leido.centavos);
    setError("");
    setPaso(PASO_VERIFICAR.CONFIRMAR);
  };

  const confirmar = async () => {
    if (enviandoRef.current) return; // doble toque: el segundo no sale
    const cuerpo = cuerpoDeVerificacion({
      cajaMovimientoIds: entregas.map((e) => e.cajaMovimientoId),
      contadoCentavos: contado,
      idempotencyKey: null,
      observacion,
    });
    const intento = claveParaEnvio(intentoRef.current, cuerpo, () => nuevaClaveDeVerificacion(localId));
    intentoRef.current = intento;
    cuerpo.idempotencyKey = intento.clave;

    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    const r = await enviarVerificacion(cuerpo);
    enviandoRef.current = false;
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    showSuccess(r.repetida ? "Esa verificación ya estaba registrada." : "Verificación registrada.");
    onHecho?.(r);
  };

  return (
    <SunmiModalLayout
      open
      title="Verificar efectivo"
      subtitle={subtitulo}
      onClose={enviando ? () => {} : onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      // Es carga: lo contado y la observación se perderían con un toque al costado.
      destructivo
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
    >
      {paso === PASO_VERIFICAR.CONTAR ? (
        <PasoContar
          entregas={entregas}
          cajas={cajas}
          texto={texto}
          onTexto={(t) => {
            setTexto(t);
            setError("");
          }}
          onCorrecto={prepararCorrecto}
          onConfirmarImporte={prepararImporte}
          error={error}
        />
      ) : (
        <PasoConfirmar
          entregas={entregas}
          cajas={cajas}
          texto={texto}
          contadoCentavos={contado}
          observacion={observacion}
          onObservacion={setObservacion}
          onConfirmar={confirmar}
          onCambiarImporte={() => {
            setError("");
            setPaso(PASO_VERIFICAR.CONTAR);
          }}
          enviando={enviando}
          error={error}
        />
      )}
    </SunmiModalLayout>
  );
}
