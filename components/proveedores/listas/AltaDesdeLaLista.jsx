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
import SunmiOpcionElegible from "@/components/sunmi/SunmiOpcionElegible";
import useContextoActivo from "@/hooks/useContextoActivo";
import {
  bultoDeLaFila,
  codigoDelProveedorParaElAltaDesdeLaLista,
  precargaDelAltaDesdeLaLista,
} from "@/lib/proveedores/listas/altaDesdeLaLista";
import {
  PRECIO_ES,
  costoDelAltaDesdeLaLista,
  preguntaDelPrecioDeLaLista,
} from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";
import { OPCIONES_PACK_LATA, esLata, packDeLataCoherente, precioPorLataDeReferencia } from "@/lib/productos/packDeLata";

/**
 * @param cuentaDeLaLista  `{ recargoPct, impuestoAdicionalPct }` de la
 *                         importación: la misma cuenta que aplicar le hace al
 *                         precio del renglón.
 * @param onCreado         `(producto, { precioEs })`: lo que eligió la persona
 *                         viaja al vínculo, que lo recuerda para el proveedor.
 */
// `nombre`: el del papel, cuando el alta se abre desde la recepción (Dab 2530,
// 2026-11-18). De la lista salen el pack, el precio y el código; el nombre del
// producto es el que dice el papel. En Listas no se pasa: queda el del renglón.
export default function AltaDesdeLaLista({ fila, proveedorId, cuentaDeLaLista = null, nombre = null, onCreado, onCancelar }) {
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
  // ── UNA LATA: EL PRECIO POR LATA DE LAS OTRAS DEL PROVEEDOR (2026-11-18) ─
  // Con él se ve si el pack propuesto da un precio por lata coherente
  // (`packDeLata.js`). Solo se pide si el renglón es una lata.
  const lata = esLata(fila?.descripcionProveedor);
  const [referenciaPorLata, setReferenciaPorLata] = useState(null);
  const bultoPropuesto = useMemo(() => {
    const propuesto = bultoDeLaFila(fila);
    if (!lata) return propuesto;
    const precioCaja = costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct, precioEs: PRECIO_ES.CAJA, bulto: propuesto });
    return packDeLataCoherente({ propuesto, precioCaja, referenciaPorLata });
  }, [fila, lata, recargoPct, impuestoAdicionalPct, referenciaPorLata]);
  // ── EL FACTOR PACK EN VIVO (2026-11-18) ──────────────────────────────
  // El que tiene el formulario: la pregunta "Por la caja de N", el costo de la
  // respuesta y lo que se recuerda lo siguen si alguien lo cambia. `undefined`
  // hasta que el formulario avisa el primero; vacío o 1 no es un pack.
  const [factorEnVivo, setFactorEnVivo] = useState(undefined);
  const bultoParaLaCuenta = factorEnVivo === undefined ? bultoPropuesto : factorEnVivo ?? 1;
  const precarga = useMemo(
    () =>
      precargaDelAltaDesdeLaLista({
        fila,
        proveedorId,
        costo: costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct, bulto: bultoPropuesto }),
        bulto: bultoPropuesto,
        nombre,
      }),
    [fila, proveedorId, recargoPct, impuestoAdicionalPct, bultoPropuesto, nombre]
  );
  // Cada opción trae su cuenta, con la misma cuenta que el costo que carga.
  const pregunta = useMemo(
    () => preguntaDelPrecioDeLaLista(fila, { recargoPct, impuestoAdicionalPct, bulto: bultoParaLaCuenta }),
    [fila, recargoPct, impuestoAdicionalPct, bultoParaLaCuenta]
  );
  const costoSugerido = pregunta
    ? costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct, precioEs, bulto: bultoParaLaCuenta })
    : null;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cat, prov, area, delProveedor] = await Promise.all([
          ...["/api/catalogos/categorias", "/api/catalogos/proveedores", "/api/catalogos/areas-fisicas"].map((u) =>
            fetch(u, { credentials: "include" }).then((r) => r.json())
          ),
          // Las latas del proveedor, para el precio por lata de referencia. Si
          // no llega, el pack propuesto queda el del nombre.
          lata && Number(proveedorId) > 0
            ? fetch(`/api/compras-proveedor/productos?proveedorId=${Number(proveedorId)}`, { credentials: "include" })
                .then((r) => r.json())
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (vivo) setReferenciaPorLata(precioPorLataDeReferencia(delProveedor?.items ?? []));
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
      await onCreado?.(data.item, { precioEs, bulto: bultoParaLaCuenta });
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
          // ── DISEÑO DE EMANUEL (2026-11-06) ────────────────────────────────
          // El título a todo el ancho, lo que dice la lista en gris, y las dos
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
        onFactorPack={setFactorEnVivo}
        opcionesDeFactor={lata ? OPCIONES_PACK_LATA : null}
      />
    </>
  );
}
