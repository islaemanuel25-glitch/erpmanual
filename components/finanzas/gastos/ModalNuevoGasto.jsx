"use client";

// components/finanzas/gastos/ModalNuevoGasto.jsx
//
// NUEVO GASTO, con su pago inicial si se paga en el momento.
//
// ── LA PANTALLA ARMA EL PEDIDO; LA REGLA LA APLICA EL SERVIDOR ───────────
//
// Acá no se decide si la categoría está activa, si el importe es válido, si el
// turno está abierto ni si la ubicación es del grupo: todo eso lo decide
// `crearGasto` y la respuesta vuelve con su motivo. El formulario solo evita
// pedir lo que no corresponde.
//
// ── LA UBICACIÓN NO SE ELIGE ─────────────────────────────────────────────
//
// El gasto se registra en la ubicación que se OPERA. Se muestra fija —la manda
// el servidor en `ubicacionOperada`— y no viaja en el pedido: la ruta la saca de
// la sesión, y una distinta sería un cruce que rechaza.
//
// ── EL PAGO INICIAL VA EN EL MISMO PEDIDO ────────────────────────────────
//
// "Pagar ahora" manda `pagoInicial` adentro del alta, y el servidor crea el
// gasto, el pago y —si es efectivo— el RETIRO en UNA transacción: o quedan los
// tres o ninguno. No se crea el gasto y después se paga en otro pedido. El pago
// puede ser parcial: el importe del pago no tiene que ser el total.
//
// Medio, origen y turno son `CamposDeOrigenDelPago`, la misma pieza del pago de
// una cuenta y del cierre de una compra. "Queda pendiente / Pagar ahora" es
// `SunmiSelectorDeOpciones`, el selector de pocas opciones del kit.
//
// ── LA CLAVE DEL INTENTO ─────────────────────────────────────────────────
//
// Nace al abrir el formulario y se conserva en cada reintento: si la respuesta
// se pierde y se vuelve a tocar "Crear gasto", el servidor reconoce el intento y
// devuelve el gasto que ya creó —con su pago— en vez de crear otro. La clave del
// pago inicial no se manda: la deriva el servidor del gasto.

