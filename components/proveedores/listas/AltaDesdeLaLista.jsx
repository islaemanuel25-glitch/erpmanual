"use client";

// CREAR EL PRODUCTO DESDE UN RENGLÓN DE LA LISTA QUE NO EXISTE EN EL CATÁLOGO.
//
// Es la HERMANA de `components/compras-proveedor/AltaDesdeElPapel.jsx`, copiada
// tal cual (Emanuel, 2026-11-04: "exactamente igual a la recepción"). Lo único
// que cambia es de dónde sale la precarga: `precargaDelAltaDesdeLaLista`, que
// lee una `ImportacionListaFila` en vez de un renglón del papel.
//
// No hay formulario nuevo: es `ModalProductoFinal`, el de "Nuevo producto" de
// Productos, sin tocarlo. Los catálogos salen de los mismos tres endpoints y el
// alta va por la misma ruta, `/api/productos/crear`, que revalida el permiso de
// crear productos y decide sola dónde se da de alta (depósito y locales).
//
// Al crear, devuelve el producto a quien lo abrió, que lo VINCULA por
// `filas/[filaId]/vincular`. Cancelar no crea nada.

import { useEffect, useMemo, useState } from "react";

import ModalProducto from "@/components/productos/ModalProductoFinal";
import SunmiSelectorUnidad from "@/components/sunmi/SunmiSelectorUnidad";
import useContextoActivo from "@/hooks/useContextoActivo";
import {
  codigoDelProveedorParaElAltaDesdeLaLista,
  precargaDelAltaDesdeLaLista,
} from "@/lib/proveedores/listas/altaDesdeLaLista";
import {
  costoDelAltaDesdeLaLista,
  preguntaDelPrecioDeLaLista,
} from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";

/**
 * @param cuentaDeLaLista  `{ recargoPct, impuestoAdicionalPct }` de la
 *                         importación: la misma cuenta que aplicar le hace al
 *                         precio del renglón.
 * @param onCreado         `(producto, { precioEs })`: lo que eligió la persona
 *                         viaja al vínculo, que lo recuerda para el proveedor.
 */
export default function AltaDesdeLaLista({ fila, proveedorId, cuentaDeLaLista = null, onCreado, onCancelar }) {
  const { contexto } = useContextoActivo();
  const localId = contexto?.localId || 0;
  const [catalogos, setCatalogos] = useState({ CATEGORIAS: [], PROVEEDORES: [], AREAS: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // ── POR LA CAJA O POR UNIDAD (Emanuel, 2026-11-06) ─────────────────────
  // Arranca SIN elegir: hasta que la persona conteste, el costo queda vacío.
  const [precioEs, setPrecioEs] = useState(null);
  const recargoPct = cuentaDeLaLista?.recargoPct ?? 0;
  const impuestoAdicionalPct = cuentaDeLaLista?.impuestoAdicionalPct ?? null;
  // Memorizada y SIN la respuesta: el formulario se reinicia cada vez que
  // cambia su `initialData`, y contestar no puede borrar lo que ya se cargó. El
  // costo de la respuesta entra aparte, por `costoSugerido`.
  // Sin pregunta (sin cantidad, o 1), el costo ya se sabe y va en la precarga;
  // con pregunta, `costoDelAltaDesdeLaLista` sin respuesta da null y queda vacío.
  const precarga = useMemo(
    () =>
      precargaDelAltaDesdeLaLista({
        fila,
        proveedorId,
        costo: costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct }),
      }),
    [fila, proveedorId, recargoPct, impuestoAdicionalPct]
  );
  const pregunta = useMemo(() => preguntaDelPrecioDeLaLista(fila), [fila]);
  const costoSugerido = pregunta
    ? costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct, precioEs })
    : null;

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
        codigoProveedorAlCrear={codigoDelProveedorParaElAltaDesdeLaLista(fila)}
        antesDelCosto={
          pregunta ? (
            <SunmiSelectorUnidad
              rotulo={pregunta.texto}
              opciones={pregunta.opciones.map((o) => ({ clave: o.valor, texto: o.texto }))}
              valor={precioEs}
              onCambiar={setPrecioEs}
              nota={precioEs ? null : "Elegí una para que se cargue el costo."}
            />
          ) : null
        }
        costoSugerido={costoSugerido}
      />
    </>
  );
}
