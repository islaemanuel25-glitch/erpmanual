"use client";

// components/pos-ventas/ModalPagar.jsx
//
// "PAGAR" DESDE EL POS. El cajero elige qué paga y la plata sale de SU caja
// abierta, sin elegir otra. Cada tipo queda en su módulo; lo decide el servidor
// (`/api/pos-ventas/pagar`, lib/caja/pagarDesdeElPosServer.js).
//
// La foto del remito de un pago a proveedor se sube DESPUÉS del pago, a la
// compra por cargar que el pago dejó, por la subida de comprobantes de siempre:
// si la foto falla, el pago ya está hecho y se dice así. El ticket de un Gasto,
// igual, al gasto que el pago dejó (`/api/finanzas/gastos/[id]/archivo`).
//
// En escritorio es un diálogo de dos columnas —los tipos a la izquierda, el
// formulario a la derecha—. En el teléfono, la hoja de siempre.
//
// ── EL DISEÑO DE CADA FORMULARIO (Emanuel, 2026-10-16) ───────────────────
//
//   1. Encabezado: "‹" vuelve a la lista de tipos, el título, "✕" cierra.
//   2. El IMPORTE arriba y centrado, del tamaño del total del cobro del POS.
//   3. De qué caja sale y cuánto hay. Si el importe lo supera, el recuadro pasa
//      a rojo y el botón se apaga: `superaElEfectivo`, la misma regla con la que
//      el servidor rechaza (409).
//   4. Los campos del tipo. Los cuatro selectores son `SunmiSelectAdv` con su
//      buscador, el de los filtros de Productos.
//   5. "Pagar $X".
//
// "Consumo del personal" no mueve plata: mismo encabezado, sin importe ni caja.

import { useEffect, useRef, useState } from "react";

