"use client";

// EL ARCHIVO, COMO DIAGNÓSTICO.
//
// Las 917 filas y los criterios de macheo dejaron de ser la pantalla y pasaron a
// ser el bloque que se abre cuando algo no cierra. Cerrado por defecto: en un día
// normal nadie necesita saber cuántas filas machearon por sufijo de cinco
// dígitos.
//
// ── LAS 625 NO SON UN PROBLEMA ──────────────────────────────────────────────
//
// Son filas de productos que este negocio no tiene. Estaban en la cola —donde
// nadie las iba a resolver nunca, porque no hay nada que resolver— y acá se
// explican con esa frase. Siguen sirviendo para algo: son la fuente de
// candidatos de los productos sin código.
//
// El bloque de "Macheo contra productos del ERP", que antes vivía suelto arriba,
// se absorbe acá adentro.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function Numero({ valor, etiqueta, detalle, tono = "sunmi-text-strong" }) {
  return (
    <div className="min-w-0">
      <div className={`text-[15px] font-bold tabular-nums ${tono}`}>{valor ?? 0}</div>
      <div className="text-[10px] font-semibold sunmi-text-strong leading-tight">{etiqueta}</div>
      {detalle ? (
        <div className="text-[9px] sunmi-text-muted leading-tight mt-0.5">{detalle}</div>
      ) : null}
    </div>
  );
}

export default function DiagnosticoArchivo({ archivo, macheo, cabecera }) {
  const [abierto, setAbierto] = useState(false);
  const total = archivo?.totalFilas ?? 0;
  const sinVincular = archivo?.sinVincular ?? 0;

  return (
    <div data-rol="diagnostico-archivo" className="sunmi-border border rounded-lg">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left"
      >
        {abierto ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        <span className="text-[11.5px] font-semibold sunmi-text-strong">
          Qué trajo el archivo ({total} filas)
        </span>
        <span className="text-[10px] sunmi-text-muted ml-1">diagnóstico</span>
      </button>

      {abierto ? (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[10.5px] sunmi-text-muted leading-snug">
            Esto describe el Excel del proveedor, no tu trabajo. El proveedor manda su catálogo
            entero: la mayoría de estas filas son productos que no tenés.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Numero valor={total} etiqueta="Filas del archivo" detalle="Lo que trajo el Excel" />
            <Numero
              valor={archivo?.conProducto}
              etiqueta="Se pudieron identificar"
              detalle="Corresponden a un producto tuyo"
              tono="sunmi-text-success"
            />
            <Numero
              valor={sinVincular}
              etiqueta="Filas de productos que no tenés"
              detalle="No hay nada que resolver en ellas. Se usan para sugerir candidatos a los productos sin código."
              tono="sunmi-text-muted"
            />
            <Numero
              valor={archivo?.duplicadas}
              etiqueta="Códigos duplicados"
              detalle="El mismo código apunta a más de un producto"
              tono={archivo?.duplicadas > 0 ? "sunmi-text-warning" : "sunmi-text-muted"}
            />
          </div>

          {/* El bloque de macheo, absorbido: era una sección suelta arriba. */}
          {macheo?.grupos?.length ? (
            <div className="pt-2 border-t sunmi-border">
              <div className="text-[11px] font-semibold sunmi-text-strong mb-1.5">
                Cómo se encontró cada producto
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {macheo.grupos
                  .filter((g) => (g.valor ?? 0) > 0)
                  .map((g) => (
                    <Numero key={g.clave} valor={g.valor} etiqueta={g.etiqueta} detalle={g.detalle} />
                  ))}
              </div>
              {macheo.grupos.filter((g) => (g.valor ?? 0) === 0).length ? (
                <div className="text-[9.5px] sunmi-text-muted mt-1.5">
                  Sin resultados:{" "}
                  {macheo.grupos
                    .filter((g) => (g.valor ?? 0) === 0)
                    .map((g) => g.etiqueta)
                    .join(" · ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Los parámetros comerciales, de solo lectura. */}
          <div className="pt-2 border-t sunmi-border flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-[10.5px] sunmi-text-muted">
              Recargo aplicado{" "}
              <span className="sunmi-text-strong font-semibold">{Number(cabecera?.recargoPct ?? 0)} %</span>
            </span>
            <span className="text-[10.5px] sunmi-text-muted">
              Aumento esperado{" "}
              <span className="sunmi-text-strong font-semibold">
                {cabecera?.aumentoEsperadoMinPct} % a {cabecera?.aumentoEsperadoMaxPct} %
              </span>
            </span>
            <span className="text-[10px] sunmi-text-muted italic">
              Se fijan al crear la importación y no se pueden cambiar: todas sus filas se
              conciliaron con estos valores. Para usar otros, importá la lista de nuevo.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
