"use client";

// "MACHEO CONTRA PRODUCTOS DEL ERP": cómo se llegó a cada producto.
//
// La pantalla decía cuántas filas estaban listas y cuántas sin vincular, que es
// qué se puede HACER con ellas. No decía cómo se las encontró, y esa es otra
// pregunta: 88 coincidencias exactas y 53 por cuatro dígitos no valen lo mismo
// aunque las dos terminen en "listo".
//
// ── DOS NÚMEROS QUE NO SON LO MISMO ─────────────────────────────────────────
//
// Arriba, separados a propósito: los PRODUCTOS del catálogo que se le compran a
// este proveedor, y las FILAS del archivo que mandó. Mezclarlos —"917 total"
// junto a "375 productos"— fue parte de lo que hacía la pantalla ilegible.
//
// Cada indicador filtra el listado de abajo. No hay modal: el detalle es el
// mismo listado, que ya muestra los dos lados de cada fila.

import SunmiCard from "@/components/sunmi/SunmiCard";

/** Tono por clase de coincidencia. Tokens del tema, nunca colores fijos. */
const TONO = {
  exacta: "sunmi-text-success",
  parcial: "sunmi-text-accent",
  ambigua: "sunmi-text-danger",
  ninguna: "sunmi-text-muted",
};

/** Un indicador. Es un botón: todos abren su detalle. */
function Indicador({ grupo, activo, onAbrir }) {
  const vacio = grupo.filas === 0;
  return (
    <button
      type="button"
      onClick={() => onAbrir?.(grupo.vista)}
      disabled={vacio}
      aria-pressed={activo}
      title={grupo.detalle}
      className={`text-left rounded-lg border p-2.5 transition-colors ${
        activo ? "sunmi-border-accent border-2" : "sunmi-border"
      } ${vacio ? "opacity-45 cursor-default" : "sunmi-row-hover cursor-pointer"}`}
    >
      <div className={`text-[19px] font-bold tabular-nums leading-none ${TONO[grupo.clase] ?? ""}`}>
        {grupo.filas}
      </div>
      <div className="text-[11.5px] sunmi-text-strong leading-snug mt-1">{grupo.etiqueta}</div>
      {grupo.productos > 0 && grupo.productos !== grupo.filas && (
        <div className="text-[10.5px] sunmi-text-muted">{grupo.productos} productos distintos</div>
      )}
      <div className="text-[10.5px] sunmi-text-muted leading-snug mt-0.5">{grupo.detalle}</div>
    </button>
  );
}

export default function PanelMacheo({ macheo, vista, onVista }) {
  if (!macheo) return null;

  const { productosDelProveedor, totalFilas, productosAlcanzados, grupos, cierra } = macheo;
  const conDatos = grupos.filter((g) => g.filas > 0);
  const vacios = grupos.filter((g) => g.filas === 0);

  return (
    <SunmiCard className="p-3 space-y-3">
      <div>
        <h2 className="text-[13.5px] font-bold sunmi-text-strong">
          Macheo contra productos del ERP
        </h2>
        <p className="text-[11px] sunmi-text-muted leading-snug">
          Cómo se encontró el producto de cada fila. Los grupos no se pisan: cada fila cuenta
          en el criterio más preciso que dio resultado. Tocá cualquiera para ver el detalle.
        </p>
      </div>

      {/* ── Lo que trajo el archivo ──────────────────────────────────────
          El universo del ERP ya lo cuenta el encabezado, que es donde se mide
          el trabajo. Acá quedan los dos números del archivo. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="sunmi-surface-soft rounded-lg p-2.5">
          <div className="text-[19px] font-bold tabular-nums sunmi-text-strong leading-none">
            {totalFilas}
          </div>
          <div className="text-[11.5px] sunmi-text-strong mt-1">Filas del archivo</div>
          <div className="text-[10.5px] sunmi-text-muted leading-snug">
            Líneas de producto que trajo el Excel del proveedor.
          </div>
        </div>
        <div className="sunmi-surface-soft rounded-lg p-2.5">
          <div className="text-[19px] font-bold tabular-nums sunmi-text-strong leading-none">
            {productosAlcanzados}
          </div>
          <div className="text-[11.5px] sunmi-text-strong mt-1">Productos del ERP alcanzados</div>
          <div className="text-[10.5px] sunmi-text-muted leading-snug">
            Productos distintos que el archivo logró identificar, por cualquier camino.
          </div>
        </div>
      </div>

      {/* ── Los grupos con datos ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {conDatos.map((g) => (
          <Indicador key={g.id} grupo={g} activo={vista === g.vista} onAbrir={onVista} />
        ))}
      </div>

      {/* Los grupos en cero se muestran igual, apagados: que un criterio haya
          dado cero es información, y esconderlo haría creer que no existe. */}
      {vacios.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sunmi-text-muted">
          <span className="font-semibold">Sin resultados:</span>
          {vacios.map((g) => (
            <span key={g.id} title={g.detalle}>
              {g.etiqueta} 0
            </span>
          ))}
        </div>
      )}

      {!cierra && (
        <p className="text-[11.5px] sunmi-text-danger">
          Los grupos no suman el total de filas. Hay un problema de conteo: no confíes en estos
          números hasta revisarlo.
        </p>
      )}
    </SunmiCard>
  );
}
