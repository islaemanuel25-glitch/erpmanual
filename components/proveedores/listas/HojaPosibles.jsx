"use client";

// "PUEDEN SER DE DAB": PRODUCTOS TUYOS QUE NO FIGURAN COMO DEL PROVEEDOR Y SE
// PARECEN A UN RENGLÓN QUE QUEDÓ SIN VINCULAR (Emanuel, 2026-10-24).
//
// La búsqueda corre RECIÉN al abrir esta hoja, que se abre con «Buscar en el
// resto de mis productos»: la pantalla no la monta sola y la ruta no la llama
// nadie más. Mientras busca dice "Buscando…" —medido: un cuarto de segundo con
// 1.450 renglones contra 2.600 productos, así que no hace falta más que eso—.
//
// Una tarjeta por producto: el nombre grande, con qué proveedor figura hoy, y
// la pregunta "¿Es 4148 · GRANIX BOCADITOS FRUTILLA 2KG?" con su precio.
//
//   «✓ Sí»  la vinculación de siempre (`en-la-lista`) con `sumarProveedor`: el
//           código queda guardado, el renglón se recalcula con el motor de la
//           lista, y el proveedor se suma en un lugar libre sin tocar los que
//           el producto ya tiene. El producto pasa a la revisión.
//   «No»    se recuerda que ese renglón no es ese producto, y no se vuelve a
//           proponer en las próximas listas de este proveedor.
//
// Nunca vincula sola: las dos salidas son un toque.

import { useEffect, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { TarjetaDeRevision, CLASE_ACCION_CORREGIR, CLASE_ACCION_RAPIDA } from "@/components/revision/PiezasDeRevision";
import { money } from "@/components/proveedores/listas/PiezasPantallas";
import { preguntaDeLaSugerencia, TEXTO_SI } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";

export const TEXTO_BUSCANDO = "Buscando…";
export const TEXTO_NO = "No";
export const TEXTO_SIN_POSIBLES = "No encontré productos tuyos que parezcan de esta lista.";

/** "Pueden ser de Dab". */
export function tituloDePosibles(proveedor) {
  return proveedor ? `Pueden ser de ${proveedor}` : "Pueden ser de este proveedor";
}

/**
 * Una tarjeta de la hoja. Con la forma de las de la revisión
 * (`TarjetaDeRevision`): el caso feliz arriba a la derecha, el «No» abajo.
 */
export function TarjetaPosible({ item, trabajando = false, error = "", onSi, onNo }) {
  return (
    <TarjetaDeRevision
      nombre={item.nombre}
      debajo={
        <>
          <p className="text-xs sunmi-text-muted">{item.proveedoresDeHoy}</p>
          <p className="text-sm2 sunmi-text-strong break-words">{preguntaDeLaSugerencia(item.renglon)}</p>
          <p className="text-xs sunmi-text-muted tabular-nums">{money(item.renglon?.precio)}</p>
        </>
      }
      accionArriba={
        <SunmiButton onClick={() => onSi?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_RAPIDA}`}>
          {TEXTO_SI}
        </SunmiButton>
      }
      avisos={error ? <p className="text-sm2 sunmi-text-danger">{error}</p> : null}
      accionAbajo={
        <SunmiButton onClick={() => onNo?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
          {TEXTO_NO}
        </SunmiButton>
      }
      data-producto={item.productoBaseId}
    />
  );
}

/**
 * @param importacionId  la lista
 * @param proveedor      el nombre, para el título
 * @param onCambio       se vinculó uno: la pantalla relee la revisión
 * @param onCerrar       cerrar la hoja
 */
export default function HojaPosibles({ importacionId, proveedor, onCambio, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [tocando, setTocando] = useState(null);
  const [errores, setErrores] = useState(() => new Map());

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/proveedores/listas/${importacionId}/posibles`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !j?.ok) {
          setError(j?.error || "No se pudo buscar en el resto de tus productos.");
          return;
        }
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch {
        if (vivo) setError("No se pudo conectar con el servidor. Probá de nuevo.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [importacionId]);

  /** Un pedido desde una tarjeta: si sale, la tarjeta se va; si no, el error queda pegado a ella. */
  const pedir = async (item, url, cuerpo, textoSiFalla, alSalir) => {
    setTocando(item.productoBaseId);
    setErrores((prev) => {
      const m = new Map(prev);
      m.delete(item.productoBaseId);
      return m;
    });
    try {
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErrores((prev) => new Map(prev).set(item.productoBaseId, `${j?.error || textoSiFalla} No se guardó nada.`));
        return;
      }
      setItems((prev) => prev.filter((x) => x.productoBaseId !== item.productoBaseId));
      alSalir?.();
    } catch {
      setErrores((prev) =>
        new Map(prev).set(item.productoBaseId, "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.")
      );
    } finally {
      setTocando(null);
    }
  };

  const si = (item) =>
    pedir(
      item,
      `/api/proveedores/listas/${importacionId}/productos/${item.productoBaseId}/en-la-lista`,
      { filaElegidaId: item.renglon.id, sumarProveedor: true },
      "El servidor no pudo vincularlo y no dijo por qué.",
      onCambio
    );

  const no = (item) =>
    pedir(
      item,
      `/api/proveedores/listas/${importacionId}/posibles`,
      { productoBaseId: item.productoBaseId, filaId: item.renglon.id },
      "El servidor no pudo guardar la respuesta y no dijo por qué."
    );

  return (
    <SunmiModalLayout
      open
      forma="hoja"
      title={tituloDePosibles(proveedor)}
      color="amber"
      onClose={tocando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
    >
      {cargando ? (
        <>
          <p className="text-sm2 sunmi-text-muted">{TEXTO_BUSCANDO}</p>
          <SunmiLoader />
        </>
      ) : error ? (
        <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm2 sunmi-text-muted leading-snug">{TEXTO_SIN_POSIBLES}</p>
      ) : (
        items.map((item) => (
          <TarjetaPosible
            key={item.productoBaseId}
            item={item}
            trabajando={tocando === item.productoBaseId}
            error={errores.get(item.productoBaseId) ?? ""}
            onSi={si}
            onNo={no}
          />
        ))
      )}
    </SunmiModalLayout>
  );
}
