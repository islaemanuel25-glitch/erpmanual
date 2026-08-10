"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { Trash2, X, Pencil, TriangleAlert } from "lucide-react";
import { subtotalLinea, unidadDisplay, naturalezaLinea } from "@/lib/compras-proveedor/calculoPedido";
import {
  compararCostoLinea,
  contarLineasConAviso,
  textoAvisoCosto,
  textoContadorAvisos,
} from "@/lib/compras-proveedor/avisoCostoLinea";

/**
 * Carrito del pedido a proveedor (rediseño "cart-first").
 * Lista SOLO las líneas con cantidad > 0 y permite editar cantidad/costo y
 * quitar, reusando los mismos handlers de la página (no duplica lógica ni
 * cambia estados del pedido). Se usa en dos variantes:
 *   - variant="aside"  → panel lateral sticky en desktop
 *   - variant="sheet"  → bottom-sheet desplegable en mobile
 */
export default function CarritoPedido({
  variant = "aside",
  proveedorNombre,
  items,
  total,
  notas,
  setNotas,
  notasReadonly = false,
  onCantidad,
  onBlurCantidad,
  onSetCantidad,
  onCosto,
  onBlurCosto,
  onQuitar,
  // Ir a editar el PRODUCTO de esta línea. Opcional: sin handler no hay botón.
  onEditarProducto,
  puedeEditarProducto = false,
  onGuardar,
  onConfirmar,
  saving = false,
  accionesDeshabilitadas = false,
  onClose,
}) {
  const lineas = items.filter((i) => Number(i.cantidad) > 0);

  const esSheet = variant === "sheet";

  // El costo se guarda a full precisión (fuente de verdad del subtotal); acá se
  // redondea SOLO para mostrar/editar (≤4 decimales, sin ceros sobrantes).
  const fmtCosto = (v) => {
    if (v === "" || v == null) return "";
    if (typeof v === "string") return v;
    if (!Number.isFinite(v)) return "";
    return String(Math.round(v * 10000) / 10000);
  };

  // Moneda es-AR (punto de miles, sin centavos) para subtotales y total.
  const NF_ARS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const fmtPesos = (n) => `$${NF_ARS.format(Math.round(Number(n) || 0))}`;
  const esDrawer = variant === "drawer";
  const listMax = esDrawer
    ? "max-h-[calc(100dvh-300px)]"
    : esSheet
    ? "max-h-[46dvh]"
    : "max-h-[42dvh]";

  const baseDe = (i) => ({
    modoCompraProveedor: i.modoCompra,
    unidad_medida: i.unidad_medida,
    factor_pack: i.factorPack,
    pesoReferenciaKg: i.pesoRefKg,
  });

  // Cuántas líneas tienen precio distinto del catálogo. Se cuenta con el módulo
  // compartido y NO acá: el detalle del pedido cuenta lo mismo con la misma
  // función, así que el umbral no se puede despegar entre las dos pantallas.
  const lineasConAvisoCosto = contarLineasConAviso(
    lineas.map((i) => ({
      precioLinea: i.precioCosto,
      unidad: i.unidadPedido,
      costoCatalogo: i.costoCatalogo,
      base: baseDe(i),
    }))
  );

  const linea = (i) => {
    const base = baseDe(i);
    const r = subtotalLinea({ base, cantidad: i.cantidad, costo: i.precioCosto });
    // ¿Lo que estoy pagando difiere del costo que tiene el producto en el
    // catálogo? El pedido ya no arrastra el costo, así que esta señal es lo
    // único que evita que el catálogo se quede viejo sin que nadie se entere.
    // No escribe nada: invita a abrir el lápiz.
    const cmp = compararCostoLinea({
      precioLinea: i.precioCosto,
      unidad: i.unidadPedido,
      costoCatalogo: i.costoCatalogo,
      base,
    });
    const disp = unidadDisplay(base, i.unidadPedido);
    const unidadTxt = disp === "PIEZA / por kg" ? "pieza" : disp.toLowerCase();
    const esPack = naturalezaLinea(base) === "PACK";
    const factor = Math.max(1, Number(i.factorPack) || 1);
    const qtyNum = Number(i.cantidad) || 0;
    return (
      <div key={i.productoLocalId} className="px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[12.5px] font-medium sunmi-text-strong leading-tight min-w-0"
            title={i.nombre}
          >
            {i.nombre}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {/* Editar el PRODUCTO, no la línea.
                El costo de la línea es lo que se le paga al proveedor por este
                pedido; el costo del catálogo se cambia en editar producto y en
                ningún otro lado. Este botón lleva ahí y vuelve acá con el pedido
                intacto.
                Solo aparece si quien está cargando el pedido tiene permiso de
                editar productos: son dos permisos distintos y separables, así
                que un botón incondicional se rompería en la cara de quien no lo
                tiene. */}
            {puedeEditarProducto && onEditarProducto && i.baseId ? (
              <button
                type="button"
                onClick={() => onEditarProducto(i)}
                aria-label={`Editar ${i.nombre}`}
                title="Editar el producto (precio, códigos, datos)"
                className="w-[24px] h-[24px] inline-flex items-center justify-center rounded-md sunmi-control shrink-0"
              >
                <Pencil size={12} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onQuitar(i.productoLocalId)}
              aria-label={`Quitar ${i.nombre}`}
              title="Quitar del pedido"
              className="w-[24px] h-[24px] inline-flex items-center justify-center rounded-md sunmi-btn-red shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          {/* Stepper cantidad */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onSetCantidad(i.productoLocalId, (Number(i.cantidad) || 1) - 1)}
              aria-label="Restar cantidad"
              className="w-[24px] h-[24px] flex items-center justify-center rounded sunmi-control text-[15px] leading-none"
            >
              −
            </button>
            {/* 50 px con `!px-1` deja 42 útiles: entran cinco cifras. Con el
                padding de fábrica quedaban 32 y "18700" ya se cortaba, y una
                cantidad en unidades llega ahí sin esfuerzo.
                `shrink-0` es imprescindible: esto vive en una fila flex y sin él
                el input cede ancho cuando el renglón aprieta, que es justo lo
                que había que evitar. */}
            <SunmiInput
              type="text"
              inputMode="numeric"
              value={i.cantidad}
              onChange={(e) => onCantidad(i.productoLocalId, e.target.value)}
              onBlur={() => onBlurCantidad(i.productoLocalId)}
              className="w-[50px] shrink-0 !py-0.5 !px-1 text-center text-[12px] tabular-nums"
              aria-label="Cantidad"
            />
            <button
              type="button"
              onClick={() => onSetCantidad(i.productoLocalId, (Number(i.cantidad) || 0) + 1)}
              aria-label="Sumar cantidad"
              className="w-[24px] h-[24px] flex items-center justify-center rounded sunmi-control text-[15px] leading-none"
            >
              +
            </button>
          </div>
          <span className="text-[10px] sunmi-text-muted shrink-0">{unidadTxt}</span>
          <span className="text-[10px] sunmi-text-muted shrink-0">×</span>
          <SunmiInput
            type="text"
            inputMode="decimal"
            value={fmtCosto(i.precioCosto)}
            onChange={(e) => onCosto(i.productoLocalId, e.target.value)}
            onBlur={() => onBlurCosto(i.productoLocalId)}
            className="w-[74px] shrink-0 !py-0.5 !px-1 text-right text-[12px] tabular-nums"
            aria-label="Costo"
          />
        </div>
        {/* El subtotal baja a su propio renglón, alineado a la derecha.
            Compartía fila con el stepper, la unidad y el costo, y en 360 px no
            entraba: quedaba cortado contra el borde ("$822…"). Es el mismo
            criterio de la fila del listado — lo que no entra baja, no se corta. */}
        <div className="flex items-baseline justify-end mt-1">
          <span className="text-[12.5px] font-semibold tabular-nums sunmi-text-strong">
            {r.subtotal != null ? (
              fmtPesos(r.subtotal)
            ) : (
              <span className="sunmi-text-accent" title={r.advertencia || ""}>
                ⚠ {r.advertencia || "sin subtotal"}
              </span>
            )}
          </span>
        </div>
        {cmp.hayDiferencia && (
          <div
            className="flex items-center gap-1 mt-1 text-[10px] sunmi-text-warning"
            title={textoAvisoCosto(cmp)}
            data-aviso-costo={cmp.sentido}
          >
            <TriangleAlert size={11} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              {cmp.sentido === "sube" ? "Más caro" : "Más barato"} que el catálogo
              {" "}({fmtPesos(cmp.costoCatalogo)})
            </span>
          </div>
        )}
        {esPack && (
          <div className="text-[10px] sunmi-text-muted mt-1">
            1 pack = {factor} un
            {disp === "BULTO" && qtyNum > 0 && (
              <span className="sunmi-text-accent"> · equivale a {qtyNum * factor} un</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const cuerpo = (
    <>
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b sunmi-divider">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold sunmi-text-strong leading-tight">
            Resumen del pedido
          </h3>
          {proveedorNombre && (
            <p className="text-[11px] sunmi-text-muted truncate" title={proveedorNombre}>
              {proveedorNombre}
            </p>
          )}
          {/* Arriba de la lista: en un pedido de 50 líneas, un aviso que hay que
              ir a buscar bajando no sirve. */}
          {lineasConAvisoCosto > 0 && (
            <p
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] sunmi-text-warning"
              data-contador-avisos={lineasConAvisoCosto}
            >
              <TriangleAlert size={11} className="shrink-0" aria-hidden="true" />
              {textoContadorAvisos(lineasConAvisoCosto)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] sunmi-text-muted">
            {lineas.length} {lineas.length === 1 ? "producto" : "productos"}
          </span>
          {(esSheet || esDrawer) && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar resumen"
              title="Volver a editar"
              className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-md sunmi-control"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Líneas editables */}
      <div
        className={`${listMax} overflow-y-auto border rounded-lg sunmi-border divide-y sunmi-divide`}
      >
        {lineas.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs sunmi-text-muted">
            Todavía no cargaste productos. Ajustá cantidades en el catálogo.
          </div>
        ) : (
          lineas.map(linea)
        )}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[12px] sunmi-text-muted">Total estimado</span>
        <b className="text-[16px] sunmi-text-accent tabular-nums">{fmtPesos(total)}</b>
      </div>

      {/* Notas */}
      <div className="mt-2">
        <label className="block text-[11px] sunmi-text-muted mb-0.5">Notas</label>
        {notasReadonly ? (
          <div className="px-2.5 py-1 rounded-md sunmi-control text-[12px] sunmi-text-muted">
            {notas || "—"}
          </div>
        ) : (
          <SunmiInput
            placeholder="Notas opcionales..."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="!py-1 text-[12px]"
          />
        )}
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-1.5 mt-3">
        <SunmiButton
          color="cyan"
          type="button"
          className="w-full"
          disabled={accionesDeshabilitadas}
          onClick={onGuardar}
        >
          {saving ? "Guardando..." : "Guardar borrador"}
        </SunmiButton>
        <SunmiButton
          color="amber"
          type="button"
          className="w-full"
          disabled={accionesDeshabilitadas}
          onClick={onConfirmar}
        >
          Confirmar pedido ▸
        </SunmiButton>
      </div>
    </>
  );

  if (esSheet) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
        />
        <div className="relative sunmi-surface rounded-t-2xl border-t sunmi-divider p-3 shadow-[0_-2px_20px_rgba(0,0,0,0.35)]">
          {cuerpo}
        </div>
      </div>
    );
  }

  if (esDrawer) {
    return (
      <div className="fixed inset-0 z-[9999] flex justify-end">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute inset-0 bg-black/50"
        />
        <div className="relative sunmi-surface h-full w-full max-w-[420px] border-l sunmi-divider p-4 shadow-[-2px_0_24px_rgba(0,0,0,0.35)] overflow-y-auto">
          {cuerpo}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm p-3">
      {cuerpo}
    </div>
  );
}
