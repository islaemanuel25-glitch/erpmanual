"use client";

// components/stock_diario/GraficoDeEvolucion.jsx
//
// LA EVOLUCIÓN DEL CAPITAL, como gráfico de línea: la apertura y el cierre de
// cada día (de cada mes en el año). SVG en línea, sin librerías. Las cuentas
// —puntos, escala con su mínimo de ±3 % de la apertura, coordenadas— están en
// `stockDiarioPantalla.js` y tienen candado; acá solo se dibuja.
//
// El color es del tema: la línea y el área en el acento (`currentColor` dentro
// de `sunmi-text-accent`), las líneas de referencia en el borde de la app.
// Mide su ancho para que los puntos sean círculos y no óvalos.

import { useEffect, useRef, useState } from "react";

import { ALTO_DEL_GRAFICO_PX, escalaDelGrafico, puntasDelGrafico, puntosDeEvolucion, trazoDelGrafico } from "@/lib/stock/libro/stockDiarioPantalla";

/** Lo que se aparta del borde el trazo, para que los puntos no se corten. */
const MARGEN = 4;
const ANCHO_INICIAL = 300;
const OPACIDAD_DEL_AREA = 0.14;
const BORDE = "var(--app-border)";

export default function GraficoDeEvolucion({ valor }) {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(ANCHO_INICIAL);

  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const medir = () => setAncho(Math.max(1, el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const valores = puntosDeEvolucion(valor);
  if (valores.length === 0) return null;
  const alto = ALTO_DEL_GRAFICO_PX;
  const escala = escalaDelGrafico(valores, valor.inicial);
  const util = { ancho: ancho - 2 * MARGEN, alto: alto - 2 * MARGEN };
  const pts = trazoDelGrafico(valores, escala, util.ancho, util.alto).map((p) => ({ x: p.x + MARGEN, y: p.y + MARGEN }));
  const yApertura = trazoDelGrafico([valor.inicial], escala, util.ancho, util.alto)[0].y + MARGEN;
  const linea = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `M${pts[0].x},${alto} L${pts.map((p) => `${p.x},${p.y}`).join(" L")} L${pts[pts.length - 1].x},${alto} Z`;
  const ultimo = pts[pts.length - 1];
  const puntas = puntasDelGrafico(valor);

  return (
    <div data-grafico-evolucion>
      <div ref={caja} className="sunmi-text-accent">
        <svg width="100%" height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución del capital en el período" className="block">
          <path d={area} fill="currentColor" fillOpacity={OPACIDAD_DEL_AREA} stroke="none" />
          <line x1={0} x2={ancho} y1={alto - 0.5} y2={alto - 0.5} stroke={BORDE} strokeWidth={1} />
          <line x1={0} x2={ancho} y1={yApertura} y2={yApertura} stroke={BORDE} strokeWidth={1} />
          <polyline points={linea} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={pts[0].x} cy={pts[0].y} r={2.5} fill="var(--card-bg)" stroke="currentColor" strokeWidth={1} />
          <circle cx={ultimo.x} cy={ultimo.y} r={3.5} fill="currentColor" />
        </svg>
      </div>
      {puntas && (
        <div className="mt-1 flex justify-between gap-3 text-xs2 sunmi-text-muted">
          <span>{puntas.desde}</span>
          <span>{puntas.hasta}</span>
        </div>
      )}
    </div>
  );
}
