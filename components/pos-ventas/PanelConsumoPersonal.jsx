"use client";

// components/pos-ventas/PanelConsumoPersonal.jsx
//
// CONSUMO DEL PERSONAL, adentro de "Pagar" del POS. Se mudó del panel de
// cobro a pedido de Emanuel: ahí estaba al lado de cada venta y un toque de
// más registraba un consumo.
//
// Tiene SU PROPIA lista de productos, separada del carrito de la venta: el
// carrito no se toca. Para armarla se reusa lo del POS —`BuscadorProductos`
// para buscar o escanear y el reductor del carrito (`posVentaReducer`) para
// agregar, cambiar la cantidad y quitar—, así cada línea tiene la misma forma
// que una de venta y viaja con `itemsCrearPayload`. Quién consume se elige de
// los EMPLEADOS activos del local. El servidor descuenta el stock con las
// funciones de la venta y deja el gasto al costo
// (lib/pos-ventas/consumoPersonalServer.js).

import { useReducer, useRef, useState } from "react";

import { useOperadorContext } from "@/app/context/OperadorContext";
import { ActionTypes, initialState, posVentaReducer } from "@/app/modulos/pos-ventas/reducer/posVentaReducer";
import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { showError } from "@/components/sunmi/SunmiToast";
import { nuevaClaveDePago } from "@/lib/finanzas/pagosProveedores";
import { formatearMoneda } from "@/lib/moneda";
import { itemsCrearPayload } from "@/lib/pos-ventas/payloadVenta";
import { esModalidadServicio } from "@/lib/pos-ventas/servicios";
import { resumenDelConsumo } from "@/lib/pos-ventas/consumoPersonal";

export default function PanelConsumoPersonal({ turnoId, localId, esDeposito = false, empleados = [], onRegistrado }) {
  const { requerirOperador } = useOperadorContext();
  // La lista del consumo: el mismo reductor que el carrito, en un estado propio.
  const [lista, despachar] = useReducer(posVentaReducer, initialState);
  const [empleadoId, setEmpleadoId] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState("");
  // Un intento por lista: el mismo envío repetido cae en el mismo consumo.
  const clave = useRef(nuevaClaveDePago(`consumo-${turnoId}`));

  const productos = lista.carrito;
  const resumen = resumenDelConsumo(productos);
  const puedeConfirmar = Boolean(turnoId) && Boolean(empleadoId) && resumen.productos > 0 && !resumen.hayServicios && !registrando;

  const agregar = (producto) => {
    // Un servicio no sale del stock: no hay nada que consumir.
    if (producto?.esServicioImporteVariable || esModalidadServicio(producto?.modalidad)) {
      showError(`"${producto.nombre}" es un servicio: no sale del stock.`);
      return;
    }
    despachar({ type: ActionTypes.ADD_ITEM, payload: { producto } });
  };

  async function confirmar() {
    if (!puedeConfirmar) return;
    setRegistrando(true);
    setError("");
    try {
      const r = await fetch("/api/pos-ventas/consumo-personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId,
          empleadoId: Number(empleadoId),
          items: itemsCrearPayload(productos),
          idempotencyKey: clave.current,
        }),
      });
      if (r.status === 428) {
        requerirOperador();
        return;
      }
      const d = await r.json().catch(() => null);
      if (!d?.ok) {
        setError(d?.error || "No se pudo registrar el consumo.");
        return;
      }
      clave.current = nuevaClaveDePago(`consumo-${turnoId}`);
      despachar({ type: ActionTypes.CLEAR_CART });
      setEmpleadoId("");
      onRegistrado?.(d);
    } catch {
      setError("Sin conexión: no se sabe si el consumo entró. Mirá el stock antes de repetirlo.");
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div data-consumo-personal className="grid content-start gap-3">
      <BuscadorProductos
        localId={localId}
        onAgregar={agregar}
        esDeposito={esDeposito}
        wrapCard={false}
        mostrarStock={false}
      />

      {productos.length > 0 ? (
        <div data-lista-consumo className="rounded-xl2 border sunmi-border sunmi-bg-card px-4 divide-y sunmi-divide">
          {productos.map((p, idx) => {
            const porPeso = p.unidadMedida === "kg";
            return (
              <div key={p.productoBaseId} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm3 sunmi-text-strong break-words">{p.nombre}</span>
                <SunmiCampoCantidad
                  valor={p.cantidad}
                  onCambiar={(v) => despachar({ type: ActionTypes.UPDATE_CANTIDAD, payload: { idx, nuevaCantidad: v } })}
                  etiqueta={`Cantidad de ${p.nombre}`}
                  minimo={porPeso ? 0.001 : 1}
                  paso={porPeso ? 0.1 : 1}
                  decimales={porPeso ? 3 : 0}
                  tamano="compacto"
                />
                <SunmiLinkButton
                  type="button"
                  onClick={() => despachar({ type: ActionTypes.REMOVE_ITEM, payload: { idx } })}
                  disabled={registrando}
                  className="shrink-0 text-sm3"
                >
                  Quitar
                </SunmiLinkButton>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <span className="text-sm2 font-medium sunmi-text-muted">¿Quién lo consume?</span>
        <SunmiSelectAdv
          value={empleadoId}
          onChange={(v) => setEmpleadoId(v)}
          placeholder="Elegí quién"
          aria-label="Quién lo consume"
          searchable
        >
          {empleados.map((e) => (
            <SunmiSelectOption key={e.id} value={String(e.id)}>
              {e.nombre}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </div>

      <div data-resumen-consumo className="rounded-xl2 border sunmi-border sunmi-bg-card px-4 py-3.5 space-y-2.5 text-sm3">
        <div className="flex items-center justify-between gap-3">
          <span className="sunmi-text-muted">No se cobra</span>
          <span className="font-medium tabular-nums sunmi-text-strong">{formatearMoneda(0)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="sunmi-text-muted">Sale del stock</span>
          <span className="font-medium sunmi-text-strong">
            {resumen.productos} {resumen.productos === 1 ? "producto" : "productos"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 font-semibold">
          <span className="sunmi-text-strong">Gasto a costo</span>
          <span className="tabular-nums sunmi-text-danger">{formatearMoneda(resumen.costo)}</span>
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
        disabled={!puedeConfirmar}
        onClick={confirmar}
        className="w-full min-h-toque justify-center rounded-xl text-base2 font-semibold"
      >
        {registrando ? "Registrando…" : "Confirmar consumo"}
      </SunmiButton>
    </div>
  );
}
