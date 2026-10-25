"use client";

// lib/pedidos/useRefrescoDelPedido.js
//
// CADA PANTALLA ABIERTA DE PEDIDOS VE LO QUE CARGAN LOS DEMÁS (Emanuel,
// 2026-10-25). El pedido es UNO por local, compartido entre todas las
// personas y dispositivos (`set-cantidad` lo arma renglón por renglón con el
// bloqueo del par). Lo que faltaba era que la pantalla se enterara: leía el
// carrito al entrar y nunca más, así que lo que cargaba otro celular no
// aparecía hasta salir y volver.
//
// Esto vuelve a leerlo:
//   · cada REFRESCO_DEL_PEDIDO_MS mientras la pestaña está a la vista;
//   · en cuanto se vuelve a la pestaña o a la ventana.
// Con la pestaña oculta no lee nada. Y no se superponen: si una lectura
// sigue en vuelo, la siguiente vuelta se saltea.
//
// La pantalla pasa `refrescar`, que lee y aplica SIN estados de carga —nada
// de "Cargando..." ni de vaciar la lista—, y descarta lo que vuelva viejo
// (`lib/pedidos/guardiaDeLecturas.js`). Lo usan `app/modulos/pedidos/page.jsx`
// y `components/pedidos/PedidosEscritorio.jsx`.

import { useEffect, useRef } from "react";

/** Cada cuánto se relee el pedido con la pantalla a la vista. */
export const REFRESCO_DEL_PEDIDO_MS = 5000;

export function useRefrescoDelPedido(refrescar, { activo = true, cadaMs = REFRESCO_DEL_PEDIDO_MS } = {}) {
  const actual = useRef(refrescar);
  actual.current = refrescar;

  useEffect(() => {
    if (!activo || typeof window === "undefined") return undefined;
    let enVuelo = false;
    const leer = async () => {
      if (enVuelo || document.visibilityState === "hidden") return;
      enVuelo = true;
      try {
        await actual.current();
      } catch (err) {
        console.error(err);
      } finally {
        enVuelo = false;
      }
    };
    const id = setInterval(leer, cadaMs);
    document.addEventListener("visibilitychange", leer);
    window.addEventListener("focus", leer);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", leer);
      window.removeEventListener("focus", leer);
    };
  }, [activo, cadaMs]);
}
