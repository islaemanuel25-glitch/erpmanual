"use client";

// 4b · LOS QUE SE ACTUALIZAN — a dónde lleva "Ver los N".
//
// ── QUÉ REEMPLAZA ───────────────────────────────────────────────────────────
//
// "Ver los N" llevaba a la pantalla vieja del detalle: "Importación #5", las
// cinco tarjetas de contadores, el buscador con sus botones Buscar y Limpiar,
// una tabla de tres columnas con páginas, y el diagnóstico de "qué trajo el
// archivo". Emanuel la abrió sin querer y es de la versión anterior del módulo.
//
// Acá hay una sola pregunta: QUÉ PRODUCTOS SE VAN A ACTUALIZAR Y CUÁNTO. El
// nombre completo sin cortar —los de este catálogo tienen treinta caracteres y
// la tabla los truncaba justo donde se distinguen—, de cuántas unidades es la
// caja, el costo de hoy, el costo nuevo y el porcentaje. Nada más.
//
// ── "VER 20 MÁS" EN VEZ DE PÁGINAS ──────────────────────────────────────────
//
// Una paginación obliga a acordarse en qué página se estaba, y en un teléfono lo
// que se hace es bajar. El buscador filtra EN LA BASE mientras se escribe, así
// que buscar un producto no depende de haber llegado a su página.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import {
  AvisoCostoRedondo,
  Chevron,
  money,
  pct,
} from "@/components/proveedores/listas/PiezasPantallas";

