"use client";

// components/finanzas/gastos/TablaGastos.jsx
//
// LOS GASTOS EN ESCRITORIO, COMO TABLA (Figma EVJ2KvVCrY0oVSowfboymQ, 378:1627).
//
// Es la misma lista que el celular dibuja en bandas (`DiaConBanda` con
// `FilaGasto` adentro), con los mismos grupos —"Anteriores con saldo" y un
// día por grupo— y en el mismo orden: `grupos` llega armado de `ListaGastos`,
// del mismo `calendarioDeGastos`. Cada grupo es una fila de fondo suave con su
// título a la izquierda y "N gastos · $ total" a la derecha; debajo, sus
// gastos. La fila entera abre el detalle, como "Ver".
//
// Las celdas las arma `SunmiTable` en su modo por columnas: ningún `<td>`
// escrito acá. Lo que cada celda dice sale de las mismas funciones que la fila
// del celular —`situacionDelGasto`, `importeDeLaCuenta`, `ROTULO_ESTADO_GASTO`,
// `diaLegible`— así que las dos no pueden decir cosas distintas.

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { formatearMoneda } from "@/lib/moneda";
import { ESTADO_CUENTA, diaLegible, filtroDeCuentas } from "@/lib/finanzas/pagosProveedores";
import { importeDeLaCuenta } from "@/lib/finanzas/calendarioDePagos";
import { ROTULO_ESTADO_GASTO, VACIO_DE_LA_LISTA, rotuloDeGastos } from "@/lib/finanzas/calendarioDeGastos";

import { situacionDelGasto } from "./FilaGasto";
import { TEXTOS_DEL_RESUMEN_DE_GASTOS } from "./ResumenDeGastos";

const FILA = { GRUPO: "grupo", GASTO: "gasto" };

// El vacío de una búsqueda sin coincidencias. El celular lo escribe en
// `ListaGastos`, y un candado exige que allá aparezca una sola vez.
const SIN_COINCIDENCIAS = "Ningún gasto coincide con la búsqueda.";

/** Los grupos, aplanados en las filas de la tabla: el grupo y sus gastos. */
function filasDe(grupos) {
  return grupos.flatMap((g) => [
    { tipo: FILA.GRUPO, clave: `grupo-${g.clave}`, g },
    ...g.gastos.map((gasto) => ({ tipo: FILA.GASTO, clave: `gasto-${gasto.id}`, gasto })),
  ]);
}

/** "Venció 20 sep" en rojo, "5 oct", o "—" sin vencimiento o ya pagado. */
function Vence({ gasto, hoy }) {
  const { pagado, vencido } = situacionDelGasto(gasto, hoy);
  if (pagado || !gasto?.vencimiento) return <span className="sunmi-text-muted">—</span>;
  const dia = diaLegible(gasto.vencimiento);
  return vencido ? <span className="sunmi-text-danger">Venció {dia}</span> : dia;
}

function columnas({ filtro, hoy, variasUbicaciones, onAbrir }) {
  const deGasto = (render) => (f) => (f.tipo === FILA.GASTO ? render(f.gasto) : null);
  const encabezado = "text-xs2 uppercase tracking-wider sunmi-text-muted";
  return [
    {
      clave: "concepto",
      titulo: "Concepto",
      thClassName: encabezado,
      render: (f) =>
        f.tipo === FILA.GRUPO ? (
          f.g.titulo
        ) : (
          <>
            <span className="font-semibold sunmi-text-strong">{f.gasto.concepto}</span>
            {variasUbicaciones && f.gasto.local?.nombre ? (
              <span className="sunmi-text-muted"> · {f.gasto.local.nombre}</span>
            ) : null}
          </>
        ),
    },
    { clave: "beneficiario", titulo: "Beneficiario", thClassName: encabezado, render: deGasto((g) => g.beneficiario || "—") },
    {
      clave: "categoria",
      titulo: "Categoría",
      thClassName: encabezado,
      render: deGasto((g) => g.categoria?.nombre || "Sin categoría"),
    },
    {
      clave: "estado",
      titulo: "Estado",
      thClassName: encabezado,
      render: deGasto((g) => (
        <span className={g.estado === ESTADO_CUENTA.PARCIAL ? "sunmi-text-warning" : ""}>
          {ROTULO_ESTADO_GASTO[g.estado] || g.estado}
        </span>
      )),
    },
    { clave: "vence", titulo: "Vence", thClassName: encabezado, render: deGasto((g) => <Vence gasto={g} hoy={hoy} />) },
    {
      clave: "saldo",
      titulo: "Saldo",
      align: "der",
      thClassName: encabezado,
      tdClassName: "tabular-nums whitespace-nowrap",
      render: (f) =>
        f.tipo === FILA.GRUPO ? (
          `${rotuloDeGastos(f.g.cantidad)} · ${formatearMoneda(f.g.importe)}`
        ) : (
          <span className="font-semibold sunmi-text-strong">{formatearMoneda(importeDeLaCuenta(f.gasto, filtro))}</span>
        ),
    },
    {
      clave: "accion",
      titulo: "",
      align: "der",
      thClassName: encabezado,
      render: deGasto((g) => (
        <SunmiLinkButton
          onClick={(e) => {
            // La fila ya abre el gasto: sin esto se abriría dos veces.
            e.stopPropagation();
            onAbrir?.(g);
          }}
          aria-label={`Abrir el gasto ${g.concepto || ""}`}
          className="text-sm3 no-underline"
        >
          Ver ›
        </SunmiLinkButton>
      )),
    },
  ];
}

/**
 * @param {object} props
 * @param {Array} props.grupos      los de `ListaGastos`, ya filtrados por la búsqueda
 * @param {string|null} props.vacio un valor de `VACIO_DE_LA_LISTA`, o null
 * @param {boolean} props.cargando  la carga del período o la búsqueda en el servidor
 */
export default function TablaGastos({ grupos = [], filtro, hoy, cargando = false, vacio = null, variasUbicaciones = false, onAbrir }) {
  // El vacío del período es el mismo texto que dice la tarjeta del celular
  // —"No hay gastos con saldo en este período."—: una fila con el mensaje, no
  // un hueco.
  const mensajeVacio =
    vacio === VACIO_DE_LA_LISTA.BUSQUEDA
      ? SIN_COINCIDENCIAS
      : TEXTOS_DEL_RESUMEN_DE_GASTOS[filtroDeCuentas(filtro)].vacio;

  // La tarjeta va en un envoltorio y no en la `<table>`: con `border-collapse`
  // —el de Tailwind— una tabla no redondea sus esquinas.
  return (
    <div className="overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card" data-tabla-gastos>
      <SunmiTable
        columnas={columnas({ filtro, hoy, variasUbicaciones, onAbrir })}
        filas={filasDe(grupos)}
        claveFila={(f) => f.clave}
        densidad="comoda"
        cargando={cargando}
        vacio={mensajeVacio}
        onClickFila={(f) => (f.tipo === FILA.GASTO ? onAbrir?.(f.gasto) : undefined)}
        claseFila={(f) =>
          f.tipo === FILA.GRUPO ? "text-sm3 font-semibold sunmi-surface-soft cursor-default" : "text-sm3"
        }
        className="text-sm3"
      />
    </div>
  );
}
