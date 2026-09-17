"use client";

// 5 · REVISAR DE A UNO — un producto por pantalla.
//
// ── POR QUÉ SE FUE LA LISTA CON TODOS JUNTOS ────────────────────────────────
//
// La pantalla anterior mostraba los motivos como filas y debajo todas las
// tarjetas del motivo elegido. Se veía ordenada y no servía: en un teléfono hay
// que decidir mirando UN producto, y lo que había adelante eran cuarenta y ocho
// tarjetas con dos botones cada una que decían solo un precio.
//
// Ahí está el origen del defecto más caro de este módulo: el botón "Usar
// $ 11.083,72" no decía que ese costo era once veces el que el producto tenía, y
// la importación #5 terminó con productos listos a +1.008 % sobre un proveedor
// que aumenta entre 2 y 15. Con un producto por pantalla entra todo lo que hace
// falta para decidir: qué significaría cada lectura, cuánto daría, y la cuenta
// escrita.
//
// ── SALIR A LA MITAD Y VOLVER ───────────────────────────────────────────────
//
// No se guarda ningún progreso, y es a propósito. La cola ES lo que queda
// pendiente: una fila resuelta sale sola, así que al volver el primero de la
// lista es justo donde se había quedado. Un cursor guardado sería un tercer dato
// que se puede desincronizar de los otros dos.
//
// ── LOS TRES BOTONES, Y QUÉ RECUERDA CADA UNO ───────────────────────────────
//
//   Usar $X y seguir   confirma la lectura. Se guarda para las próximas listas
//                      de este proveedor, y desde la siguiente se aplica sola.
//   No lo cambio       excluye la fila. Vale para ESTA lista y nada más.
//   Saltear            lo deja para después. No recuerda nada: al recargar la
//                      pantalla vuelve a aparecer.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import { VolverDelModulo, Aviso, money, pct } from "@/components/proveedores/listas/PiezasPantallas";
import PanelVincular from "@/components/proveedores/listas/PanelVincular";