export default function LosQueSeActualizanPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [hasta, setHasta] = useState(20);
  // El producto cuya hoja está abierta, o `null`. Es el producto entero y no su
  // id: la hoja muestra los mismos números que la fila, y buscarlos de nuevo por
  // id sería una segunda fuente para el mismo dato.
  const [abierto, setAbierto] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  useTituloDePagina("Se actualizan");
  useAccionDePagina(
    () => <SunmiBackButton href={`/modulos/proveedores/listas/${id}`} texto="Resultado" />,
    [id]
  );

  const cargar = useCallback(async ({ texto, tope }) => {
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams({ hasta: String(tope) });
      if (texto) qs.set("buscar", texto);
      const r = await fetch(`/api/proveedores/listas/${id}/actualizan?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudieron cargar los productos.");
        return;
      }
      setDatos(json);
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }, [id]);

  /**
   * "Dejarlo como está": la fila se excluye de ESTA lista.
   *
   * Es el MISMO endpoint que usa "No lo cambio" en revisar de a uno. Escribir
   * otro camino para sacar un producto de la aplicación sería tener dos, y uno
   * de los dos sin el candado que impide excluir una fila ya aplicada.
   */
  const dejarComoEsta = async (producto) => {
    setTrabajando(true);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "EXCLUIR", ids: [producto.id] }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error || "No se pudo dejar ese producto como está.");
        return;
      }
      setAbierto(null);
      // Se relee: la fila sale de la lista y el total de arriba baja. Sacarla
      // del array en memoria dejaría el título diciendo el número de antes.
      await cargar({ texto: buscar.trim(), tope: hasta });
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  };

  // MIENTRAS SE ESCRIBE, pero no en cada tecla: 300 ms es lo que tarda en
  // notarse y evita una consulta por letra sobre 954 filas.
  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    const t = setTimeout(() => cargar({ texto: buscar.trim(), tope: hasta }), 300);
    return () => clearTimeout(t);
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id, buscar, hasta]);

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
  if (error) {
    return (
      <Marco>
        <ErrorRecuperable mensaje={error} onReintentar={() => cargar({ texto: buscar.trim(), tope: hasta })} />
      </Marco>
    );
  }
  if (cargando && !datos) {
    return <Marco><SunmiCard className="p-6"><SunmiLoader /></SunmiCard></Marco>;
  }

  const items = datos?.items ?? [];
  const rango = datos?.rango ?? {};
  const hayRango =
    rango.minPct !== null && rango.minPct !== undefined && rango.maxPct !== null;
  const unSoloPorcentaje =
    hayRango && Math.round(rango.minPct * 10) === Math.round(rango.maxPct * 10);
  // El total de los que se actualizan, que NO es cuántos entran en la página.
  // El título decía "Se actualizan · 20+" sobre 360 productos: un "20+" no
  // distingue 21 de 900, que es justo lo que se viene a mirar acá.
  const total = datos?.total ?? items.length;

  return (
    <Marco>
      <div className="space-y-1">
        <h1 className="text-xl font-bold sunmi-text-strong leading-tight">
          Se actualizan · {total}
        </h1>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {datos?.proveedor?.nombre ?? "—"}
          {/* El rango REAL de estas filas, no el configurado del proveedor. */}
          {hayRango
            ? unSoloPorcentaje
              ? ` · todos aumentan ${pct(rango.minPct)}`
              : ` · entre ${pct(rango.minPct)} y ${pct(rango.maxPct)}`
            : ""}
          {/* La invitación va en el subtítulo y no en un cartel aparte: es una
              pantalla que hasta ayer era de solo leer, y nadie toca una fila que
              no sabe que se puede tocar. Con la lista cerrada no se dice, porque
              ahí no se puede cambiar nada. */}
          {items.length > 0 && datos?.editable ? " · tocá uno para cambiarlo" : ""}
        </p>
      </div>

      <SunmiInput
        value={buscar}
        onChange={(e) => {
          setBuscar(e.target.value);
          setHasta(20);
        }}
        placeholder="Buscar producto"
        className="w-full min-h-toque"
        aria-label="Buscar producto"
      />

      {items.length === 0 && !cargando && (
        <SunmiCard className="p-5">
          <p className="text-sm2 sunmi-text-muted text-center leading-snug">
            {buscar.trim()
              ? "Ningún producto que se actualice coincide con eso."
              : "No hay productos para actualizar en esta lista."}
          </p>
        </SunmiCard>
      )}

      {items.length > 0 && (
        <SunmiCard className="p-0 overflow-hidden divide-y sunmi-divide">
          {items.map((p) => (
            // ── CADA FILA SE TOCA ──────────────────────────────────────────
            //
            // Era una lista de solo lectura, y ahí estaba el problema: Emanuel
            // ve un +11,4 % que no le cierra y la única salida era volver al
            // resultado, entrar a revisar de a uno y pasar productos hasta
            // encontrarlo — o no encontrarlo nunca, porque un producto que se
            // actualiza NO está en la cola de revisión. Desde acá se saca de la
            // lista, se abre su lectura, o se deja como está.
            <SunmiButton
              key={p.id}
              color="ghost"
              type="button"
              // Con la lista terminada o cancelada no hay nada que cambiar: el
              // servidor rechaza excluir una fila de una importación cerrada, y
              // una hoja con tres botones que no hacen nada es peor que no
              // poder tocarla.
              onClick={datos?.editable ? () => setAbierto(p) : undefined}
              disabled={!datos?.editable}
              aria-label={`${p.nombre}: ${money(p.costoAnterior)} pasa a ${money(p.costoNuevo)}`}
              className="w-full block text-left p-3 min-h-toque disabled:opacity-100"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 space-y-0.5">
                  {/* EL NOMBRE ENTERO, sin truncar. Es lo que distingue "ALA
                      ULTRA LV LIMON 12X500" de "ALA ULTRA LV LIMON 12X750". */}
                  <span className="block text-sm3 font-semibold sunmi-text-strong leading-snug break-words">
                    {p.nombre}
                  </span>
                  {p.factorPack ? (
                    <span className="block text-xs2 sunmi-text-muted">Caja de {p.factorPack}</span>
                  ) : null}
                  <span className="block text-sm2 sunmi-text-muted tabular-nums">
                    {money(p.costoAnterior)} → {money(p.costoNuevo)}
                  </span>
                  {p.costoRedondo && <AvisoCostoRedondo costo={p.costoAnterior} />}
                </span>
                <span className="text-sm3 font-semibold sunmi-text-success tabular-nums shrink-0">
                  {pct(p.variacionPct)}
                </span>
                {datos?.editable && <Chevron />}
              </span>
            </SunmiButton>
          ))}
        </SunmiCard>
      )}

      {datos?.hayMas && (
        <SunmiButton
          color="slate"
          onClick={() => setHasta((h) => h + 20)}
          disabled={cargando}
          className="w-full min-h-toque text-sm3"
        >
          {/* Cuántos faltan, no "20 más": con 360 productos y 20 en pantalla,
              "Ver 20 más" no dice si queda uno o diecisiete toques. */}
          {cargando ? "Cargando…" : `Ver 20 más · faltan ${Math.max(0, total - items.length)}`}
        </SunmiButton>
      )}

      {abierto && (
        <HojaDelProducto
          producto={abierto}
          trabajando={trabajando}
          onCerrar={() => setAbierto(null)}
          onDejar={() => dejarComoEsta(abierto)}
          onVerLectura={() =>
            router.push(`/modulos/proveedores/listas/${id}/revisar?filaId=${abierto.id}&desde=actualizan`)
          }
        />
      )}
    </Marco>
  );
}

/**
 * LA HOJA DE UN PRODUCTO QUE SE VA A ACTUALIZAR.
 *
 * ── POR QUÉ TRES BOTONES Y NO DOS ──────────────────────────────────────────
 *
 * Porque hay tres respuestas distintas a "este aumento no me cierra", y
 * mezclarlas fue lo que hizo falta la primera vez:
 *
 *   Dejarlo como está   el costo no se toca EN ESTA LISTA. Es la salida
 *                       rápida, la que se usa cuando ya se sabe que está mal.
 *   Ver cómo se leyó    abre la revisión de ESE producto, con sus lecturas y
 *                       sus cuentas. Es la que se usa cuando no se sabe por qué
 *                       dio ese número.
 *   Listo               cerrar sin tocar nada. Está y no es de relleno: sin un
 *                       botón de salir, el único camino es el velo o el gesto
 *                       de atrás, y los dos se sienten como cancelar algo.
 */
function HojaDelProducto({ producto, trabajando, onCerrar, onDejar, onVerLectura }) {
  return (
    <SunmiModalLayout
      open
      title={producto.nombre}
      color="cyan"
      onClose={trabajando ? undefined : onCerrar}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color="slate"
            onClick={onDejar}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            {trabajando ? "Guardando…" : "Dejarlo como está"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onVerLectura}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Ver cómo se leyó y cambiarlo
          </SunmiButton>
          <SunmiButton
            color="cyan"
            onClick={onCerrar}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            Listo, que se actualice
          </SunmiButton>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-sm3 sunmi-text-strong leading-snug">
          Hoy {money(producto.costoAnterior)} · se va a actualizar a{" "}
          {money(producto.costoNuevo)} ({pct(producto.variacionPct)})
        </p>
        {producto.factorPack ? (
          <p className="text-sm2 sunmi-text-muted">Lo tenés cargado por caja de {producto.factorPack}.</p>
        ) : null}
        {producto.costoRedondo && <AvisoCostoRedondo costo={producto.costoAnterior} />}
      </div>
    </SunmiModalLayout>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
