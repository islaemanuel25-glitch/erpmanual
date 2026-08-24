"use client";

import { useEffect, useRef, useState } from "react";
import {
  controlesPuedenSalir,
  haceElUltimoPedido,
  listadoTermino,
} from "@/lib/productos/ordenDeCargaProductos";

// LOS CUATRO CONTADORES DE "ESTADO DEL STOCK", PEDIDOS DESPUÉS DEL LISTADO.
//
// ── POR QUÉ NO SALEN JUNTO CON LA LISTA ───────────────────────────────────
//
// Es la misma lección que dejó la pantalla de Productos, y acá el desbalance es
// todavía mayor: el listado trae una página de 25 filas y el resumen recorre el
// catálogo entero de la ubicación. Si los dos efectos salen en el mismo render,
// la consulta cara compite por servidor y por base con la que la persona está
// esperando ver.
//
// Medido allá, con el servidor caliente: el listado bajó de 1.060 ms a 630 ms
// solo por dejar de competir, y las primeras filas aparecieron medio segundo
// antes.
//
// La decisión de CUÁNDO puede salir no se reescribe acá: se importa de
// `lib/productos/ordenDeCargaProductos.js`, que ya la tiene con sus candados y
// sus contrapruebas. Reusarla es también lo que garantiza que las dos pantallas
// se comporten igual — y si mañana esa regla cambia, cambia para las dos.
//
// ── LA PUERTA FALLA ABIERTA ───────────────────────────────────────────────
//
// Si el listado falla, los contadores salen igual: las cards son independientes
// y no tienen por qué quedarse en su esqueleto porque el listado no llegó. El
// único caso que las retiene es "el primer listado todavía no terminó".

export function useResumenStock({ localSeleccionado, listadoListo, refrescar }) {
  const [estados, setEstados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Igual que en Productos: dos primitivos y no un objeto. React descarta un
  // `setState` que repite el mismo valor solo si es el MISMO valor; con un
  // objeto, cada listado que termina crearía una identidad nueva y este efecto
  // correría de gusto en cada paginada.
  const [termino, setTermino] = useState(null);
  const [respondioPara, setRespondioPara] = useState(null);

  const tokenRef = useRef(0);
  const pedidoRef = useRef(null);

  // El listado avisa cuándo terminó su primera carga y para qué ubicación.
  useEffect(() => {
    if (!listadoListo) return;
    setTermino(listadoListo.ok !== false);
    setRespondioPara(listadoListo.localId ?? null);
  }, [listadoListo]);

  const puerta =
    termino === null ? null : listadoTermino({ ok: termino, localIdRespondido: respondioPara });

  useEffect(() => {
    if (!localSeleccionado) return;
    if (!controlesPuedenSalir(puerta, Number(localSeleccionado) || 0)) return;

    // Ya salió para esta ubicación y no hay nada que lo invalide: no se repite.
    // `refrescar` sí lo invalida, porque después de ajustar o de tocar límites
    // los conteos cambiaron.
    const clave = `${localSeleccionado}|${refrescar ? "post-cambio" : "inicial"}`;
    if (pedidoRef.current === clave) return;
    pedidoRef.current = clave;

    const miToken = ++tokenRef.current;
    const vigente = () => haceElUltimoPedido(tokenRef, miToken);

    (async () => {
      setCargando(true);
      try {
        const res = await fetch(
          `/api/stock_locales/resumen?localId=${localSeleccionado}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        // Una respuesta de una ubicación que ya no es la actual no pisa los
        // contadores de la actual. Mismo criterio que en Productos.
        if (!vigente()) return;

        if (json.ok) {
          setEstados(json.estados || []);
          setError("");
        } else {
          // No se muestran cuatro ceros: cuatro ceros AFIRMAN que el stock está
          // sano, y acá no se sabe nada.
          pedidoRef.current = null;
          setEstados([]);
          setError(json.error || "No se pudieron contar los estados de stock.");
        }
      } catch (err) {
        if (vigente()) {
          pedidoRef.current = null;
          setEstados([]);
          setError("No se pudieron contar los estados de stock.");
        }
        console.error("useResumenStock:", err);
      } finally {
        if (vigente()) setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSeleccionado, termino, respondioPara, refrescar]);

  return { estados, cargando, error };
}