export default function RevisarDeAUnoPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);
  // `?solo=SIN_PRODUCTO` es la cola de los que la lista trae y no están en el
  // catálogo. Viaja en la URL y no en un estado para que el botón de atrás del
  // teléfono devuelva a la misma cola y no a la otra.
  const solo = useSearchParams().get("solo") || null;

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [vinculando, setVinculando] = useState(null);
  // Los salteados de esta vuelta. NO se guardan: al recargar vuelven, que es lo
  // que "dejalo para después" quiere decir.
  const [salteados, setSalteados] = useState([]);
  // Cuál se está mirando. `null` es "el primero de la cola", que es lo que hace
  // que salir y volver retome donde quedó sin guardar nada.
  const [filaId, setFilaId] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargar = useCallback(async ({ pedir = null, saltados = [] } = {}) => {
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (pedir) qs.set("filaId", String(pedir));
      if (saltados.length) qs.set("salteados", saltados.join(","));
      if (solo) qs.set("solo", solo);
      const r = await fetch(`/api/proveedores/listas/${id}/revisar?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar la cola de revisión.");
        return;
      }
      setDatos(json);
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [id, solo]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    cargar({ pedir: filaId, saltados: salteados });
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id, filaId, salteados]);

  const fila = datos?.fila ?? null;
  const proveedor = datos?.cabecera?.proveedor?.nombre ?? "";

  /** El siguiente de la cola, salteando el que se acaba de resolver. */
  const avanzar = useCallback(() => {
    // Se vuelve a pedir desde el principio: la fila resuelta ya no está en la
    // cola, así que el primero es el siguiente. Pedir un id concreto obligaría a
    // saber cuál era, y ese cálculo se puede equivocar cuando el servidor
    // reordena.
    setFilaId(null);
  }, []);

  const usarLectura = async (lectura, { aceptarFueraDeRango = false } = {}) => {
    if (!fila) return;
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/confirmar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: lectura.clave, aceptarFueraDeRango }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo usar ese precio." });
        return;
      }
      setAviso({
        tono: "success",
        texto: `Listo. Me acuerdo: en las próximas listas de ${proveedor} este producto se lee así solo.`,
      });
      avanzar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  const noLoCambio = async () => {
    if (!fila) return;
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "EXCLUIR", ids: [fila.id] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo marcar." });
        return;
      }
      setAviso({ tono: "success", texto: "Queda con el costo de ahora, solo en esta lista." });
      avanzar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  const saltear = () => {
    if (!fila) return;
    setAviso(null);
    setSalteados((prev) => (prev.includes(fila.id) ? prev : [...prev, fila.id]));
    setFilaId(null);
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">Seleccioná un contexto operativo.</p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando && !datos) {
    return <Marco><SunmiCard className="p-6"><SunmiLoader /></SunmiCard></Marco>;
  }
  if (error) {
    return <Marco><ErrorRecuperable mensaje={error} onReintentar={() => cargar({ pedir: filaId, saltados: salteados })} /></Marco>;
  }

  const volverAlResultado = () => router.push(`/modulos/proveedores/listas/${id}`);

  // ── NO QUEDA NADA ─────────────────────────────────────────────────────────
  if (!fila) {
    return (
      <Marco>
        <VolverDelModulo texto="Resultado" onVolver={volverAlResultado} />
        <SunmiCard className="p-5 text-center space-y-3">
          <p className="text-base font-semibold sunmi-text-success">
            {solo ? "No queda ninguno sin vincular." : "No queda nada para revisar."}
          </p>
          <SunmiButton color="cyan" onClick={volverAlResultado} className="w-full min-h-toque text-base font-bold">
            Volver al resultado
          </SunmiButton>
        </SunmiCard>
      </Marco>
    );
  }

  const total = datos.total ?? 0;
  const indice = datos.indice ?? 0;

  return (
    <Marco>
      {/* El volver y el progreso comparten renglón: en un teléfono el alto de
          arriba es lo que empuja la decisión abajo del pliegue. */}
      <div className="flex items-center justify-between gap-2">
        <VolverDelModulo texto="Resultado" onVolver={volverAlResultado} />
        <span className="text-sm2 sunmi-text-muted tabular-nums shrink-0">
          {indice} de {total}
        </span>
      </div>

      <BarraDeProgreso hechos={indice - 1} total={total} />

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <div>
        <h1 className="text-lg font-bold sunmi-text-strong leading-tight break-words">{fila.nombre}</h1>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {proveedor}
          {fila.codigo ? ` · código ${fila.codigo}` : ""}
          {fila.factorPack ? ` · lo tenés cargado por caja de ${fila.factorPack}` : ""}
        </p>
      </div>

      {fila.sinProducto ? (
        <SinProductoDelCatalogo fila={fila} />
      ) : (
        <>
          <SunmiCard className="p-3 flex items-center justify-between gap-2">
            <span className="text-sm3 sunmi-text-muted">Costo de hoy</span>
            <span className="text-base font-bold sunmi-text-strong tabular-nums">
              {money(fila.costoAnterior)}
            </span>
          </SunmiCard>

          <p className="text-sm3 sunmi-text-strong leading-snug">
            La lista dice {money(fila.precioLista)}. ¿Cómo hay que leerlo?
          </p>

          <div className="space-y-2">
            {fila.lecturas.map((l) => (
              <TarjetaDeLectura
                key={l.clave}
                lectura={l}
                trabajando={trabajando}
                onElegir={() => usarLectura(l, { aceptarFueraDeRango: l.fueraDeRango })}
              />
            ))}
          </div>

          {fila.lecturas.length === 0 && (
            <Aviso tono="warning">
              El archivo no dice de qué presentación es este precio, así que no hay forma de saber a
              qué corresponde. Podés dejarlo como está y mirarlo en el archivo.
            </Aviso>
          )}
        </>
      )}

      <div className="space-y-2">
        {fila.sinProducto && (
          <SunmiButton
            color="cyan"
            onClick={() => setVinculando(fila)}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            Vincular con uno de los míos
          </SunmiButton>
        )}
        {!fila.sinProducto && fila.lecturas.length > 0 && (
          <SunmiButton
            color="cyan"
            onClick={() => {
              const elegida = fila.lecturas.find((l) => l.recomendada) ?? fila.lecturas[0];
              usarLectura(elegida, { aceptarFueraDeRango: elegida.fueraDeRango });
            }}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            {trabajando
              ? "Guardando…"
              : (fila.lecturas.find((l) => l.recomendada) ?? fila.lecturas[0]).textoBoton}
          </SunmiButton>
        )}
        <div className="grid grid-cols-2 gap-2">
          <SunmiButton
            color="slate"
            onClick={noLoCambio}
            disabled={trabajando}
            className="min-h-toque text-sm3"
          >
            {/* Es el mismo botón y la misma acción —la fila se deja afuera de
                esta lista— pero sobre un producto que ni siquiera es tuyo "No lo
                cambio" no quiere decir nada: no hay nada que cambiar. */}
            {fila.sinProducto ? "No lo tengo" : "No lo cambio"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={saltear}
            disabled={trabajando}
            className="min-h-toque text-sm3"
          >
            Saltear
          </SunmiButton>
        </div>
      </div>

      {/* LO QUE SE VA A RECORDAR, DICHO ANTES DE ELEGIR. Cambia según lo que se
          esté decidiendo: una lectura se recuerda como lectura, y un vínculo
          como vínculo. Prometer "se lee así solo" sobre una pantalla donde lo
          único que se puede hacer es vincular sería prometer de más. */}
      <SunmiCard className="p-3">
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {fila.sinProducto
            ? `Me acuerdo: una vez que lo vinculás, las próximas listas de ${proveedor} lo reconocen solas.`
            : `Me acuerdo: en las próximas listas de ${proveedor} este producto se lee así solo, sin preguntarte.`}
        </p>
      </SunmiCard>

      {vinculando && (
        <PanelVincular
          abierto
          importacionId={id}
          fila={{
            id: vinculando.id,
            codigoCrudo: vinculando.codigo,
            descripcionProveedor: vinculando.nombreEnElArchivo,
            sugerenciaProductoBaseId: null,
            sugerenciaNombre: null,
          }}
          onCerrar={() => setVinculando(null)}
          onVinculado={async () => {
            setVinculando(null);
            setAviso({
              tono: "success",
              texto: "Vinculado. Las próximas listas de este proveedor lo van a reconocer solo.",
            });
            avanzar();
          }}
        />
      )}
    </Marco>
  );
}

/**
 * Una lectura posible, con todo lo que hace falta para elegirla.
 *
 * El número grande es el COSTO QUE QUEDARÍA, no el precio de la lista: es lo que
 * se va a escribir, y es contra lo que hay que mirar el costo de hoy. Al lado va
 * el porcentaje, y abajo la cuenta escrita — sin ella el número no se puede
 * verificar contra el papel que el proveedor mandó.
 */
function TarjetaDeLectura({ lectura, trabajando, onElegir }) {
  const tono = lectura.recomendada
    ? "sunmi-state-success"
    : lectura.absurda
      ? "sunmi-state-danger"
      : lectura.fueraDeRango
        ? "sunmi-state-warning"
        : "";
  return (
    <SunmiButton
      color="ghost"
      onClick={onElegir}
      disabled={trabajando}
      className={`w-full text-left block rounded-xl p-3 min-h-toque sunmi-border border ${tono}`}
    >
      <span className="block text-sm3 font-semibold sunmi-text-strong">{lectura.titulo}</span>
      <span className="flex items-baseline justify-between gap-2 mt-1">
        <span className="text-lg font-bold sunmi-text-strong tabular-nums">
          {money(lectura.costoNuevo)}
        </span>
        <span className="text-sm3 font-semibold tabular-nums shrink-0">
          {pct(lectura.variacionPct)}
        </span>
      </span>
      <span className="block text-xs2 sunmi-text-muted leading-snug mt-1">{lectura.cuenta}</span>
      {lectura.advertencia && (
        <span className="block text-xs2 font-semibold leading-snug mt-1">{lectura.advertencia}</span>
      )}
      {lectura.recomendada && (
        <span className="block text-xs2 sunmi-text-success leading-snug mt-1">
          Es la más probable: es la única que da un aumento como los de este proveedor.
        </span>
      )}
    </SunmiButton>
  );
}

/**
 * La fila que no tiene producto en el catálogo: acá hay que vincular, no elegir
 * precio.
 *
 * ── POR QUÉ NO TIENE BOTONES PROPIOS ────────────────────────────────────────
 *
 * Los tenía —"Ignorar" y "Vincular"— y quedaban ARRIBA de los tres de abajo, con
 * "Ignorar" y "No lo cambio" haciendo exactamente lo mismo a dos centímetros de
 * distancia. Cuatro botones para tres decisiones. La acción principal se fue al
 * mismo lugar donde está en el otro caso, que es el borde de abajo, donde llega
 * el pulgar.
 */
function SinProductoDelCatalogo({ fila }) {
  return (
    <SunmiCard className="p-3">
      <p className="text-sm2 sunmi-text-muted leading-snug">
        Este producto de la lista no está vinculado a ninguno de los tuyos, así que no hay costo con
        qué compararlo. Dice {money(fila.precioLista)}.
      </p>
    </SunmiCard>
  );
}

/** Cuánto se lleva hecho. Es la única pieza que dice que esto tiene un final. */
function BarraDeProgreso({ hechos, total }) {
  const porcentaje = total > 0 ? Math.max(0, Math.min(100, (hechos / total) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full rounded-full sunmi-surface-soft overflow-hidden"
      role="progressbar"
      aria-valuenow={hechos}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${hechos} de ${total} resueltos`}
    >
      <div className="h-full sunmi-bg-accent rounded-full" style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
