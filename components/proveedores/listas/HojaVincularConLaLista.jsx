"use client";

// ¿CUÁL ES ESTE PRODUCTO EN LA LISTA DEL PROVEEDOR?
//
// La hoja inferior de la revisión de una lista (diseño de Emanuel, 2026-10-23).
// Reemplaza a la pantalla "Elegir de la lista", con la misma pregunta y las
// mismas rutas: el renglón se elige entre los de ESTA lista —buscar en todo el
// catálogo del proveedor dejaría un producto atado a un renglón que el archivo
// no trae— y las candidatas vienen ordenadas por parecido al nombre del
// producto (`candidatasConPuntaje`, la misma de siempre).
//
// Sirve a las dos puertas que ya existían, cada una con su ruta:
//
//   Sin vincular          `productos/[id]/en-la-lista` — un producto tuyo que
//                         la lista no emparejó.
//   No es este producto   `filas/[id]/otra-fila` — un renglón atado al
//                         producto equivocado, desde la decisión de revisar.
//
// Al vincular, el código del renglón queda guardado en el producto, en el mismo
// lugar que leen las facturas y las recepciones (`ProductoCodigoProveedor`). La
// hoja lo dice ANTES de que se toque, con el código.

import { useCallback, useEffect, useRef, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { money } from "@/components/proveedores/listas/PiezasPantallas";
import { primerasPalabras } from "@/lib/proveedores/listas/tusProductos";
// La decisión de lectura, sin su hoja: es la misma pieza que abre «Corregir».
import { DecisionDeLectura } from "@/components/proveedores/listas/HojaRevisarPrecio";

/** Cuánto se espera a que se deje de escribir antes de buscar. */
const ESPERA_BUSQUEDA_MS = 350;

/**
 * @param endpoint      la ruta de la puerta: GET busca, POST vincula
 * @param nombre        el del producto, para el título y el buscador
 * @param proveedor     el nombre del proveedor
 * @param cuerpoNoViene lo que se manda con «No viene en esta lista», que cada
 *                      ruta llama distinto
 * @param onListo       al guardar algo: `(respuesta)`; la pantalla recarga
 * @param onCerrar      al cerrar sin guardar
 * @param importacionId con `seguirConLaLectura`, la lista donde se decide la lectura
 * @param seguirConLaLectura  al vincular, la MISMA hoja sigue con la decisión de
 *                      lectura (Emanuel, 2026-10-24). Solo si desde acá se pueden
 *                      cambiar costos: si no, se vincula y la hoja se cierra
 * @param onNoEsEste    «No es este producto» desde esa decisión: `(fila)`
 */
export default function HojaVincularConLaLista({
  endpoint,
  nombre,
  proveedor = "",
  cuerpoNoViene,
  onListo,
  onCerrar,
  importacionId = null,
  seguirConLaLectura = false,
  onNoEsEste,
}) {
  const [buscar, setBuscar] = useState(() => primerasPalabras(nombre));
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [elegida, setElegida] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  // ── EL SEGUNDO PASO, EN LA MISMA HOJA ───────────────────────────────────
  //
  // Vincular era: elegir el renglón, que la hoja se cerrara, y tocar «Corregir»
  // para decir si el precio es de la caja o de una unidad. Ahora, vinculado, la
  // hoja sigue con esa decisión (`DecisionDeLectura`) y se cierra sola cuando no
  // hay nada que decidir o hay una sola lectura en el rango. `vinculado` es la
  // respuesta del vínculo, que ya quedó guardado: cerrar acá NO lo deshace, así
  // que cerrar también avisa que hay que recargar.
  const [vinculado, setVinculado] = useState(null);
  const [titulo, setTitulo] = useState(null);
  const [decidiendo, setDecidiendo] = useState(false);
  const reloj = useRef(null);

  const traer = useCallback(
    async (texto) => {
      setCargando(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        if (texto.trim()) qs.set("buscar", texto.trim());
        const r = await fetch(`${endpoint}?${qs}`, { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setError(j?.error || "No se pudieron leer los renglones de la lista. Probá de nuevo.");
          setItems([]);
          return;
        }
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch {
        setError("No se pudo conectar con el servidor. Probá de nuevo.");
      } finally {
        setCargando(false);
      }
    },
    [endpoint]
  );

  useEffect(() => {
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => traer(buscar), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(reloj.current);
  }, [buscar, traer]);

  /** Manda a la ruta y, si salió, avisa a la pantalla. El error queda en la hoja. */
  async function mandar(cuerpo) {
    setTrabajando(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error || "No se pudo guardar. No cambió nada: probá de nuevo.");
        return;
      }
      if (seguirConLaLectura && cuerpo?.filaElegidaId && j.filaId) {
        setVinculado(j);
        return;
      }
      onListo?.(j);
    } catch {
      setError("No se pudo conectar con el servidor. No cambió nada: probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  if (vinculado) {
    return (
      <SunmiModalLayout
        open
        forma="hoja"
        title={titulo ?? nombre}
        color="amber"
        onClose={decidiendo ? undefined : () => onListo?.(vinculado)}
        espacioCuerpo="mt-2 gap-3"
        z={9999}
      >
        {vinculado.mensaje && <p className="text-sm2 sunmi-text-success leading-snug">✓ {vinculado.mensaje}</p>}
        <DecisionDeLectura
          importacionId={importacionId}
          filaId={vinculado.filaId}
          tomarLaUnica
          onListo={() => onListo?.(vinculado)}
          onNoEsEste={onNoEsEste}
          onTitulo={setTitulo}
          onTrabajando={setDecidiendo}
        />
      </SunmiModalLayout>
    );
  }

  return (
    <SunmiModalLayout
      open
      forma="hoja"
      title={`¿Cuál es ${nombre} en la lista${proveedor ? ` de ${proveedor}` : ""}?`}
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color="primary"
            type="button"
            disabled={trabajando || !elegida}
            onClick={() => mandar({ filaElegidaId: elegida.id })}
            className="w-full min-h-toque justify-center text-base font-bold"
          >
            {trabajando ? "Guardando…" : elegida ? `Vincular con ${elegida.codigo}` : "Elegí un renglón de la lista"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            type="button"
            disabled={trabajando}
            onClick={() => mandar(cuerpoNoViene)}
            className="w-full min-h-toque justify-center text-sm3"
          >
            No viene en esta lista
          </SunmiButton>
          {elegida && (
            <p className="text-sm2 sunmi-text-muted leading-snug">
              Guardo el código {elegida.codigo}
              {proveedor ? ` de ${proveedor}` : ""} en este producto: las próximas listas, facturas y
              recepciones{proveedor ? ` de ${proveedor}` : ""} lo reconocen solas.
            </p>
          )}
        </div>
      }
    >
      <p className="text-sm2 sunmi-text-muted leading-snug">
        Te muestro primero los que se parecen. Buscá por nombre o por código
        {proveedor ? ` de ${proveedor}` : ""}.
      </p>
      <SunmiInput
        type="search"
        value={buscar}
        onChange={(e) => {
          setBuscar(e.target.value);
          setElegida(null);
        }}
        aria-label="Buscar en la lista por nombre o código"
        className="min-h-toque text-sm3"
      />

      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}

      {cargando ? (
        <SunmiLoader />
      ) : items.length === 0 ? (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          Ningún renglón de la lista coincide con eso. Probá con otra palabra o con el código.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const marcada = elegida?.id === c.id;
            return (
              <SunmiButton
                key={c.id}
                color="ghost"
                type="button"
                aria-pressed={marcada}
                onClick={() => setElegida(c)}
                disabled={trabajando}
                className={`w-full text-left block rounded-xl p-3 min-h-toque border ${
                  marcada ? "sunmi-border-accent" : "sunmi-border"
                }`}
              >
                <span className="block text-sm3 font-semibold sunmi-text-strong leading-snug break-words">
                  {c.codigo} · {c.descripcion}
                </span>
                <span className="block text-sm2 sunmi-text-muted tabular-nums">
                  {money(c.precio)}
                  {c.cantidad > 1 ? ` por ${c.cantidad}` : ""}
                </span>
                {/* Elegir una que ya es de otro producto no es un error —puede
                    ser ése el mal vinculado—, pero se dice antes de elegir. */}
                {c.tomadaPor && (
                  <span className="block text-xs2 sunmi-text-warning leading-snug">
                    Ahora está atado a {c.tomadaPor}.
                  </span>
                )}
              </SunmiButton>
            );
          })}
        </div>
      )}
    </SunmiModalLayout>
  );
}
