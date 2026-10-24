"use client";

// "PUEDEN SER DE DAB": PRODUCTOS TUYOS QUE NO FIGURAN COMO DEL PROVEEDOR Y SE
// PARECEN A UN RENGLÓN QUE QUEDÓ SIN VINCULAR (Emanuel, 2026-10-24).
//
// La búsqueda corre RECIÉN al abrir esta hoja, que se abre con «Buscar en el
// resto de mis productos»: la pantalla no la monta sola y la ruta no la llama
// nadie más. Mientras busca dice "Buscando…" —medido: un cuarto de segundo con
// 1.450 renglones contra 2.600 productos, así que no hace falta más que eso—.
//
// Dos pestañas, con los chips de la pantalla (`SunmiFiltroEstado`):
//
//   «Por revisar»  una tarjeta por producto: el nombre grande, con qué
//                  proveedor figura hoy, y la pregunta "¿Es 4148 · GRANIX
//                  BOCADITOS FRUTILLA 2KG?" con su precio.
//                    «✓ Sí»  la vinculación de siempre (`en-la-lista`) con
//                            `sumarProveedor`: el código queda guardado, el
//                            renglón se recalcula con el motor de la lista, y el
//                            proveedor se suma en un lugar libre sin tocar los
//                            que el producto ya tiene. Pasa a «Aceptados».
//                    «No»    ese renglón no es ese producto, y no se vuelve a
//                            proponer en las próximas listas del proveedor.
//                    «Otro»  la hoja de vincular de siempre, con el nombre del
//                            producto en el buscador: el renglón elegido se
//                            vincula igual que «✓ Sí» y pasa a «Aceptados».
//   «Aceptados»    los sumados a ESTA lista, con el renglón al que quedaron
//                  atados. Salen de la base (`ProductoSumadoALaLista`): siguen
//                  ahí al cerrar y volver a abrir. «Deshacer» saca el vínculo y
//                  el proveedor que se le sumó, deja el que tenía antes, y la
//                  tarjeta vuelve a «Por revisar».
//
// Nunca vincula sola: todas las salidas son un toque.

