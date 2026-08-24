"use client";

import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { formatCantidad } from "@/lib/stock/presentacion";

// LA TARJETA DE UN PRODUCTO EN STOCK, PARA EL CELULAR.
//
// ── POR QUÉ NO SE REUSA `TarjetaProductoMovil` ────────────────────────────
//
// Porque muestra otra cosa. Aquélla es del CATÁLOGO: su número grande es el
// precio, y alrededor lleva costo, equivalencia y el botón de editar producto.
// Acá el número grande es el STOCK, y el diseño aprobado dice expresamente que
// no van precio, ni edición de producto, ni funciones de catálogo.
//
// Reusarla habría obligado a llenarla de condicionales para apagarle la mitad de
// lo que dibuja, y esa es la forma en que una pieza compartida deja de servir
// para los dos lados. Lo que sí se reusa es el KIT —`SunmiPanel`,
// `SunmiButton`— y el patrón de la tarjeta, no la tarjeta.
//
// ── LOS LÍMITES SIN AJUSTAR NO SE DIBUJAN COMO CERO ───────────────────────
//
// Es la regla que motivó toda la tanda. Un "mín 0 / máx 0" sobre un producto que
// nunca se configuró es una afirmación falsa con cara de dato: dice que alguien
// decidió que el mínimo es cero. Con `limitesConfigurados` en false se muestra
// "Sin ajustar", que es lo que realmente se sabe.

/** El alfa de "no hay dato" se decide acá y no en cada renglón. */
function Limite({ valor, configurados }) {
  if (!configurados) return <span className="sunmi-text-muted">Sin ajustar</span>;
  if (valor === null || valor === undefined) return <span className="sunmi-text-muted">—</span>;
  return <span className="sunmi-text-strong">{Number(valor).toLocaleString("es-AR")}</span>;
}

export default function TarjetaStockMovil({
  item,
  // El nombre del proveedor NO viene en la respuesta del listado —`mapItem` solo
  // expone `proveedorId`—, así que se resuelve con el catálogo que la pantalla
  // ya tiene cargado para el filtro. Se pasa resuelto y no se busca acá: la
  // tarjeta dibuja, no consulta.
  proveedorNombre = null,
  onAjustar,
  onLimites,
  puedeAjustar = true,
}) {
  const stock = Number(item?.stock ?? 0);
  const configurados = item?.limitesConfigurados === true;
  const negativo = stock < 0;
  // `faltante` lo calcula el servidor con la MISMA regla que cuenta la card de
  // "Bajo mínimo" — no se recalcula acá, que es como las dos se separarían.
  const bajoMinimo = item?.faltante === true;

  return (
    <SunmiPanel className="p-2.5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm2 font-semibold sunmi-text-strong leading-tight break-words">
            {item?.nombre || "—"}
          </p>
          {proveedorNombre && (
            <p className="text-xs sunmi-text-muted leading-tight">{proveedorNombre}</p>
          )}
        </div>

        {/* El bloque destacado: es lo que la persona vino a ver. La cantidad la
            formatea `formatCantidad`, que es la MISMA pieza que usa la tabla de
            escritorio — así kilos, unidades y fiambre se leen igual en las dos
            vistas en vez de divergir por un `toLocaleString` escrito al lado. */}
        <div className="shrink-0 text-right">
          <span
            className={[
              "block text-2xl font-bold leading-none [font-variant-numeric:tabular-nums]",
              negativo ? "sunmi-text-danger" : "sunmi-text-strong",
            ].join(" ")}
          >
            {formatCantidad(stock, item?.unidadMedida)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="sunmi-text-muted">
          mín <Limite valor={item?.stockMin} configurados={configurados} />
        </span>
        <span className="sunmi-text-muted">
          máx <Limite valor={item?.stockMax} configurados={configurados} />
        </span>
      </div>

      {/* La alerta va DESPUÉS del número y no lo reemplaza: el stock sigue
          siendo lo primero que se lee. */}
      {(negativo || bajoMinimo) && (
        <p
          role="status"
          className={negativo ? "text-xs sunmi-text-danger" : "text-xs sunmi-text-warning"}
        >
          {negativo ? "Stock negativo" : "Bajo mínimo"}
        </p>
      )}

      {/* ── EL CÓDIGO DE PROVEEDOR NO ESTÁ, Y NO SE INVENTA ─────────────────
          El diseño lo pide, pero `/api/stock_locales/listar` no lo devuelve:
          `mapItem` expone `codigoBarra` y `proveedorId`, y nada más. Traerlo
          significa sumar un join a `ProductoCodigoProveedor` en un endpoint que
          también sirve a la tabla de escritorio, así que es una decisión de
          alcance y no un renglón. Queda informado en vez de dibujado con un
          campo que no existe. */}
      {item?.codigoBarra && (
        <p className="text-xs sunmi-text-muted">Barra {item.codigoBarra}</p>
      )}

      {/* Las dos acciones quedan SEPARADAS, que es la regla de negocio: Ajustar
          mueve cantidad, Límites mueve mínimo y máximo. Juntarlas en un solo
          botón sería exactamente lo que el encargo prohíbe. */}
      {puedeAjustar && (
        <div className="flex gap-2 mt-0.5">
          <SunmiButton color="slate" className="flex-1" onClick={() => onAjustar?.(item)}>
            Ajustar
          </SunmiButton>
          <SunmiButton color="amber" className="flex-1" onClick={() => onLimites?.(item)}>
            Límites
          </SunmiButton>
        </div>
      )}
    </SunmiPanel>
  );
}