import { useOperadorContext } from "@/app/context/OperadorContext";
import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSolapas from "@/components/sunmi/SunmiSolapas";
import CampoFotoOArchivo from "@/components/pos-ventas/CampoFotoOArchivo";
import PanelConsumoPersonal from "@/components/pos-ventas/PanelConsumoPersonal";
import useEsEscritorio from "@/hooks/useEsEscritorio";
import { ETIQUETA_TIPO_EGRESO, TIPO_EGRESO, TIPOS_EGRESO } from "@/lib/caja/tipoEgreso";
import { desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { TEXTO_NO_ALCANZA, superaElEfectivo } from "@/lib/caja/topeDeEfectivo";
import { leerImporte, nuevaClaveDePago } from "@/lib/finanzas/pagosProveedores";
import { formatearMoneda } from "@/lib/moneda";
import { subirArchivoDeGasto } from "@/lib/finanzas/subirArchivoDeGasto";

// ── LA SEXTA OPCIÓN NO ES UN EGRESO DE CAJA ───────────────────────────────
//
// "Consumo del personal" va después de "Retiro del dueño", pero no sale plata:
// sale mercadería. Por eso no es un `TIPO_EGRESO` —ese enum es la columna de
// `CajaMovimiento`— sino una opción más de esta pantalla, que no pasa por
// `/api/pos-ventas/pagar` sino por `/api/pos-ventas/consumo-personal`.
export const OPCION_CONSUMO = "CONSUMO_PERSONAL";
export const OPCIONES_PAGAR = Object.freeze([...TIPOS_EGRESO, OPCION_CONSUMO]);

/** Cómo se llama cada opción. */
const ETIQUETA = Object.freeze({ ...ETIQUETA_TIPO_EGRESO, [OPCION_CONSUMO]: "Consumo del personal" });

/** Lo que dice cada opción de la lista. */
const DESCRIPCION = Object.freeze({
  [TIPO_EGRESO.PROVEEDOR]: "Pan, migas, mercadería que entra",
  [TIPO_EGRESO.SUELDO]: "A un empleado",
  [TIPO_EGRESO.GASTO]: "Insumos, limpieza, servicios",
  [TIPO_EGRESO.AL_DEPOSITO]: "Mercadería del depósito",
  [TIPO_EGRESO.RETIRO_DUENO]: "Plata que se lleva el dueño",
  [OPCION_CONSUMO]: "Lo que se lleva el personal",
});

/** El título de cada formulario. */
const TITULO = Object.freeze({
  [TIPO_EGRESO.PROVEEDOR]: "Pago a proveedor",
  [TIPO_EGRESO.SUELDO]: "Sueldo o adelanto",
  [TIPO_EGRESO.GASTO]: "Gasto",
  [TIPO_EGRESO.AL_DEPOSITO]: "Al depósito",
  [TIPO_EGRESO.RETIRO_DUENO]: "Retiro del dueño",
  [OPCION_CONSUMO]: "Consumo del personal",
});

const TITULO_LISTA = "¿Qué vas a pagar?";

const MODALIDADES = [
  { valor: "SUELDO", texto: "Sueldo" },
  { valor: "ADELANTO", texto: "Adelanto" },
];

const VACIO = { proveedorId: "", empleadoId: "", modalidad: "SUELDO", categoriaId: "", importe: "", foto: null };

export default function ModalPagar({ turnoId, localId, esDeposito = false, onClose, onPagado }) {
  const { requerirOperador } = useOperadorContext();
  // En escritorio, el diálogo de dos columnas; en el teléfono, la hoja de siempre.
  const esEscritorio = useEsEscritorio() === true;
  const [opciones, setOpciones] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [tipo, setTipo] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const clave = useRef(null);

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
  const cerrar = enviando ? () => {} : onClose;

  const leido = leerImporte(form.importe);
  const importe = leido.error ? null : desdeCentavos(leido.centavos);
  // Lo que hay en la caja, y si el importe lo supera: la regla del servidor.
  const efectivo = opciones?.caja?.efectivoAhora ?? null;
  const noAlcanza = importe != null && superaElEfectivo({ montoCentavos: leido.centavos, efectivo });
  const falta =
    importe == null ||
    noAlcanza ||
    (tipo === TIPO_EGRESO.PROVEEDOR && !form.proveedorId) ||
    (tipo === TIPO_EGRESO.SUELDO && !form.empleadoId) ||
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
          monto: form.importe,
          idempotencyKey: clave.current,
          proveedorId: form.proveedorId || null,
          empleadoId: form.empleadoId || null,
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
      // El ticket del gasto, al gasto que el pago dejó. Si falla, el pago ya está.
      if (tipo === TIPO_EGRESO.GASTO && form.foto && d.gastoId) {
        errorFoto = await subirArchivoDeGasto({ gastoId: d.gastoId, archivo: form.foto });
      }
      onPagado?.({ tipo, monto: importe, errorFoto });
      onClose();
    } catch {
      setError("Sin conexión: no se sabe si el pago entró. Mirá la caja antes de repetirlo.");
    } finally {
      setEnviando(false);
    }
  }

  // ── LA LISTA DE TIPOS ─────────────────────────────────────────────────
  //
  // En el teléfono es la primera pantalla y se pasa al formulario. En
  // escritorio queda a la izquierda, con el elegido marcado, y el formulario a
  // la derecha: elegir otro tipo no obliga a volver.
  const listaDeTipos = (
    <div className="grid content-start gap-3">
      {OPCIONES_PAGAR.map((t) => (
        <SunmiActionCard
          key={t}
          data-pagar-tipo={t}
          aria-pressed={esEscritorio ? tipo === t : undefined}
          disabled={enviando}
          onClick={() => elegir(t)}
          className={`min-h-toque ${esEscritorio && tipo === t ? "border-2 sunmi-border-accent" : ""}`}
        >
          <span className="flex w-full items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className={`block text-base2 font-semibold ${esEscritorio && tipo === t ? "sunmi-text-accent" : "sunmi-text-strong"}`}>
                {ETIQUETA[t]}
              </span>
              <span className="block text-sm2 sunmi-text-muted">{DESCRIPCION[t]}</span>
            </span>
            {!esEscritorio ? (
              <span aria-hidden="true" className="shrink-0 text-lg2 sunmi-text-muted">
                ›
              </span>
            ) : null}
          </span>
        </SunmiActionCard>
      ))}
    </div>
  );

  const titulo = tipo ? TITULO[tipo] : TITULO_LISTA;

  return (
    <SunmiModalLayout
      open
      // El encabezado lo dibuja esta pantalla: cambia con el paso (`Encabezado`).
      encabezado="ninguno"
      title={titulo}
      onClose={cerrar}
      forma="hoja-o-centrado"
      espacioCuerpo="gap-3"
      z={NIVEL_MODAL_GLOBAL}
      maxWidth={esEscritorio ? "max-w-4xl" : undefined}
      destructivo
    >
      <Encabezado
        titulo={titulo}
        onVolver={tipo ? () => setTipo(null) : null}
        onCerrar={cerrar}
        deshabilitado={enviando}
      />
      {errorCarga ? (
        <p role="alert" className="text-sm2 sunmi-text-danger">
          {errorCarga}
        </p>
      ) : !opciones ? (
        <div className="py-8">
          <SunmiLoader />
        </div>
      ) : esEscritorio ? (
        <div data-pagar-escritorio className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
          {listaDeTipos}
          {tipo ? (
            formulario()
          ) : (
            <p className="self-center text-center text-sm3 sunmi-text-muted">Elegí qué vas a pagar.</p>
          )}
        </div>
      ) : !tipo ? (
        listaDeTipos
      ) : (
        formulario()
      )}
    </SunmiModalLayout>
  );

  function formulario() {
    // El consumo tiene su propio formulario: una lista de productos, sin
    // importe ni caja, porque no mueve plata.
    if (tipo === OPCION_CONSUMO) {
      return (
        <PanelConsumoPersonal
          turnoId={turnoId}
          localId={localId}
          esDeposito={esDeposito}
          empleados={opciones.empleados}
          onRegistrado={(r) => {
            onPagado?.({ tipo: OPCION_CONSUMO, consumo: r });
            onClose();
          }}
        />
      );
    }

    // El papel: el remito del proveedor, o el ticket del gasto. Opcional.
    const rotuloPapel = tipo === TIPO_EGRESO.PROVEEDOR ? "Remito" : tipo === TIPO_EGRESO.GASTO ? "Ticket" : null;

    return (
      <div className="grid content-start gap-4">
        {/* 2 · EL IMPORTE, protagonista. */}
        <div data-importe className="grid gap-1 text-center">
          <span className="text-xs2 font-semibold uppercase tracking-widest sunmi-text-muted">Importe</span>
          <SunmiInput
            inputMode="decimal"
            value={form.importe}
            onChange={(e) => cambiar({ importe: e.target.value })}
            placeholder="$ 0"
            aria-label="Importe"
            disabled={enviando}
            className="text-center text-4xl lg:text-5xl font-black tabular-nums tracking-tight sunmi-text-accent"
          />
          <div aria-hidden="true" className="mx-auto h-0.5 w-24 rounded-full bg-current sunmi-text-accent" />
        </div>

        {/* 3 · DE QUÉ CAJA SALE Y CUÁNTO HAY. */}
        <div
          data-sale-de
          data-no-alcanza={noAlcanza || undefined}
          className={`flex items-center justify-between gap-3 rounded-xl2 px-4 py-3 text-sm3 ${
            noAlcanza ? "sunmi-state-danger" : "border sunmi-border sunmi-bg-card"
          }`}
        >
          <span className="font-medium sunmi-text-strong">Sale de tu caja #{turnoId}</span>
          <span className={`font-semibold tabular-nums ${noAlcanza ? "sunmi-text-danger" : "sunmi-text-strong"}`}>
            {noAlcanza ? `Hay ${formatearMoneda(efectivo)} · no alcanza` : `Hay ${formatearMoneda(efectivo)}`}
          </span>
        </div>

        {/* 4 · LOS CAMPOS DEL TIPO. */}
        {tipo === TIPO_EGRESO.PROVEEDOR ? (
          <Campo rotulo="Proveedor">
            <SunmiSelectAdv
              value={form.proveedorId}
              onChange={(v) => cambiar({ proveedorId: v })}
              placeholder="Elegí el proveedor"
              aria-label="Proveedor"
              searchable
            >
              {opciones.proveedores.map((p) => (
                <SunmiSelectOption key={p.id} value={String(p.id)}>
                  {p.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </Campo>
        ) : null}

        {tipo === TIPO_EGRESO.SUELDO ? (
          <>
            <Campo rotulo="Empleado">
              <SunmiSelectAdv
                value={form.empleadoId}
                onChange={(v) => cambiar({ empleadoId: v })}
                placeholder="Elegí el empleado"
                aria-label="Empleado"
                searchable
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
        ) : null}

        {tipo === TIPO_EGRESO.GASTO ? (
          <Campo rotulo="Categoría">
            <SunmiSelectAdv
              value={form.categoriaId}
              onChange={(v) => cambiar({ categoriaId: v })}
              placeholder="Elegí la categoría"
              aria-label="Categoría"
              searchable
            >
              {opciones.categorias.map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </Campo>
        ) : null}

        {rotuloPapel ? (
          <Campo rotulo={rotuloPapel} opcional>
            <CampoFotoOArchivo
              archivo={form.foto}
              onCambiar={(foto) => cambiar({ foto })}
              esEscritorio={esEscritorio}
              deshabilitado={enviando}
              botones
            />
          </Campo>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm2 sunmi-text-danger break-words">
            {error}
          </p>
        ) : null}

        {/* 5 · PAGAR, con el importe escrito. */}
        <SunmiButton
          type="button"
          color="primary"
          disabled={falta || enviando}
          onClick={pagar}
          className="w-full min-h-toque justify-center rounded-xl text-base2 font-semibold"
        >
          {enviando
            ? "Pagando…"
            : noAlcanza
              ? TEXTO_NO_ALCANZA
              : importe != null
                ? `Pagar ${formatearMoneda(importe)}`
                : "Pagar"}
        </SunmiButton>
      </div>
    );
  }
}

/** "‹" para volver a la lista de tipos (si hay a dónde), el título y "✕". */
function Encabezado({ titulo, onVolver, onCerrar, deshabilitado }) {
  const claseBoton = "min-h-toque min-w-toque justify-center px-0 text-xl2 sunmi-text-muted";
  return (
    <div data-pagar-encabezado className="flex shrink-0 items-center gap-2">
      {onVolver ? (
        <SunmiButton color="ghost" type="button" onClick={onVolver} disabled={deshabilitado} aria-label="Volver" className={claseBoton}>
          ‹
        </SunmiButton>
      ) : null}
      <h2 className="min-w-0 flex-1 text-lg2 font-semibold sunmi-text-strong">{titulo}</h2>
      <SunmiButton color="ghost" type="button" onClick={onCerrar} disabled={deshabilitado} aria-label="Cerrar" className={claseBoton}>
        ✕
      </SunmiButton>
    </div>
  );
}

function Campo({ rotulo, opcional = false, children }) {
  return (
    <div className="grid gap-1.5">
      <span className="flex items-baseline justify-between gap-3 text-sm2 font-medium sunmi-text-muted">
        <span>{rotulo}</span>
        {opcional ? <span className="font-normal">Opcional</span> : null}
      </span>
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
