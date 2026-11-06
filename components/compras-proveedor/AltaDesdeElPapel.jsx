"use client";

// CREAR EL PRODUCTO DESDE UN RENGLÓN QUE NO EXISTE EN EL CATÁLOGO.
//
// Myf #383, "HELLMANNS MAY LIVIANA DP 24X237G": no estaba en el catálogo y la
// hoja "Qué producto es" no tenía salida, había que irse de la recepción.
//
// No hay formulario nuevo: es `ModalProductoFinal`, el de "Nuevo producto" de
// Productos, con lo que el papel ya dice precargado (`precargaDelAlta`). Los
// catálogos salen de los mismos tres endpoints y el alta va por la misma ruta,
// `/api/productos/crear`, que revalida el permiso de crear productos.
//
// Al crear, devuelve el producto a quien lo abrió, que lo VINCULA por el camino
// de siempre —el que escribe el alias del proveedor—. Cancelar no crea nada.

import { useEffect, useMemo, useState } from "react";

import ModalProducto from "@/components/productos/ModalProductoFinal";
import SunmiOpcionElegible from "@/components/sunmi/SunmiOpcionElegible";
import useContextoActivo from "@/hooks/useContextoActivo";
import {
  codigoDelProveedorParaElAlta,
  costoDelAltaDesdeElPapel,
  precargaDelAlta,
  preguntaDelAltaDesdeElPapel,
} from "@/lib/compras-proveedor/altaDesdeElPapel";

/**
 * @param onCreado  `(producto, { precioEs })`: lo que eligió la persona viaja
 *                  al vínculo, que lo recuerda para el proveedor.
 */
export default function AltaDesdeElPapel({ fila, proveedorId, onCreado, onCancelar }) {
  const { contexto } = useContextoActivo();
  const localId = contexto?.localId || 0;
  const [catalogos, setCatalogos] = useState({ CATEGORIAS: [], PROVEEDORES: [], AREAS: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // ── POR LA CAJA O POR UNIDAD (DAS Mayorista, 2026-11-06) ───────────────
  // Lo mismo que `AltaDesdeLaLista`, copiado tal cual: arranca SIN elegir y,
  // hasta que la persona conteste, el costo queda vacío.
  const [precioEs, setPrecioEs] = useState(null);
  // Memorizada y SIN la respuesta: el formulario se reinicia cada vez que
  // cambia su `initialData`, y contestar no puede borrar lo que ya se cargó. El
  // costo de la respuesta entra aparte, por `costoSugerido`.
  const precarga = useMemo(() => precargaDelAlta({ fila, proveedorId }), [fila, proveedorId]);
  // Cada opción trae su cuenta, con la misma cuenta que el costo que carga.
  const pregunta = useMemo(() => preguntaDelAltaDesdeElPapel(fila), [fila]);
  const costoSugerido = pregunta ? costoDelAltaDesdeElPapel({ fila, precioEs }) : null;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cat, prov, area] = await Promise.all(
          ["/api/catalogos/categorias", "/api/catalogos/proveedores", "/api/catalogos/areas-fisicas"].map((u) =>
            fetch(u, { credentials: "include" }).then((r) => r.json())
          )
        );
        if (vivo) setCatalogos({ CATEGORIAS: cat?.items ?? [], PROVEEDORES: prov?.items ?? [], AREAS: area?.items ?? [] });
      } catch (e) {
        if (vivo) setError("No se pudieron cargar las categorías y los proveedores. Probá de nuevo.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // El fallo se avisa como lo avisa el alta de Productos: con el formulario
  // abierto y lo cargado intacto, para corregir y volver a guardar.
  const crear = async (form) => {
    try {
      const res = await fetch(`/api/productos/crear?localId=${localId}`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok || !data?.item?.id) {
        alert(data?.error || "No se pudo crear el producto.");
        return;
      }
      await onCreado?.(data.item, { precioEs });
    } catch (e) {
      alert("No se pudo crear el producto: se cortó la conexión.");
    }
  };

  return (
    <>
      {error && <span className="text-sm3 sunmi-text-danger break-words">{error}</span>}
      <ModalProducto
        // Sin catálogos no se abre: el aviso queda en la hoja, a la vista.
        open={!cargando && !error}
        onClose={onCancelar}
        onSubmit={crear}
        catalogos={catalogos}
        initialData={precarga}
        codigoProveedorAlCrear={codigoDelProveedorParaElAlta(fila)}
        antesDelCosto={
          // ── DISEÑO DE EMANUEL (2026-11-06), EL MISMO DE LISTAS ────────────
          // El título a todo el ancho, lo que dice la factura en gris, y las dos
          // opciones una abajo de la otra, cada una con su cuenta. La pieza es
          // `SunmiOpcionElegible` del kit; no envía el formulario.
          pregunta ? (
            <div role="radiogroup" aria-label={pregunta.titulo} className="flex flex-col gap-renglon">
              <p className="text-sm3 font-semibold sunmi-text-strong break-words">{pregunta.titulo}</p>
              <p className="text-xs2 sunmi-text-muted tabular-nums break-words">{pregunta.detalle}</p>
              {pregunta.opciones.map((o) => (
                <SunmiOpcionElegible
                  key={o.valor}
                  titulo={o.texto}
                  subtitulo={o.cuenta}
                  elegida={precioEs === o.valor}
                  onElegir={() => setPrecioEs(o.valor)}
                />
              ))}
            </div>
          ) : null
        }
        // Los rótulos de los dos campos de costo, SOLO en este circuito: la
        // pregunta habla de "caja" y "unidad", y los campos también.
        textosDelCosto={
          pregunta
            ? {
                costo: "Costo * (por caja)",
                ayudaCosto: precioEs ? null : "Elegí arriba si el precio es por caja o por unidad y se carga solo.",
                unitario: "Costo por unidad",
                ayudaUnitario: `Sale solo: costo de la caja ÷ ${pregunta.cantidad}.`,
              }
            : null
        }
        costoSugerido={costoSugerido}
      />
    </>
  );
}
