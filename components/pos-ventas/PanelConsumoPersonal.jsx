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
import { cantidadEscrita, resumenDelConsumo } from "@/lib/pos-ventas/consumoPersonal";

export default function PanelConsumoPersonal({ turnoId, localId, esDeposito = false, empleados = [], onRegistrado }) {
  const { requerirOperador } = useOperadorContext();
  // La lista del consumo: el mismo reductor que el carrito, en un estado propio.
  const [lista, despachar] = useReducer(posVentaReducer, initialState);
  const [empleadoId, setEmpleadoId] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState("");
  // Un intento por lista: el mismo envío repetido cae en el mismo consumo.
  const clave = useRef(nuevaClaveDePago(`consumo-${turnoId}`));

  // Lo escrito en cada campo —"0,100" en un producto por peso— pasa a número
  // para sumar y para mandar; la lista guarda lo escrito.
  const productos = lista.carrito.map((p) => ({ ...p, cantidad: cantidadEscrita(p.cantidad) }));
  const resumen = resumenDelConsumo(productos);
  const puedeConfirmar =
    Boolean(turnoId) &&
    Boolean(empleadoId) &&
    resumen.productos > 0 &&
    productos.every((p) => p.cantidad > 0) &&
    !resumen.hayServicios &&
    !registrando;

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
          {lista.carrito.map((p, idx) => {
            const esKg = p.unidadMedida === "kg";
            // Dos renglones: el nombre a lo ancho —compartiendo la fila con los
            // controles se partía letra por letra— y abajo la cantidad y "Quitar".
            return (
              <div key={p.productoBaseId} className="grid gap-2 py-2.5">
                <span className="line-clamp-2 break-words text-sm3 sunmi-text-strong">{p.nombre}</span>
                <div className="flex items-center justify-between gap-3">
                  {/* El campo del carrito de la venta (`CantidadStepper` de
                      CarritoVenta.jsx), con sus mismos mínimo, paso, tope y caja.
                      Lo único que se suma es `conservaLoEscrito` en el kilo: sin
                      eso la coma se borra al tipearla y 0,100 no se puede
                      escribir. Lo escrito se lee con `cantidadEscrita`. */}
                  <SunmiCampoCantidad
                    valor={p.cantidad}
                    onCambiar={(s) =>
                      despachar({
                        type: ActionTypes.UPDATE_CANTIDAD,
                        payload: { idx, nuevaCantidad: esKg || s === "" ? s : Number(s) },
                      })
                    }
                    etiqueta={`Cantidad de ${p.nombre}`}
                    minimo={esKg ? 0.001 : 1}
                    paso={esKg ? 0.001 : 1}
                    maximo={p.stockMax != null && p.stockMax > 0 ? p.stockMax : 9999}
                    decimales={esKg ? 3 : 0}
                    conservaLoEscrito={esKg}
                    normalizaAlSalir={!esKg}
                    conMarco={false}
                    claseInput="w-16 !text-center !py-1"
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