import { useEffect, useRef, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import CamposDeOrigenDelPago, { Campo } from "@/components/finanzas/pagos/CamposDeOrigenDelPago";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { MEDIO_PAGO_GASTO, MEDIOS_PAGO_GASTO, ROTULO_MEDIO_GASTO, nuevaClaveDeGasto } from "@/lib/finanzas/gastos";
import { medioTocaLaCaja } from "@/lib/finanzas/pagosProveedores";

export const PAGO_AL_CREAR = Object.freeze({ PENDIENTE: "PENDIENTE", AHORA: "AHORA" });
const OPCIONES_PAGO = Object.freeze([
  { clave: PAGO_AL_CREAR.PENDIENTE, texto: "Queda pendiente" },
  { clave: PAGO_AL_CREAR.AHORA, texto: "Pagar ahora" },
]);
const MEDIOS = MEDIOS_PAGO_GASTO.map((m) => ({ valor: m, texto: ROTULO_MEDIO_GASTO[m] }));

/**
 * EL CUERPO DEL POST, con los campos que acepta la ruta y ninguno más. Sin
 * `localId` —lo pone el servidor— y sin clave del pago inicial.
 */
export function cuerpoDelNuevoGasto(form, clave) {
  const pagaAhora = form.pago === PAGO_AL_CREAR.AHORA;
  const efectivo = medioTocaLaCaja(form.medio);
  return {
    categoriaId: form.categoriaId ? Number(form.categoriaId) : null,
    concepto: form.concepto,
    total: form.total,
    fecha: form.fecha,
    beneficiario: form.beneficiario,
    comprobanteNumero: form.comprobante,
    vencimiento: form.vencimiento || null,
    idempotencyKey: clave,
    pagoInicial: pagaAhora
      ? {
          monto: form.monto,
          medio: form.medio,
          turnoId: efectivo && form.turnoId ? Number(form.turnoId) : null,
          fecha: efectivo ? null : form.fechaPago,
        }
      : null,
  };
}

/** ¿Falta algo para poder mandarlo? El servidor igual lo vuelve a mirar. */
export function faltaAlgoDelNuevoGasto(form) {
  if (!form.categoriaId || !String(form.concepto || "").trim() || !form.total || !form.fecha) return true;
  if (form.pago !== PAGO_AL_CREAR.AHORA) return false;
  return !form.monto || (medioTocaLaCaja(form.medio) && !form.turnoId);
}

const vacio = () => ({
  categoriaId: "",
  concepto: "",
  total: "",
  fecha: hoyArgentinaISO(),
  beneficiario: "",
  comprobante: "",
  vencimiento: "",
  pago: PAGO_AL_CREAR.PENDIENTE,
  monto: "",
  medio: MEDIO_PAGO_GASTO.TRANSFERENCIA,
  turnoId: "",
  fechaPago: hoyArgentinaISO(),
});

export default function ModalNuevoGasto({ abierto, categorias = [], ubicacion = null, onCerrar, onCreado }) {
  const [form, setForm] = useState(vacio);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const claveRef = useRef(null);

  // Cada vez que se abre, arranca limpio y con una clave nueva: abrir otra vez
  // es otro intento.
  useEffect(() => {
    if (!abierto) return;
    claveRef.current = nuevaClaveDeGasto(ubicacion?.id ?? "x");
    setForm(vacio());
    setError("");
    // `ubicacion` NO va: la pantalla la recarga, y eso no es abrir otro intento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Por función: la búsqueda de turnos contesta tarde y no puede pisar lo que se
  // escribió mientras.
  const cambiar = (parcial) => setForm((previo) => ({ ...previo, ...parcial }));
  const pagaAhora = form.pago === PAGO_AL_CREAR.AHORA;
  const efectivo = medioTocaLaCaja(form.medio);

  const crear = async () => {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/finanzas/gastos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpoDelNuevoGasto(form, claveRef.current)),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo registrar el gasto.");
      onCreado?.(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SunmiModalLayout
      open={abierto}
      title="Nuevo gasto"
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      // Es carga: todo lo escrito se perdería con un toque al costado.
      destructivo
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
      footer={
        <div className="flex gap-2 justify-end">
          <SunmiButton color="slate" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="primary" onClick={crear} disabled={enviando || faltaAlgoDelNuevoGasto(form)}>
            {enviando ? "Creando…" : "Crear gasto"}
          </SunmiButton>
        </div>
      }
    >
      <Campo rotulo="Local">
        <div className="text-sm3 sunmi-text-strong break-words">Se registra en: {ubicacion?.nombre || "—"}</div>
      </Campo>

      <Campo rotulo="Categoría">
        <SunmiSelectAdv value={form.categoriaId} onChange={(v) => cambiar({ categoriaId: v })} placeholder="Elegí la categoría">
          {categorias.map((c) => (
            <SunmiSelectOption key={c.id} value={String(c.id)}>
              {c.nombre}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>

      <Campo rotulo="Concepto">
        <SunmiInput value={form.concepto} onChange={(e) => cambiar({ concepto: e.target.value })} placeholder="Qué fue el gasto" aria-label="Concepto" />
      </Campo>

      <Campo rotulo="Importe total">
        <SunmiInput inputMode="decimal" value={form.total} onChange={(e) => cambiar({ total: e.target.value })} placeholder="0,00" aria-label="Importe total" />
      </Campo>

      <Campo rotulo="Fecha">
        <SunmiInput type="date" value={form.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} aria-label="Fecha del gasto" />
      </Campo>

      <Campo rotulo="Beneficiario (opcional)">
        <SunmiInput value={form.beneficiario} onChange={(e) => cambiar({ beneficiario: e.target.value })} placeholder="A quién se le paga" aria-label="Beneficiario" />
      </Campo>

      <Campo rotulo="Comprobante (opcional)">
        <SunmiInput value={form.comprobante} onChange={(e) => cambiar({ comprobante: e.target.value })} placeholder="N° de factura o recibo" aria-label="Comprobante" />
      </Campo>

      <Campo rotulo="Vencimiento (opcional)">
        <SunmiInput type="date" value={form.vencimiento} onChange={(e) => cambiar({ vencimiento: e.target.value })} aria-label="Vencimiento" />
      </Campo>

      <Campo rotulo="Pago">
        <SunmiSelectorDeOpciones opciones={OPCIONES_PAGO} valor={form.pago} onCambiar={(v) => cambiar({ pago: v })} etiqueta="Pago del gasto" />
      </Campo>

      {pagaAhora && (
        <>
          <Campo rotulo="Importe del pago">
            <SunmiInput inputMode="decimal" value={form.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder="0,00" aria-label="Importe del pago" />
          </Campo>

          <CamposDeOrigenDelPago
            activo={abierto && pagaAhora}
            medios={MEDIOS}
            medio={form.medio}
            onMedio={(v) => cambiar({ medio: v })}
            origen={ubicacion}
            turnoId={form.turnoId}
            onTurno={(v) => cambiar({ turnoId: v })}
            onError={setError}
          />

          {!efectivo && (
            <Campo rotulo="Fecha del pago">
              <SunmiInput type="date" value={form.fechaPago} max={hoyArgentinaISO()} onChange={(e) => cambiar({ fechaPago: e.target.value })} aria-label="Fecha del pago" />
            </Campo>
          )}
        </>
      )}

      {error && (
        <SunmiAviso tono="danger" titulo="No se creó">
          {error}
        </SunmiAviso>
      )}
    </SunmiModalLayout>
  );
}
