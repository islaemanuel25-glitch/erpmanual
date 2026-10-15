"use client";

// components/pos-ventas/ModalPagar.jsx
//
// "PAGAR" DESDE EL POS (Figma EVJ2KvVCrY0oVSowfboymQ: P1 387:576, P2 387:614,
// P3 387:638). El cajero elige qué paga y la plata sale de SU caja abierta, sin
// elegir otra. Cada tipo queda en su módulo; lo decide el servidor
// (`/api/pos-ventas/pagar`, lib/caja/pagarDesdeElPosServer.js).
//
// La foto del remito de un pago a proveedor se sube DESPUÉS del pago, a la
// compra por cargar que el pago dejó, por la subida de comprobantes de siempre:
// si la foto falla, el pago ya está hecho y se dice así.

import { useEffect, useRef, useState } from "react";

import { useOperadorContext } from "@/app/context/OperadorContext";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSolapas from "@/components/sunmi/SunmiSolapas";
import { ETIQUETA_TIPO_EGRESO, TIPO_EGRESO, TIPOS_EGRESO } from "@/lib/caja/tipoEgreso";
import { desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { leerImporte, nuevaClaveDePago } from "@/lib/finanzas/pagosProveedores";
import { formatearMoneda } from "@/lib/moneda";

/** Lo que dice cada opción de P1. */
const DESCRIPCION = Object.freeze({
  [TIPO_EGRESO.PROVEEDOR]: "Pan, migas, mercadería que entra",
  [TIPO_EGRESO.SUELDO]: "A un empleado",
  [TIPO_EGRESO.GASTO]: "Insumos, limpieza, servicios",
  [TIPO_EGRESO.AL_DEPOSITO]: "Mercadería del depósito",
  [TIPO_EGRESO.RETIRO_DUENO]: "Plata que se lleva el dueño",
});

/** El título de cada formulario. */
const TITULO = Object.freeze({
  [TIPO_EGRESO.PROVEEDOR]: "Pago a proveedor",
  [TIPO_EGRESO.SUELDO]: "Sueldo o adelanto",
  [TIPO_EGRESO.GASTO]: "Gasto",
  [TIPO_EGRESO.AL_DEPOSITO]: "Al depósito",
  [TIPO_EGRESO.RETIRO_DUENO]: "Retiro del dueño",
});

const MODALIDADES = [
  { valor: "SUELDO", texto: "Sueldo" },
  { valor: "ADELANTO", texto: "Adelanto" },
];

const VACIO = { proveedorId: "", operadorId: "", modalidad: "SUELDO", categoriaId: "", monto: "", foto: null };

export default function ModalPagar({ turnoId, onClose, onPagado }) {
  const { requerirOperador } = useOperadorContext();
  const [opciones, setOpciones] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [tipo, setTipo] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const clave = useRef(null);
  const inputFoto = useRef(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos-ventas/pagar?turnoId=${turnoId}`, { credentials: "include", cache: "no-store" });
        if (r.status === 428) {
          requerirOperador();
          return;
        }
        const d = await r.json().catch(() => null);
        if (!vigente) return;
        if (!d?.ok) setErrorCarga(d?.error || "No se pudo abrir Pagar.");
        else setOpciones(d);
      } catch {
        if (vigente) setErrorCarga("No se pudo abrir Pagar.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, [turnoId, requerirOperador]);

  const cambiar = (parcial) => setForm((f) => ({ ...f, ...parcial }));
  const elegir = (t) => {
    // Un intento nuevo por formulario abierto: el mismo envío repetido cae en
    // el mismo pago, uno nuevo es otro pago.
    clave.current = nuevaClaveDePago(`pos-${turnoId}`);
    setForm(VACIO);
    setError("");
    setTipo(t);
  };

  const importe = leerImporte(form.monto);
  const monto = importe.error ? null : desdeCentavos(importe.centavos);
  const falta =
    monto == null ||
    (tipo === TIPO_EGRESO.PROVEEDOR && !form.proveedorId) ||
    (tipo === TIPO_EGRESO.SUELDO && !form.operadorId) ||
    (tipo === TIPO_EGRESO.GASTO && !form.categoriaId);

  async function pagar() {
    if (falta || enviando) return;
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/pos-ventas/pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId,
          tipo,
          monto: form.monto,
          idempotencyKey: clave.current,
          proveedorId: form.proveedorId || null,
          operadorId: form.operadorId || null,
          modalidad: form.modalidad,
          categoriaId: form.categoriaId || null,
        }),
      });
      if (r.status === 428) {
        requerirOperador();
        return;
      }
      const d = await r.json().catch(() => null);
      if (!d?.ok) {
        setError(d?.error || "No se pudo registrar el pago.");
        return;
      }
      let errorFoto = null;
      if (tipo === TIPO_EGRESO.PROVEEDOR && form.foto && d.pedidoProveedorId) {
        errorFoto = await subirFoto({ proveedorId: form.proveedorId, pedidoId: d.pedidoProveedorId, foto: form.foto });
      }
      onPagado?.({ tipo, monto, errorFoto });
      onClose();
    } catch {
      setError("Sin conexión: no se sabe si el pago entró. Mirá la caja antes de repetirlo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SunmiModalLayout
      open
      title={tipo ? TITULO[tipo] : "¿Qué vas a pagar?"}
      subtitle={`Caja #${turnoId}`}
      onClose={enviando ? () => {} : onClose}
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2"
      z={NIVEL_MODAL_GLOBAL}
      destructivo
    >
      {errorCarga ? (
        <p role="alert" className="text-sm2 sunmi-text-danger">
          {errorCarga}
        </p>
      ) : !opciones ? (
        <div className="py-8">
          <SunmiLoader />
        </div>
      ) : !tipo ? (
        <div className="grid gap-3">
          {TIPOS_EGRESO.map((t) => (
            <SunmiActionCard key={t} data-pagar-tipo={t} onClick={() => elegir(t)} className="min-h-toque">
              <span className="flex w-full items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-base2 font-semibold sunmi-text-strong">{ETIQUETA_TIPO_EGRESO[t]}</span>
                  <span className="block text-sm2 sunmi-text-muted">{DESCRIPCION[t]}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-lg2 sunmi-text-muted">
                  ›
                </span>
              </span>
            </SunmiActionCard>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <SunmiLinkButton onClick={() => setTipo(null)} disabled={enviando} className="justify-self-start text-sm3">
            ‹ Pagar
          </SunmiLinkButton>

          {tipo === TIPO_EGRESO.PROVEEDOR && (
            <Campo rotulo="Proveedor">
              <SunmiSelectAdv
                value={form.proveedorId}
                onChange={(v) => cambiar({ proveedorId: v })}
                placeholder="Elegí el proveedor"
                searchable
              >
                {opciones.proveedores.map((p) => (
                  <SunmiSelectOption key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Campo>
          )}

          {tipo === TIPO_EGRESO.SUELDO && (
            <>
              <Campo rotulo="Empleado">
                <SunmiSelectAdv
                  value={form.operadorId}
                  onChange={(v) => cambiar({ operadorId: v })}
                  placeholder="Elegí el empleado"
                >
                  {opciones.empleados.map((e) => (
                    <SunmiSelectOption key={e.id} value={String(e.id)}>
                      {e.nombre}
                    </SunmiSelectOption>
                  ))}
                </SunmiSelectAdv>
              </Campo>
              <SunmiSolapas
                opciones={MODALIDADES}
                valor={form.modalidad}
                onCambiar={(v) => cambiar({ modalidad: v })}
                etiqueta="Sueldo o adelanto"
              />
            </>
          )}

          {tipo === TIPO_EGRESO.GASTO && (
            <Campo rotulo="Categoría">
              <SunmiSelectAdv
                value={form.categoriaId}
                onChange={(v) => cambiar({ categoriaId: v })}
                placeholder="Elegí la categoría"
              >
                {opciones.categorias.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Campo>
          )}

          <Campo rotulo="Monto">
            <SunmiInput
              inputMode="decimal"
              value={form.monto}
              onChange={(e) => cambiar({ monto: e.target.value })}
              placeholder="$ 0,00"
              aria-label="Monto"
              className="text-base2 font-semibold"
            />
          </Campo>

          {tipo === TIPO_EGRESO.PROVEEDOR && (
            <Campo rotulo="Foto del remito">
              <SunmiButton
                type="button"
                color="ghost"
                onClick={() => inputFoto.current?.click()}
                className="w-full min-h-toque justify-center rounded-xl border border-dashed sunmi-border sunmi-bg py-6 text-base2 font-semibold sunmi-text-accent"
              >
                {form.foto ? `📷  ${form.foto.name}` : "📷  Sacar foto"}
              </SunmiButton>
              <SunmiInput
                ref={inputFoto}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => cambiar({ foto: e.target.files?.[0] || null })}
              />
            </Campo>
          )}

          <div data-sale-de className="rounded-xl2 border sunmi-border sunmi-bg-card px-4 py-3.5 space-y-2.5 text-sm3">
            <div className="flex items-center justify-between gap-3 font-semibold sunmi-text-strong">
              <span>Sale de</span>
              <span>Tu caja · #{turnoId}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="sunmi-text-muted">Efectivo en la caja ahora</span>
              <span className="font-medium tabular-nums sunmi-text-strong">{formatearMoneda(opciones.caja?.efectivoAhora)}</span>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm2 sunmi-text-danger break-words">
              {error}
            </p>
          ) : null}

          <SunmiButton
            type="button"
            color="primary"
            disabled={falta || enviando}
            onClick={pagar}
            className="w-full min-h-toque justify-center rounded-xl text-base2 font-semibold"
          >
            {enviando ? "Pagando…" : monto != null ? `Pagar ${formatearMoneda(monto)}` : "Pagar"}
          </SunmiButton>
        </div>
      )}
    </SunmiModalLayout>
  );
}

function Campo({ rotulo, children }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm2 font-medium sunmi-text-muted">{rotulo}</span>
      {children}
    </div>
  );
}

/** Sube la foto del remito a la compra por cargar. Devuelve el error, o null. */
async function subirFoto({ proveedorId, pedidoId, foto }) {
  try {
    const fd = new FormData();
    fd.append("proveedorId", String(proveedorId));
    fd.append("pedidoId", String(pedidoId));
    fd.append("archivos", foto);
    const r = await fetch("/api/compras-proveedor/comprobantes/subir", { method: "POST", body: fd, credentials: "include" });
    const d = await r.json().catch(() => null);
    if (d?.ok) return null;
    return d?.resultados?.find((x) => !x.ok)?.error || d?.error || "No se pudo subir la foto.";
  } catch {
    return "No se pudo subir la foto.";
  }
}
