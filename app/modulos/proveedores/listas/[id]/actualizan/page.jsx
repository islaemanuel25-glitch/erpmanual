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

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import { VolverDelModulo, money, pct } from "@/components/proveedores/listas/PiezasPantallas";

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

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

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

  // MIENTRAS SE ESCRIBE, pero no en cada tecla: 300 ms es lo que tarda en
  // notarse y evita una consulta por letra sobre 954 filas.
  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto || !Number.isInteger(id)) return;
    const t = setTimeout(() => cargar({ texto: buscar.trim(), tope: hasta }), 300);
    return () => clearTimeout(t);
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto, id, buscar, hasta]);

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  const volver = () => router.push(`/modulos/proveedores/listas/${id}`);

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
        <VolverDelModulo texto="Resultado" onVolver={volver} />
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
        <VolverDelModulo texto="Resultado" onVolver={volver} />
        <h1 className="text-xl font-bold sunmi-text-strong leading-tight">
          Se actualizan · {total}
        </h1>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {datos?.proveedor?.nombre ?? "—"}
          {/* El rango REAL de estas filas, no el configurado del proveedor. */}
          {hayRango
            ? unSoloPorcentaje
              ? ` · todos aumentan ${pct(rango.minPct)}`
              : ` · aumentan entre ${pct(rango.minPct)} y ${pct(rango.maxPct)}`
            : ""}
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
            <div key={p.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                {/* EL NOMBRE ENTERO, sin truncar. Es lo que distingue "ALA ULTRA
                    LV LIMON 12X500" de "ALA ULTRA LV LIMON 12X750". */}
                <div className="text-sm3 font-semibold sunmi-text-strong leading-snug break-words">
                  {p.nombre}
                </div>
                {p.factorPack ? (
                  <div className="text-xs2 sunmi-text-muted">Caja de {p.factorPack}</div>
                ) : null}
                <div className="text-sm2 sunmi-text-muted tabular-nums">
                  {money(p.costoAnterior)} → {money(p.costoNuevo)}
                </div>
              </div>
              <div className="text-sm3 font-semibold sunmi-text-success tabular-nums shrink-0">
                {pct(p.variacionPct)}
              </div>
            </div>
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
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-3 space-y-3 w-full max-w-3xl mx-auto">{children}</div>;
}
