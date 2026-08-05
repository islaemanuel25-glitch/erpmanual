"use client";

// Los tres bloques de la pantalla de retiro, como componentes de presentación.
//
// NO son pasos. Se ven los tres a la vez: en escritorio en tres columnas, en
// móvil uno debajo del otro. El flujo anterior los partía en pasos numerados con
// Anterior y Siguiente, y eso escondía justo lo que hay que mirar junto —cuánto
// hay, qué queda y cuánto sale—, además de sugerir que el retiro se elige.
//
// POR QUÉ VIVEN ACÁ Y NO DENTRO DE LA PÁGINA
//
// La página tiene estado, efectos y fetch: renderizarla en una prueba deja todo
// en "cargando" y no ejercita nada del JSX que ve el cajero. Ya pasó una vez que
// un identificador sin importar llegó a producción porque ninguna prueba
// ejecutaba ese JSX. Acá todo entra por props y no se llama a nada.
//
// Ninguno decide: no calculan importes ni validan. Eso vive en lib/caja.

import { useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { TriangleAlert } from "lucide-react";

import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import GrillaCambio from "@/components/caja/GrillaCambio";
import { Cifra, Fila, money, tonoDiferencia } from "@/components/caja/CifrasRetiro";
import { CABECERA_BLOQUE, BLOQUE_ALINEADO } from "@/components/caja/geometriaGrilla";
import { filasDesglose, CLAVE_MONEDAS } from "@/lib/caja/conteoBilletes";

export function Aviso({ children, tono = "warning" }) {
  const clase =
    tono === "danger"
      ? "sunmi-state-danger sunmi-text-danger"
      : tono === "info"
      ? "sunmi-surface-soft sunmi-text-muted"
      : "sunmi-state-warning sunmi-text-warning";
  return (
    <div className={`${clase} sunmi-border rounded-lg p-2 text-[11px] leading-snug flex items-start gap-2`}>
      {tono !== "info" && <TriangleAlert size={14} className="shrink-0 mt-0.5" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Tarjeta de un bloque.
 *
 * `alineado` lo usan los DOS bloques de grilla: reserva la misma altura para la
 * cabecera y estira la tarjeta, para que sus filas queden a la misma altura en
 * escritorio. Ver geometriaGrilla.
 */
function Bloque({ titulo, ayuda, children, className = "", alineado = false }) {
  return (
    <SunmiCard className={`p-3 space-y-2 ${alineado ? BLOQUE_ALINEADO : ""} ${className}`}>
      <div className={alineado ? CABECERA_BLOQUE : ""}>
        <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{titulo}</h2>
        {ayuda && <p className="text-[11px] sunmi-text-muted leading-snug mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </SunmiCard>
  );
}

// ── Contar ──────────────────────────────────────────────────────────────────

/**
 * Contar el cajón. SIEMPRE por denominación.
 *
 * El modo "monto total" desapareció. Escribir un número suelto y contar billete
 * por billete no son dos maneras de hacer lo mismo: del desglose depende el tope
 * de cuántos billetes pueden quedar como cambio, y sin él ese control no existe.
 * Un total tipeado también admite el error que el conteo detecta —poner 150.000
 * de memoria y que en el cajón haya 140.000— y ahí la diferencia aparece recién
 * en el arqueo siguiente, cuando ya no se sabe de dónde salió.
 *
 * El total es SOLO LECTURA: es la suma de las filas, no un dato que se ingrese.
 */
export function PanelConteo({ desglose, onDesglose, horaConteo }) {
  return (
    <Bloque
      titulo="Contar todo el efectivo del cajón"
      ayuda="Ingresá la cantidad de billetes de cada denominación. El total se calcula automáticamente."
      alineado
    >
      <TablaDenominaciones
        desglose={desglose}
        onCambiar={onDesglose}
        idPrefijo="conteo"
        titulo="Cantidad en el cajón"
      />

      {/* El problema operativo real: si el mismo cajón sigue recibiendo plata
          mientras se cuenta, el conteo ya no describe nada. No se bloquean las
          ventas —dejar a la gente esperando es peor— pero tampoco se oculta. */}
      <Aviso>Mientras contás, no deben mezclarse nuevas ventas en el efectivo ya contado.</Aviso>

      {horaConteo && (
        <p className="text-[11px] sunmi-text-muted">Conteo iniciado a las {horaConteo}</p>
      )}
    </Bloque>
  );
}

// ── Movimientos manuales de caja ────────────────────────────────────────────

/**
 * Lo que entró o salió por "Caja +/−" en este turno.
 *
 * Informativo y nada más: sin botones para crear movimientos, porque esa función
 * ya vive en el POS y duplicarla acá invitaría a registrar un gasto en medio de
 * un conteo. Sirve para responder "¿por qué el esperado no es lo que vendí?".
 *
 * NO incluye los retiros de recaudación: esos tienen su propia pantalla y su
 * propio historial. Mezclarlos haría leer un retiro de $103.400 como si alguien
 * hubiera sacado plata a mano.
 */
export const MOVIMIENTOS_VISIBLES = 3;

const horaCorta = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
};

/** Una línea del detalle: hora, tipo, motivo e importe. */
function MovimientoFila({ mov }) {
  const esIngreso = mov?.tipo === "INGRESO";
  const monto = Number(mov?.monto) || 0;
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div className="min-w-0">
        <div className="text-[12px] sunmi-text-strong leading-tight break-words">
          {/* El motivo es obligatorio en Caja +/−; el vacío solo aparece en
              movimientos históricos, y ahí se dice en vez de dejar el renglón
              mudo. */}
          {mov?.motivo || "Sin motivo"}
        </div>
        <div className="text-[10px] sunmi-text-muted leading-tight">
          {horaCorta(mov?.fecha)} · {esIngreso ? "Ingreso" : "Retiro"}
        </div>
      </div>
      <span
        className={`text-[12px] font-mono tabular-nums shrink-0 ${
          esIngreso ? "sunmi-text-strong" : "sunmi-text-warning"
        }`}
      >
        {esIngreso ? "+" : "−"} {money(monto)}
      </span>
    </div>
  );
}

export function PanelMovimientos({ movimientos = null, className = "" }) {
  const ingresos = Number(movimientos?.ingresos) || 0;
  const retiros = Number(movimientos?.retiros) || 0;
  const neto = Number(movimientos?.neto) || 0;
  const detalle = Array.isArray(movimientos?.detalle) ? movimientos.detalle : [];
  const hay = detalle.length > 0 || Math.round((ingresos + retiros) * 100) !== 0;

  const [expandido, setExpandido] = useState(false);
  const visibles = expandido ? detalle : detalle.slice(0, MOVIMIENTOS_VISIBLES);
  const ocultos = detalle.length - visibles.length;

  return (
    <Bloque titulo="Movimientos de caja" className={className}>
      {hay ? (
        <>
          <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
            <Fila label="Ingresos manuales" valor={ingresos} clase="sunmi-text-strong" />
            <Fila
              label="Retiros manuales"
              valor={-retiros}
              clase={retiros ? "sunmi-text-warning" : "sunmi-text-strong"}
            />
            <Fila label="Neto movimientos" valor={neto} clase={tonoDiferencia(neto)} fuerte />
          </div>

          {detalle.length > 0 && (
            <div className="divide-y sunmi-border">
              {visibles.map((m) => (
                <MovimientoFila key={m.id} mov={m} />
              ))}
            </div>
          )}

          {/* Se despliega DENTRO del bloque: abrir un modal para leer tres
              renglones obligaría a cerrar algo antes de seguir contando. */}
          {ocultos > 0 && (
            <button
              type="button"
              onClick={() => setExpandido(true)}
              className="text-[12px] sunmi-text-accent underline"
            >
              Ver todos ({detalle.length})
            </button>
          )}
          {expandido && detalle.length > MOVIMIENTOS_VISIBLES && (
            <button
              type="button"
              onClick={() => setExpandido(false)}
              className="text-[12px] sunmi-text-muted underline"
            >
              Ver menos
            </button>
          )}
        </>
      ) : (
        <p className="text-[12px] sunmi-text-muted leading-snug">
          No hay ingresos ni retiros manuales en este turno.
        </p>
      )}
      <p className="text-[11px] sunmi-text-muted leading-snug">
        No incluye los retiros de recaudación.
      </p>
    </Bloque>
  );
}

// ── Cambio que queda ────────────────────────────────────────────────────────

/**
 * `ayuda` es prop y no texto fijo porque el cierre y el retiro dejan el cambio
 * para destinatarios distintos: en el retiro queda en el cajón para seguir la
 * jornada; en el cierre queda para el operador que releva. La grilla, el tope y
 * la aritmética son idénticos, así que el componente es el mismo.
 */
export function PanelCambio({
  desgloseContado,
  desgloseCambio,
  onDesgloseCambio,
  totalCambio = 0,
  error = null,
  ayuda = "Elegí los billetes y monedas que quedan en el cajón. Todo lo demás se retira.",
}) {
  return (
    <Bloque titulo="Billetes que quedan como cambio" ayuda={ayuda} alineado>
      <GrillaCambio
        desgloseContado={desgloseContado}
        desgloseCambio={desgloseCambio}
        onCambiar={onDesgloseCambio}
        total={totalCambio}
      />
      {error && <Aviso tono="danger">{error}</Aviso>}
    </Bloque>
  );
}

// ── ORDEN NUEVO: el cambio se separa ANTES del corte ────────────────────────
//
// Los cuatro bloques de acá abajo implementan el orden físico correcto, y
// conviven con los de arriba en vez de reemplazarlos: los de arriba siguen
// sirviendo a los cortes que se tomaron con el orden anterior, que eligen el
// cambio recién al final y ya no se pueden rehacer.

// El bloque que contaba el cambio antes del corte vivía acá. Se fue a
// components/caja/ModalCambioPrevio.jsx: esa grilla aparece ahora dentro de un
// modal, no como una columna de la página. Ver el comentario de ese archivo.

/**
 * El cambio ya separado, SOLO LECTURA.
 *
 * Después del corte estas cifras no se pueden tocar: el sobre está publicado y
 * el operador que releva puede haberlo tomado ya. Mostrarlo igual es necesario
 * —el cajero tiene que poder verificar contra qué se está comparando— pero
 * ofrecer un input sería ofrecer algo que el servidor va a rechazar.
 */
export function PanelCambioSeparado({ desglose = {}, total = 0, nota = null, className = "" }) {
  const filas = filasDesglose(desglose).filter((f) => f.cantidad > 0);
  const monedas = Number(desglose?.[CLAVE_MONEDAS]) || 0;

  return (
    <Bloque
      titulo="Cambio ya separado"
      ayuda="Quedó en la caja al tomar el corte. No forma parte de este conteo."
      className={className}
    >
      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        {filas.length === 0 && monedas === 0 ? (
          <p className="text-[12px] sunmi-text-muted leading-snug">
            No se dejó cambio: el cajón quedó vacío.
          </p>
        ) : (
          <>
            {filas.map((f) => (
              <Fila key={f.valor} label={`${f.etiqueta} × ${f.cantidad}`} valor={f.subtotal} />
            ))}
            {monedas > 0 && <Fila label="Monedas / otros" valor={monedas} />}
          </>
        )}
        <div className="pt-1 border-t sunmi-border">
          <Fila label="Total del cambio" valor={total} fuerte />
        </div>
      </div>
      {nota && <Aviso tono="info">{nota}</Aviso>}
    </Bloque>
  );
}

/**
 * Contar ÚNICAMENTE el dinero retirado.
 *
 * Es la misma grilla que el conteo del cajón entero, con otro rótulo y otro
 * aviso. La diferencia importante no está en el componente sino en lo que se le
 * pide a la persona: una sola pila, la que se lleva, sin volver a tocar lo que
 * ya apartó.
 */
export function PanelConteoRetiro({ desglose, onDesglose, horaConteo, aviso }) {
  return (
    <Bloque
      titulo="Contar el dinero retirado"
      ayuda="Ingresá la cantidad de billetes de cada denominación. El total se calcula automáticamente."
      alineado
    >
      <TablaDenominaciones
        desglose={desglose}
        onCambiar={onDesglose}
        idPrefijo="retiro"
        titulo="Cantidad retirada"
      />
      {aviso && <Aviso tono="info">{aviso}</Aviso>}
      {horaConteo && (
        <p className="text-[11px] sunmi-text-muted">Conteo iniciado a las {horaConteo}</p>
      )}
    </Bloque>
  );
}

/** Cifras de cabecera del orden nuevo: se compara retiro contra retiro. */
export function ResumenCabeceraCorte({
  esperado = null,
  cambioSeparado = 0,
  retiroEsperado = null,
  retiroContado = 0,
  hayContado = false,
  diferencia = 0,
  etiquetaEsperado = "Efectivo esperado al corte",
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
      <Cifra label={etiquetaEsperado} valor={esperado ?? "—"} />
      <Cifra label="Cambio separado" valor={cambioSeparado} />
      <Cifra label="Retiro esperado" valor={retiroEsperado ?? "—"} />
      <Cifra
        label="Retiro contado"
        valor={hayContado ? retiroContado : "—"}
        clase="sunmi-text-accent"
        destacado
      />
      <Cifra
        label="Diferencia"
        valor={hayContado ? diferencia : "—"}
        clase={hayContado ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
      />
    </div>
  );
}

/**
 * Resumen y confirmación del orden nuevo.
 *
 * Convive con `PanelResumen` en vez de parametrizarlo con diez props más: las
 * cifras que muestra son OTRAS —retiro esperado contra retiro contado, en vez de
 * esperado contra cajón— y el aviso de "hubo movimientos" desaparece por
 * completo, porque acá los movimientos posteriores no cambian ningún número y
 * pedir una reconfirmación por algo que no afecta al retiro sería ruido.
 */
export function PanelResumenCorte({
  esperado = null,
  cambioSeparado = 0,
  retiroEsperado = null,
  retiroContado = 0,
  hayContado = false,
  diferencia = 0,
  observacion = "",
  onObservacion,
  avisoPosterior = null,
  avisoSobrante = null,
  error = "",
  guardando = false,
  puedeConfirmar = false,
  enPestanaNueva = false,
  onGuardar,
  onVolver,
  onConfirmar,
  filasExtra = null,
  etiquetaEsperado = "Efectivo esperado al corte",
  textoConfirmar = "Confirmar retiro",
  textoConfirmando = "Registrando…",
  textoGuardar = "Guardar borrador",
  textoCerrarPestana = "Cerrar esta pestaña",
  textoVolver = "Guardar y continuar después",
}) {
  return (
    <Bloque titulo="Resumen y confirmación">
      {/* El valor principal: lo que la persona tiene en la mano. */}
      <div className="sunmi-surface sunmi-border rounded-xl px-3 py-3 text-center">
        <div className="text-[11px] sunmi-text-muted leading-tight">Retiro contado</div>
        <div className="text-3xl font-bold font-mono tabular-nums sunmi-text-accent leading-tight break-words">
          {money(hayContado ? retiroContado : 0)}
        </div>
      </div>

      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        <Fila label={etiquetaEsperado} valor={esperado ?? "—"} />
        <Fila label="Cambio separado" valor={cambioSeparado} />
        <Fila label="Retiro esperado" valor={retiroEsperado ?? "—"} fuerte />
        <Fila label="Retiro contado" valor={hayContado ? retiroContado : "—"} clase="sunmi-text-accent" />
        <Fila
          label="Diferencia"
          valor={hayContado ? diferencia : "—"}
          clase={hayContado ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
          fuerte
        />
        {filasExtra}
      </div>

      {/* Informativo y nada más: los números de arriba no se mueven. */}
      {avisoPosterior && <Aviso tono="info">{avisoPosterior}</Aviso>}
      {avisoSobrante && <Aviso>{avisoSobrante}</Aviso>}

      <div>
        <label htmlFor="obs" className="text-xs sunmi-text-muted mb-1 block">
          Observación (opcional)
        </label>
        <SunmiInput
          id="obs"
          value={observacion}
          onChange={(e) => onObservacion?.(e.target.value)}
          placeholder="Ej: se lleva Marcela"
        />
      </div>

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      <div className="space-y-2 pt-1">
        <SunmiButton
          color="amber"
          onClick={onConfirmar}
          disabled={guardando || !puedeConfirmar}
          className="w-full py-3 font-bold"
        >
          {guardando ? textoConfirmando : textoConfirmar}
        </SunmiButton>

        {enPestanaNueva ? (
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton color="slate" onClick={onGuardar} disabled={guardando} className="py-2 !text-xs">
              {textoGuardar}
            </SunmiButton>
            <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="py-2 !text-xs">
              {textoCerrarPestana}
            </SunmiButton>
          </div>
        ) : (
          <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="w-full py-2 !text-xs">
            {textoVolver}
          </SunmiButton>
        )}
      </div>
    </Bloque>
  );
}

// ── Resumen y confirmación ──────────────────────────────────────────────────

/**
 * Resumen y confirmación, compartido por el retiro y el cierre.
 *
 * QUÉ SE PARAMETRIZÓ Y POR QUÉ
 *
 * El bloque es el mismo: mismo valor principal ("Total a retirar"), mismas
 * cifras, misma observación, mismos botones. Lo que cambia entre las dos
 * pantallas es solo el TEXTO —un cierre no dice "Efectivo esperado" sino
 * "Efectivo esperado al corte"— y un par de renglones extra que el cierre agrega
 * (hora del corte y quién cierra). Duplicar 100 líneas de JSX para eso habría
 * garantizado que las dos pantallas se separaran con el primer arreglo que
 * tocara una sola.
 *
 * Todos los parámetros tienen el valor del retiro como default, así que la
 * pantalla de retiro no cambia ni una coma.
 */
export function PanelResumen({
  esperado = null,
  totalContado = 0,
  totalCambio = 0,
  totalRetiro = 0,
  diferencia = 0,
  sinRecaudacion = false,
  hayContado = false,
  observacion = "",
  onObservacion,
  cambios = null,
  error = "",
  guardando = false,
  puedeConfirmar = false,
  enPestanaNueva = false,
  onGuardar,
  onVolver,
  onConfirmar,
  etiquetaEsperado = "Efectivo esperado",
  /** Renglones extra al pie de las cifras (el cierre suma hora y operador). */
  filasExtra = null,
  textoConfirmar = "Confirmar retiro",
  textoConfirmando = "Registrando…",
  textoGuardar = "Guardar borrador",
  textoCerrarPestana = "Cerrar esta pestaña",
  textoVolver = "Guardar y volver al POS",
}) {
  return (
    <Bloque titulo="Resumen y confirmación">
      {/* El valor principal de la pantalla. Todo lo demás lo explica. */}
      <div className="sunmi-surface sunmi-border rounded-xl px-3 py-3 text-center">
        <div className="text-[11px] sunmi-text-muted leading-tight">Total a retirar</div>
        <div className="text-3xl font-bold font-mono tabular-nums sunmi-text-accent leading-tight break-words">
          {money(totalRetiro)}
        </div>
      </div>

      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        <Fila label={etiquetaEsperado} valor={esperado ?? "—"} />
        <Fila label="Efectivo contado" valor={hayContado ? totalContado : "—"} />
        <Fila
          label="Diferencia al contar"
          valor={hayContado ? diferencia : "—"}
          clase={hayContado ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
        />
        <Fila label="Cambio que queda" valor={totalCambio} />
        <Fila label="Total a retirar" valor={totalRetiro} clase="sunmi-text-accent" fuerte />
        {filasExtra}
      </div>

      {sinRecaudacion && hayContado && (
        <Aviso>No hay recaudación para retirar.</Aviso>
      )}

      {/* Hubo movimientos mientras se contaba. No se confirma en silencio y NO
          se toca el efectivo contado: esa plata la contó una persona. */}
      {cambios?.hayCambios && (
        <div className="sunmi-state-warning sunmi-border rounded-lg p-3 space-y-1 text-[12px] sunmi-text-warning">
          <div className="font-bold">Hubo movimientos mientras preparabas el retiro.</div>
          <Fila label="Esperado anterior" valor={cambios.esperadoAnterior} />
          <Fila label="Esperado actual" valor={cambios.esperadoActual} />
          <Fila label="Diferencia" valor={cambios.diferenciaEsperado} />
          {cambios.ventasNuevas && (
            <p className="leading-snug">
              Entraron {cambios.ventasAgregadas} venta{cambios.ventasAgregadas === 1 ? "" : "s"} nueva
              {cambios.ventasAgregadas === 1 ? "" : "s"}.
            </p>
          )}
          {cambios.otroRetiro && <p className="leading-snug">Se registró otro retiro en esta caja.</p>}
          <p className="leading-snug pt-1">
            No tocamos lo que contaste. Revisá la diferencia y confirmá otra vez.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="obs" className="text-xs sunmi-text-muted mb-1 block">
          Observación (opcional)
        </label>
        <SunmiInput
          id="obs"
          value={observacion}
          onChange={(e) => onObservacion?.(e.target.value)}
          placeholder="Ej: se lleva Marcela"
        />
      </div>

      {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}

      <div className="space-y-2 pt-1">
        <SunmiButton
          color="amber"
          onClick={onConfirmar}
          disabled={guardando || !puedeConfirmar}
          className="w-full py-3 font-bold"
        >
          {guardando
            ? textoConfirmando
            : cambios?.hayCambios
              ? "Confirmar con el valor nuevo"
              : textoConfirmar}
        </SunmiButton>

        {/* En una pestaña aparte no hay adónde "volver": el POS sigue abierto en
            la suya. Guardar y cerrar son dos acciones distintas. */}
        {enPestanaNueva ? (
          <div className="grid grid-cols-2 gap-2">
            <SunmiButton color="slate" onClick={onGuardar} disabled={guardando} className="py-2 !text-xs">
              {textoGuardar}
            </SunmiButton>
            <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="py-2 !text-xs">
              {textoCerrarPestana}
            </SunmiButton>
          </div>
        ) : (
          <SunmiButton color="slate" onClick={onVolver} disabled={guardando} className="w-full py-2 !text-xs">
            {textoVolver}
          </SunmiButton>
        )}
      </div>
    </Bloque>
  );
}

// ── Cifras de cabecera ──────────────────────────────────────────────────────

export function ResumenCabecera({
  esperado = null,
  totalContado = 0,
  hayContado = false,
  diferencia = 0,
  totalCambio = 0,
  totalRetiro = 0,
  /**
   * "ahora" en el retiro; "al corte" en el cierre. La distinción no es
   * cosmética: en el cierre ese número quedó congelado y no se mueve aunque el
   * relevo esté vendiendo, y llamarlo "ahora" sería mentir.
   */
  etiquetaEsperado = "Efectivo esperado ahora",
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
      <Cifra label={etiquetaEsperado} valor={esperado ?? "—"} />
      <Cifra label="Efectivo contado" valor={hayContado ? totalContado : "—"} />
      <Cifra
        label="Diferencia"
        valor={hayContado ? diferencia : "—"}
        clase={hayContado ? tonoDiferencia(diferencia) : "sunmi-text-muted"}
      />
      <Cifra label="Cambio que queda" valor={totalCambio} />
      <Cifra label="Total a retirar" valor={totalRetiro} clase="sunmi-text-accent" destacado />
    </div>
  );
}