import { useCallback, useEffect, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import { TarjetaDeRevision, CLASE_ACCION_CORREGIR, CLASE_ACCION_RAPIDA } from "@/components/revision/PiezasDeRevision";
import { money } from "@/components/proveedores/listas/PiezasPantallas";
import { preguntaDeLaSugerencia, TEXTO_SI } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import HojaVincularConLaLista from "@/components/proveedores/listas/HojaVincularConLaLista";

export const TEXTO_BUSCANDO = "Buscando…";
export const TEXTO_NO = "No";
export const TEXTO_OTRO = "Otro";
export const TEXTO_DESHACER_ACEPTADO = "Deshacer";
export const TEXTO_SIN_POSIBLES = "No encontré productos tuyos que parezcan de esta lista.";
export const TEXTO_SIN_ACEPTADOS = "Todavía no aceptaste ninguno en esta lista.";
export const TEXTO_SIN_RENGLON = "Ya no está atado a ningún renglón de esta lista.";

export const PESTANA = Object.freeze({ POR_REVISAR: "POR_REVISAR", ACEPTADOS: "ACEPTADOS" });
export const TEXTO_PESTANA = Object.freeze({
  [PESTANA.POR_REVISAR]: "Por revisar",
  [PESTANA.ACEPTADOS]: "Aceptados",
});

/** "Pueden ser de Dab". */
export function tituloDePosibles(proveedor) {
  return proveedor ? `Pueden ser de ${proveedor}` : "Pueden ser de este proveedor";
}

/** Las dos pestañas con su cantidad, para los chips. */
export function pestanasDePosibles({ items = [], aceptados = [] } = {}) {
  return [
    { clave: PESTANA.POR_REVISAR, texto: TEXTO_PESTANA[PESTANA.POR_REVISAR], cantidad: items.length },
    { clave: PESTANA.ACEPTADOS, texto: TEXTO_PESTANA[PESTANA.ACEPTADOS], cantidad: aceptados.length },
  ];
}

/**
 * «✓ Sí» o «Otro» salieron: la tarjeta deja «Por revisar» y entra a
 * «Aceptados» con el renglón al que quedó atada.
 */
export function pasarAAceptados({ items = [], aceptados = [] }, item, renglon = item?.renglon ?? null) {
  return {
    items: items.filter((x) => x.productoBaseId !== item.productoBaseId),
    aceptados: [
      ...aceptados.filter((x) => x.productoBaseId !== item.productoBaseId),
      { productoBaseId: item.productoBaseId, nombre: item.nombre, renglon },
    ],
  };
}

/**
 * «Deshacer» salió: la tarjeta deja «Aceptados» y vuelve a «Por revisar» con
 * el renglón que tenía y los proveedores con que quedó. Sin renglón —alguien
 * lo desató desde la revisión— no hay pregunta que hacer: la próxima búsqueda
 * decide si lo propone.
 */
export function volverAPorRevisar({ items = [], aceptados = [] }, item, proveedoresDeHoy) {
  const sinEl = aceptados.filter((x) => x.productoBaseId !== item.productoBaseId);
  if (!item.renglon) return { items, aceptados: sinEl };
  return {
    items: [...items.filter((x) => x.productoBaseId !== item.productoBaseId), { ...item, proveedoresDeHoy }].sort((a, b) =>
      String(a.nombre).localeCompare(String(b.nombre), "es")
    ),
    aceptados: sinEl,
  };
}

/**
 * Una tarjeta de «Por revisar». Con la forma de las de la revisión
 * (`TarjetaDeRevision`): el caso feliz arriba a la derecha; «No» y «Otro»
 * abajo a la izquierda.
 */
export function TarjetaPosible({ item, trabajando = false, error = "", onSi, onNo, onOtro }) {
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
        <div className="flex items-center gap-2">
          <SunmiButton onClick={() => onNo?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
            {TEXTO_NO}
          </SunmiButton>
          <SunmiButton onClick={() => onOtro?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
            {TEXTO_OTRO}
          </SunmiButton>
        </div>
      }
      data-producto={item.productoBaseId}
    />
  );
}

/** Una tarjeta de «Aceptados»: el producto, su renglón y «Deshacer». */
export function TarjetaAceptada({ item, trabajando = false, error = "", onDeshacer }) {
  const r = item.renglon;
  return (
    <TarjetaDeRevision
      nombre={item.nombre}
      debajo={
        r ? (
          <>
            <p className="text-sm2 sunmi-text-strong break-words">
              {[r.codigo, r.descripcion].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs sunmi-text-muted tabular-nums">{money(r.precio)}</p>
          </>
        ) : (
          <p className="text-xs sunmi-text-muted">{TEXTO_SIN_RENGLON}</p>
        )
      }
      avisos={error ? <p className="text-sm2 sunmi-text-danger">{error}</p> : null}
      accionAbajo={
        <SunmiButton
          onClick={() => onDeshacer?.(item)}
          disabled={trabajando}
          className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}
        >
          {TEXTO_DESHACER_ACEPTADO}
        </SunmiButton>
      }
      data-producto={item.productoBaseId}
    />
  );
}

/**
 * @param importacionId  la lista
 * @param proveedor      el nombre, para el título
 * @param onCambio       se vinculó o se deshizo uno: la pantalla relee la revisión
 * @param onCerrar       cerrar la hoja
 */
export default function HojaPosibles({ importacionId, proveedor, onCambio, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [listas, setListas] = useState({ items: [], aceptados: [] });
  const [pestana, setPestana] = useState(PESTANA.POR_REVISAR);
  const [tocando, setTocando] = useState(null);
  const [errores, setErrores] = useState(() => new Map());
  // «Otro»: la tarjeta cuyo renglón se está eligiendo en la hoja de vincular.
  const [eligiendo, setEligiendo] = useState(null);

  const traer = useCallback(async () => {
    try {
      const r = await fetch(`/api/proveedores/listas/${importacionId}/posibles`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error || "No se pudo buscar en el resto de tus productos.");
        return;
      }
      setError("");
      setListas({
        items: Array.isArray(j.items) ? j.items : [],
        aceptados: Array.isArray(j.aceptados) ? j.aceptados : [],
      });
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    }
  }, [importacionId]);

  useEffect(() => {
    let vivo = true;
    traer().finally(() => {
      if (vivo) setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [traer]);

  /** Un pedido desde una tarjeta: si sale, `alSalir(respuesta)`; si no, el error queda pegado a ella. */
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
      alSalir?.(j);
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
      () => {
        setListas((prev) => pasarAAceptados(prev, item));
        onCambio?.();
      }
    );

  const no = (item) =>
    pedir(
      item,
      `/api/proveedores/listas/${importacionId}/posibles`,
      { productoBaseId: item.productoBaseId, filaId: item.renglon.id },
      "El servidor no pudo guardar la respuesta y no dijo por qué.",
      () => setListas((prev) => ({ ...prev, items: prev.items.filter((x) => x.productoBaseId !== item.productoBaseId) }))
    );

  const deshacer = (item) =>
    pedir(
      item,
      `/api/proveedores/listas/${importacionId}/posibles`,
      { deshacer: true, productoBaseId: item.productoBaseId },
      "El servidor no pudo deshacerlo y no dijo por qué.",
      (j) => {
        setListas((prev) => volverAPorRevisar(prev, item, j?.proveedoresDeHoy ?? ""));
        onCambio?.();
      }
    );

  // ── «OTRO»: LA HOJA DE VINCULAR DE SIEMPRE, EN LUGAR DE ÉSTA ─────────────
  // Con `sumarProveedor`, como «✓ Sí». Al volver se relee: el renglón elegido
  // puede haber sido la pregunta de otra tarjeta.
  if (eligiendo) {
    return (
      <HojaVincularConLaLista
        endpoint={`/api/proveedores/listas/${importacionId}/productos/${eligiendo.productoBaseId}/en-la-lista`}
        nombre={eligiendo.nombre}
        proveedor={proveedor}
        cuerpoVincular={{ sumarProveedor: true }}
        onCerrar={() => setEligiendo(null)}
        onListo={async () => {
          setEligiendo(null);
          await traer();
          setPestana(PESTANA.ACEPTADOS);
          onCambio?.();
        }}
      />
    );
  }

  const { items, aceptados } = listas;
  const enAceptados = pestana === PESTANA.ACEPTADOS;
  const lista = enAceptados ? aceptados : items;

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
      ) : (
        <>
          <SunmiFiltroEstado
            opciones={pestanasDePosibles(listas)}
            valor={pestana}
            onCambiar={setPestana}
            ariaLabel="Por revisar o aceptados"
          />
          {lista.length === 0 ? (
            <p className="text-sm2 sunmi-text-muted leading-snug">
              {enAceptados ? TEXTO_SIN_ACEPTADOS : TEXTO_SIN_POSIBLES}
            </p>
          ) : enAceptados ? (
            aceptados.map((item) => (
              <TarjetaAceptada
                key={item.productoBaseId}
                item={item}
                trabajando={tocando === item.productoBaseId}
                error={errores.get(item.productoBaseId) ?? ""}
                onDeshacer={deshacer}
              />
            ))
          ) : (
            items.map((item) => (
              <TarjetaPosible
                key={item.productoBaseId}
                item={item}
                trabajando={tocando === item.productoBaseId}
                error={errores.get(item.productoBaseId) ?? ""}
                onSi={si}
                onNo={no}
                onOtro={setEligiendo}
              />
            ))
          )}
        </>
      )}
    </SunmiModalLayout>
  );
}
