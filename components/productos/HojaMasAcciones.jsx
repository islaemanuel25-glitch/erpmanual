"use client";

// LA HOJA DE "MÁS": lo que no entra en la barra de acciones del celular.
//
// ── POR QUÉ TRES BOTONES ARRIBA Y EL RESTO ACÁ ──────────────────────────────
//
// A 390 px entran tres botones legibles en una fila. Antes había cuatro apilados
// en columna —`flex-col md:flex-row`—, o sea cuatro renglones de botón antes de
// ver el primer producto. La barra se queda con lo que se usa todos los días
// —crear, filtrar— y lo demás baja acá.
//
// ── NO ES UNA CAPA NUEVA: ES `SunmiModalLayout` CON `forma="hoja"` ─────────
//
// La pieza del kit ya sabe hacer hoja inferior desde que se le sacó la forma a
// `CarritoPedido`, con su velo medido, su pila de `Escape` y su portal al
// `body`. Escribir una capa al lado sería la número 33 de las hechas a mano, con
// su propio velo y su propio manejo de teclado — y el día que el kit cambie,
// ésta se queda atrás.

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { Layers, TrendingUp, FileSpreadsheet, LayoutGrid } from "lucide-react";

/**
 * UNA OPCIÓN DE LA HOJA.
 *
 * No es `SunmiButton` por lo mismo que la fila de acciones de la tarjeta: aquél
 * es un botón CON CUERPO —fondo, esquinas y padding propios— y esto es un
 * renglón de menú de ancho completo con un ícono a la izquierda. Es el mismo
 * recurso que ya usan las acciones por fila de `SunmiTablaProductos`.
 */
function Opcion({ icono: Icono, etiqueta, descripcion, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 44 px de alto mínimo: el de WCAG 2.5.5. Escrito y no `h-11` porque en
      // esta aplicación 1 rem son 14 px, así que `h-11` daría 38,5.
      className="w-full flex items-center gap-3 text-left rounded-lg px-2.5 py-2 min-h-[44px] sunmi-row-hover"
    >
      <Icono className="w-4 h-4 shrink-0 sunmi-text-muted" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium sunmi-text-strong">{etiqueta}</span>
        {descripcion && (
          <span className="block text-[10.5px] sunmi-text-muted leading-[1.3]">{descripcion}</span>
        )}
      </span>
    </button>
  );
}

/**
 * @param {bool} open
 * @param {func} onClose
 * @param {object} acciones  los cuatro manejadores; los trae la pantalla porque
 *                           son suyos —navegan, abren modales— y esta hoja no
 *                           tiene por qué saber a dónde van.
 * @param {bool} puedeExportar  el permiso de `costos.ver`, ya resuelto por la
 *                              pantalla. Sin él, Import / Export no se ofrece:
 *                              un botón que contesta 403 al tocarlo es la clase
 *                              de cosa que después se reporta como "anda mal".
 */
export default function HojaMasAcciones({
  open,
  onClose,
  onNuevoCombo,
  onActualizacionPrecios,
  onImportExport,
  onPersonalizarCard,
  puedeExportar = true,
}) {
  // Cerrar la hoja al elegir: quedarse abierta sobre la pantalla que se acaba de
  // abrir tapa justo lo que la persona fue a ver.
  const elegir = (accion) => () => {
    onClose?.();
    accion?.();
  };

  return (
    <SunmiModalLayout
      open={open}
      onClose={onClose}
      title="Más acciones"
      forma="hoja"
      z={9999}
      espacioCuerpo="mt-2 gap-1"
      // No es un formulario: no hay nada escrito que perder si el velo cierra.
      // Ver el criterio de `destructivo` en la pieza — es qué se pierde, no qué
      // tan peligrosa es la acción.
      maxWidth="max-w-xl"
    >
      <Opcion
        icono={Layers}
        etiqueta="+ Combo"
        descripcion="Un producto armado con otros productos"
        onClick={elegir(onNuevoCombo)}
      />
      <Opcion
        icono={TrendingUp}
        etiqueta="Actualización de precios"
        descripcion="Aumentos por proveedor, planilla o reglas"
        onClick={elegir(onActualizacionPrecios)}
      />
      {puedeExportar && (
        <Opcion
          icono={FileSpreadsheet}
          etiqueta="Import / Export"
          descripcion="Bajar el catálogo o subir una planilla"
          onClick={elegir(onImportExport)}
        />
      )}
      <Opcion
        icono={LayoutGrid}
        etiqueta="Personalizar card"
        descripcion="Qué datos muestra cada producto"
        onClick={elegir(onPersonalizarCard)}
      />
    </SunmiModalLayout>
  );
}
