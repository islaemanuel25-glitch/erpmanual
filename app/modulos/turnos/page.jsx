"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";

const fmtFecha = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ESTADO_INICIAL = "abiertas";

// Un turno tiene TRES estados posibles, no dos: además de abierta y cerrada
// existe la anulada, que técnicamente está cerrada pero no fue una operación
// comercial. Mezclarlas es lo que hacía ilegible el listado.
function estadoDe(t) {
  if (t.anuladoEn) return "anulada";
  if (t.cierre) return "cerrada";
  return "abierta";
}

function EtiquetaEstado({ turno }) {
  const e = estadoDe(turno);
  if (e === "abierta")
    return (
      <span className="sunmi-text-success font-semibold whitespace-nowrap">
        ● Abierta
      </span>
    );
  if (e === "anulada")
    return (
      <span
        className="sunmi-text-warning font-semibold whitespace-nowrap"
        title={turno.motivoAnulacion || ""}
      >
        ⊘ Anulada
      </span>
    );
  return <span className="sunmi-text-muted whitespace-nowrap">✓ Cerrada</span>;
}

// Etiqueta visible SIEMPRE, también en móvil. Antes los cuatro filtros eran
// controles sueltos sin texto: no se podía saber cuál era "desde" y cuál "hasta".
function Campo({ label, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold sunmi-text-muted uppercase tracking-wide"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export default function TurnosPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUser } = useUser();
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [turnos, setTurnos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [locales, setLocales] = useState([]);
  const [paginacion, setPaginacion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hoy = hoyArgentinaISO();

  // Filtros. El estado inicial es deliberado: hoy, local actual y solo las cajas
  // abiertas. Entrar a la pantalla no debe disparar una consulta de todo el
  // historial — para eso está ampliar el rango a mano.
  const [localId, setLocalId] = useState("");
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [vendedorId, setVendedorId] = useState("");
  const [page, setPage] = useState(1);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeUsar = esAdmin || permisos.includes("pos.usar");
  const puedeVerTodos = esAdmin || permisos.includes("turnos.ver_todos");

  // El local del contexto es el valor inicial del filtro.
  useEffect(() => {
    if (contexto?.localId && !localId) setLocalId(String(contexto.localId));
  }, [contexto?.localId, localId]);

  // Opciones de local: solo tiene sentido elegir si sos admin. El endpoint ya
  // acota al grupo activo, y el backend revalida la pertenencia igual.
  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/locales/opciones", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) setLocales(d.items);
      })
      .catch(() => {});
  }, [esAdmin]);

  const buscar = useCallback(
    async (paginaPedida = 1) => {
      if (!localId) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("localId", localId);
        params.set("fechaDesde", fechaDesde || hoy);
        params.set("fechaHasta", fechaHasta || hoy);
        params.set("estado", estado);
        if (vendedorId) params.set("vendedorId", vendedorId);
        params.set("page", String(paginaPedida));

        const res = await fetch(`/api/pos-ventas/turnos/listar?${params}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setTurnos(data.items || []);
          setVendedores(data.vendedores || []);
          setPaginacion(data.paginacion || null);
          setPage(paginaPedida);
        } else {
          setTurnos([]);
          setPaginacion(null);
          setError(data.error || "No se pudo cargar el listado.");
        }
      } catch {
        setTurnos([]);
        setPaginacion(null);
        setError("No se pudo cargar el listado.");
      } finally {
        setLoading(false);
      }
    },
    [localId, fechaDesde, fechaHasta, estado, vendedorId, hoy]
  );

  // Primera carga: una sola vez, cuando ya se conoce el local.
  const yaCargo = useRef(false);
  useEffect(() => {
    if (localId && !yaCargo.current) {
      yaCargo.current = true;
      buscar(1);
    }
  }, [localId, buscar]);

  const limpiar = () => {
    setFechaDesde(hoy);
    setFechaHasta(hoy);
    setEstado(ESTADO_INICIAL);
    setVendedorId("");
    setLocalId(contexto?.localId ? String(contexto.localId) : "");
    setPage(1);
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeUsar) return <SinPermisos />;

  // Sin local elegido no se consulta nada. Antes esto redirigía al inicio; ahora
  // la pantalla se queda y explica qué falta, que es lo que el usuario necesita.
  const sinLocal = !localId && (needsContexto || !contexto?.localId);

  const headers = [
    "Estado",
    "Vendedor",
    "Apertura",
    "Cierre",
    "M. Inicial",
    "Esperado",
    "Real",
    "Diferencia",
    "Se retiró",
    "Fondo dejado",
    "Ventas",
    "Efectivo",
    "Digital",
    "",
  ];

  // Las anuladas se atenúan para que no compitan visualmente con las cajas
  // reales, pero siguen visibles y auditables.
  const claseFila = (t) => (estadoDe(t) === "anulada" ? "opacity-60" : "");

  const filtros = (
    <SunmiCard>
      <h1 className="text-lg font-bold mb-2">Cajas</h1>
      <SunmiSeparator label="Filtros" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
        <Campo label="Local" htmlFor="f-local">
          {esAdmin ? (
            <SunmiSelectAdv
              value={localId}
              onChange={(v) => setLocalId(v)}
              placeholder="Seleccioná un local"
            >
              {locales.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.nombre}
                </option>
              ))}
            </SunmiSelectAdv>
          ) : (
            <SunmiInput
              id="f-local"
              value={contexto?.nombre || "-"}
              readOnly
              disabled
            />
          )}
        </Campo>

        <Campo label="Fecha desde" htmlFor="f-desde">
          <SunmiInput
            id="f-desde"
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </Campo>

        <Campo label="Fecha hasta" htmlFor="f-hasta">
          <SunmiInput
            id="f-hasta"
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </Campo>

        <Campo label="Estado">
          <SunmiSelectAdv value={estado} onChange={(v) => setEstado(v)}>
            <option value="abiertas">Abiertas</option>
            <option value="cerradas">Cerradas</option>
            <option value="anuladas">Anuladas</option>
            <option value="todas">Todas</option>
          </SunmiSelectAdv>
        </Campo>

        <Campo label="Vendedor">
          {puedeVerTodos ? (
            <SunmiSelectAdv
              value={vendedorId}
              onChange={(v) => setVendedorId(v)}
            >
              <option value="">Todos los vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.nombre || v.email}
                </option>
              ))}
            </SunmiSelectAdv>
          ) : (
            <SunmiInput value="Solo mis cajas" readOnly disabled />
          )}
        </Campo>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <SunmiButton color="amber" onClick={() => buscar(1)} disabled={!localId}>
          Buscar
        </SunmiButton>
        <SunmiButton color="slate" onClick={limpiar}>
          Limpiar filtros
        </SunmiButton>
      </div>
    </SunmiCard>
  );

  // Sin contexto operativo no se muestran los filtros: el backend resuelve el
  // alcance ANTES de mirar el local pedido, así que un desplegable de Local acá
  // sería un control muerto que falla al usarlo. El local se elige con el
  // selector de contexto de la aplicación.
  if (sinLocal) {
    return (
      <div className="p-3 space-y-3">
        <SunmiCard>
          <h1 className="text-lg font-bold mb-2">Cajas</h1>
          <p className="text-sm text-center py-6">
            Seleccioná un local para ver sus cajas.
          </p>
        </SunmiCard>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {filtros}

      <SunmiCard>
        {loading ? (
          <SunmiLoader />
        ) : error ? (
          <p className="text-sm text-center py-6 sunmi-text-danger">{error}</p>
        ) : (
          <>
            {/* ===== ESCRITORIO (desde 1024px) =====
                El corte es `lg`, no `md`: verificado en navegador, a 768px la
                tabla de 14 columnas deja 25 elementos fuera del viewport. El
                contenedor tiene overflow-x-auto, así que la pagina no scrollea
                de lado, pero igual habria que arrastrar para leer una sola caja
                — y 768 es el ancho tipico de una tablet en mostrador. */}
            <div className="hidden xl:block">
              <SunmiTable headers={headers}>
                {turnos.length === 0 ? (
                  <SunmiTableEmpty colSpan={headers.length} />
                ) : (
                  turnos.map((t) => (
                    <SunmiTableRow key={t.id} className={claseFila(t)}>
                      <td className="px-3 py-2 text-sm">
                        <EtiquetaEstado turno={t} />
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {t.vendedor?.nombre || t.vendedor?.email || "-"}
                      </td>
                      <td className="px-3 py-2 text-sm">{fmtFecha(t.apertura)}</td>
                      <td className="px-3 py-2 text-sm">
                        {t.anuladoEn ? "-" : t.cierre ? fmtFecha(t.cierre) : "-"}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">{fmt(t.montoInicial)}</td>
                      <td className="px-3 py-2 text-sm text-right">{fmt(t.montoEsperadoEfectivo)}</td>
                      <td className="px-3 py-2 text-sm text-right">{fmt(t.montoRealEfectivo)}</td>
                      <td
                        className={`px-3 py-2 text-sm text-right font-semibold ${
                          t.diferenciaEfectivo != null && t.diferenciaEfectivo < 0
                            ? "sunmi-text-danger"
                            : t.diferenciaEfectivo != null && t.diferenciaEfectivo > 0
                            ? "sunmi-text-success"
                            : ""
                        }`}
                      >
                        {fmt(t.diferenciaEfectivo)}
                      </td>
                      {/* "—" cuando el turno es ANTERIOR al circuito del dinero:
                          mostrar 0 haría creer que no se retiró nada, cuando en
                          realidad nunca hubo registro. */}
                      <td className="px-3 py-2 text-sm text-right">
                        {t.efectivoRetiradoCierre != null ? (
                          fmt(t.efectivoRetiradoCierre)
                        ) : (
                          <span className="sunmi-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-right sunmi-text-link">
                        {t.fondoDejadoCierre != null ? (
                          fmt(t.fondoDejadoCierre)
                        ) : (
                          <span className="sunmi-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-center">{t.cantidadVentas ?? "-"}</td>
                      <td className="px-3 py-2 text-sm text-right">{fmt(t.totalVentasEfectivo)}</td>
                      <td className="px-3 py-2 text-sm text-right">{fmt(t.totalVentasDigital)}</td>
                      <td className="px-3 py-2">
                        <SunmiButton
                          color="cyan"
                          onClick={() => router.push(`/modulos/turnos/${t.id}`)}
                        >
                          Ver
                        </SunmiButton>
                      </td>
                    </SunmiTableRow>
                  ))
                )}
              </SunmiTable>
            </div>

            {/* ===== MÓVIL =====
                Una tabla de 14 columnas en un teléfono obliga a desplazarse de
                lado para leer una sola caja. Acá cada caja es una tarjeta con
                cada dato etiquetado, y nada se sale del ancho. */}
            <div className="xl:hidden space-y-3">
              {turnos.length === 0 ? (
                <p className="text-sm text-center py-6 sunmi-text-muted">
                  No hay cajas para estos filtros.
                </p>
              ) : (
                turnos.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-lg border sunmi-border p-3 ${claseFila(t)}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <EtiquetaEstado turno={t} />
                      <SunmiButton
                        color="cyan"
                        onClick={() => router.push(`/modulos/turnos/${t.id}`)}
                      >
                        Ver
                      </SunmiButton>
                    </div>

                    <div className="font-semibold text-sm mb-1 break-words">
                      {t.vendedor?.nombre || t.vendedor?.email || "-"}
                    </div>

                    {t.anuladoEn && t.motivoAnulacion && (
                      <div className="text-[11px] sunmi-text-warning mb-2 break-words">
                        {t.motivoAnulacion}
                      </div>
                    )}

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                      <Dato k="Apertura" v={fmtFecha(t.apertura)} />
                      <Dato
                        k="Cierre"
                        v={t.anuladoEn ? "-" : t.cierre ? fmtFecha(t.cierre) : "-"}
                      />
                      <Dato k="M. inicial" v={fmt(t.montoInicial)} />
                      <Dato k="Esperado" v={fmt(t.montoEsperadoEfectivo)} />
                      <Dato k="Real" v={fmt(t.montoRealEfectivo)} />
                      <Dato
                        k="Diferencia"
                        v={fmt(t.diferenciaEfectivo)}
                        clase={
                          t.diferenciaEfectivo != null && t.diferenciaEfectivo < 0
                            ? "sunmi-text-danger font-semibold"
                            : t.diferenciaEfectivo != null && t.diferenciaEfectivo > 0
                            ? "sunmi-text-success font-semibold"
                            : ""
                        }
                      />
                      <Dato
                        k="Se retiró"
                        v={t.efectivoRetiradoCierre != null ? fmt(t.efectivoRetiradoCierre) : "—"}
                      />
                      <Dato
                        k="Fondo dejado"
                        v={t.fondoDejadoCierre != null ? fmt(t.fondoDejadoCierre) : "—"}
                        clase="sunmi-text-link"
                      />
                      <Dato k="Ventas" v={t.cantidadVentas ?? "-"} />
                      <Dato k="Efectivo" v={fmt(t.totalVentasEfectivo)} />
                      <Dato k="Digital" v={fmt(t.totalVentasDigital)} />
                    </dl>
                  </div>
                ))
              )}
            </div>

            {paginacion && paginacion.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm">
                <span className="sunmi-text-muted">
                  {paginacion.total} caja{paginacion.total === 1 ? "" : "s"} · página{" "}
                  {paginacion.page} de {paginacion.totalPaginas}
                </span>
                <div className="flex gap-2">
                  <SunmiButton
                    color="slate"
                    onClick={() => buscar(page - 1)}
                    disabled={page <= 1}
                  >
                    Anterior
                  </SunmiButton>
                  <SunmiButton
                    color="slate"
                    onClick={() => buscar(page + 1)}
                    disabled={page >= paginacion.totalPaginas}
                  >
                    Siguiente
                  </SunmiButton>
                </div>
              </div>
            )}
          </>
        )}
      </SunmiCard>
    </div>
  );
}

function Dato({ k, v, clase = "" }) {
  return (
    <>
      <dt className="sunmi-text-muted">{k}</dt>
      <dd className={`text-right break-words ${clase}`}>{v}</dd>
    </>
  );
}
