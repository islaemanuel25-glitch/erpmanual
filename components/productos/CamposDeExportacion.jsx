"use client";

// QUÉ BAJA UNA EXPORTACIÓN DEL CATÁLOGO: el proveedor y la categoría.
//
// Salió de la solapa Import / Export de `app/modulos/productos/page.jsx`, tal
// cual estaba, el 2026-10-31: la lista de precios en PDF hace exactamente la
// misma pregunta —qué proveedor, qué categoría, o todos— y escribirla otra vez
// en su panel era tener dos selectores que un día dejan de coincidir.
//
// No reemplaza a los de `FiltrosProductos`: aquéllos filtran lo que se VE en el
// catálogo —con buscador y sin "Todos"— y estos eligen qué se BAJA. Son dos
// preguntas distintas aunque usen las mismas listas.
//
// Devuelve los dos campos sueltos, sin envoltorio: la grilla es de quien los
// pone, porque la solapa los acomoda en dos columnas y el panel en una.

import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

/**
 * @param {object} catalogos      `{ PROVEEDORES, CATEGORIAS }`, los de la pantalla
 * @param {string} proveedorId    "" es todos
 * @param {string} categoriaId    "" es todas
 * @param {string} [rotuloCategoria] la lista de precios la llama "Tipo": es lo
 *                                que Emanuel pidió poder elegir —frío,
 *                                almacén— y en este catálogo eso es la categoría.
 * @param {string} [textoTodasCategorias]
 */
export default function CamposDeExportacion({
  catalogos,
  proveedorId,
  onProveedor,
  categoriaId,
  onCategoria,
  rotuloCategoria = "Categoría",
  textoTodasCategorias = "Todas",
}) {
  return (
    <>
      <div>
        <label className="text-sm2 sunmi-text-muted mb-1 block">Proveedor</label>
        <SunmiSelectAdv
          value={proveedorId}
          onChange={(val) => onProveedor(val)}
        >
          <option value="">Todos</option>
          {catalogos.PROVEEDORES.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </SunmiSelectAdv>
      </div>

      <div>
        <label className="text-sm2 sunmi-text-muted mb-1 block">{rotuloCategoria}</label>
        <SunmiSelectAdv
          value={categoriaId}
          onChange={(val) => onCategoria(val)}
        >
          <option value="">{textoTodasCategorias}</option>
          {catalogos.CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </SunmiSelectAdv>
      </div>
    </>
  );
}
