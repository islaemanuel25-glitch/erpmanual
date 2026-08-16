"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { estadoDelTurno, ESTADO_TURNO } from "@/lib/caja/cierreRelevo";

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

/**
 * Un turno tiene CUATRO estados, no tres.
 *
 * Además de abierta, cerrada y anulada existe la que ya tomó su corte de cierre:
 * sigue con `cierre` en null y no vende. Con la función local de tres casos
 * salía como "Abierta", que era mentir sobre una caja que no admite ni una venta
 * más. Se usa la fuente única del proyecto —la misma que aplica el backend— en
 * vez de comparar campos acá.
 */
function EtiquetaEstado({ turno }) {
  const e = turno.estado ?? estadoDelTurno(turno);
  if (e === ESTADO_TURNO.ABIERTO)
    return (
      <span className="sunmi-text-success font-semibold whitespace-nowrap">
        ● Abierta
      </span>
    );
  if (e === ESTADO_TURNO.CIERRE_EN_PREPARACION)
    return (
      <span
        className="sunmi-text-warning font-semibold whitespace-nowrap"
        title="Ya tomó el corte de cierre: no admite ventas y espera el conteo"
      >
        ◐ Cierre en preparación
      </span>
    );
  if (e === ESTADO_TURNO.ANULADO)
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
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-[11px] sunmi-text-muted mb-1 block">
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
  const [paginacion, setPaginacion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hoy = hoyArgentinaISO();

  // Filtros. El estado inicial es deliberado: hoy y solo las cajas abiertas.
  // Entrar a la pantalla no debe disparar una consulta de todo el historial —
  // para eso está ampliar el rango a mano.
  //
  // El LOCAL no es un filtro: sale del contexto activo del ERP y no se elige
  // acá. Que exista una sola forma de cambiar de ubicación evita que la pantalla
  // muestre un local distinto del que dice la cabecera de la aplicación.
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [vendedorId, setVendedorId] = useState("");
  const [page, setPage] = useState(1);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeUsar = esAdmin || permisos.includes("pos.usar");
  const puedeVerTodos = esAdmin || permisos.includes("turnos.ver_todos");

  const localId = contexto?.localId ? String(contexto.localId) : "";

  const buscar = useCallback(
    async (paginaPedida = 1) => {
      if (!localId) return;
      setLoading(true);
      setError("");
      try {
        // Sin `localId`: el backend lo resuelve del contexto autenticado.
        const params = new URLSearchParams();
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
    "Cambio dejado",
    "Ventas",
    "Efectivo",
    "Digital",
    "",
  ];

  // Las anuladas se atenúan para que no compitan visualmente con las cajas
  // reales, pero siguen visibles y auditables. Va como tono de fila: atenuar
  // con una clase suelta dejaba a la fila sin hover, y una caja anulada se
  // sigue queriendo poder señalar con el mouse.
  const esAnulada = (t) => (t.estado ?? estadoDelTurno(t)) === ESTADO_TURNO.ANULADO;
  const tonoFila = (t) => (esAnulada(t) ? "apagado" : null);
  /** En móvil la caja es una tarjeta, no una fila: ahí la atenuación va directa. */
  const claseFila = (t) => (esAnulada(t) ? "opacity-60" : "");

  // Franja compacta: encabezado + filtros. En escritorio entra todo en una fila;
  // en móvil las fechas van a la par y el resto a ancho completo. Sin separador
  // "Filtros" y sin selector de Local: el local es el del contexto del ERP.
  const filtros = (
    <SunmiCard className="p-3 overflow-visible backdrop-blur-0">
      <div className="mb-3">
        <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
          Cajas
        </h1>
        <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
          Consulta de turnos y cierres
        </p>

        {/* Accesos al circuito del relevo. Van acá, en Cajas, porque es donde
            alguien busca una caja que quedó a medio cerrar o un cambio que
            nadie tomó: buscarlos en el POS obligaría a tener un turno abierto. */}
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={() => router.push("/modulos/pos-ventas/cierres")}
            className="text-[11px] sunmi-text-link underline"
          >
            Cierres pendientes
          </button>
          <span className="text-[11px] sunmi-text-muted">·</span>
          <button
            type="button"
            onClick={() => router.push("/modulos/turnos/cambios-pendientes")}
            className="text-[11px] sunmi-text-link underline"
          >
            Cambios pendientes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3 items-end">
        <Campo label="Desde" htmlFor="f-desde">
          <SunmiInput
            id="f-desde"
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="!border !border-[var(--pos-link)]"
          />
        </Campo>

        <Campo label="Hasta" htmlFor="f-hasta">
          <SunmiInput
            id="f-hasta"
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="!border !border-[var(--pos-link)]"
          />
        </Campo>

        <div className="col-span-2 lg:col-span-1 relative">
          <Campo label="Estado">
            <SunmiSelectAdv
              value={estado}
              onChange={(v) => setEstado(v)}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <option value="abiertas">Abiertas</option>
              {/* El TERCER estado: cajas que ya cortaron y esperan conteo. Sin esta
                  opción quedaban invisibles —no salen en Abiertas ni en
                  Cerradas— y era imposible encontrarlas desde acá. */}
              <option value="en_preparacion">Cierre en preparación</option>
              <option value="cerradas">Cerradas</option>
              <option value="anuladas">Anuladas</option>
              <option value="todas">Todas</option>
            </SunmiSelectAdv>
          </Campo>
        </div>

        <div className="col-span-2 lg:col-span-1 relative">
          <Campo label="Vendedor">
            {puedeVerTodos ? (
              <SunmiSelectAdv
                value={vendedorId}
                onChange={(v) => setVendedorId(v)}
                className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
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

        <div className="col-span-2 lg:col-span-1">
          <SunmiButton
            color="amber"
            onClick={() => buscar(1)}
            disabled={loading || !localId}
            className="w-full font-semibold"
          >
            {loading ? "Buscando…" : "Buscar"}
          </SunmiButton>
        </div>

        <div className="col-span-2 lg:col-span-1">
          <SunmiButton
            color="slate"
            onClick={limpiar}
            disabled={loading}
            className="w-full"
          >
            Limpiar filtros
          </SunmiButton>
        </div>
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

      {/* Panel separado para el vacío: un "Sin datos disponibles" dentro de la
          tabla no se ve en móvil, donde la tabla ni siquiera se renderiza. */}
      {!loading && !error && turnos.length === 0 && (
        <SunmiCard>
          <p className="text-sm text-center py-8 sunmi-text-muted">
            No hay cajas para estos filtros.
          </p>
        </SunmiCard>
      )}

      {(loading || error || turnos.length > 0) && (
      <SunmiCard>
        {loading ? (
          <SunmiLoader />
        ) : error ? (
          <p className="text-sm text-center py-6 sunmi-text-danger">{error}</p>
        ) : (
          <>
            {/* ===== ESCRITORIO (desde 1280px) =====
                El corte es `xl`, no `md` ni `lg`: medido en navegador, la tabla
                de 14 columnas deja 25 elementos fuera del viewport a 768px y 11
                a 1024px. El contenedor tiene overflow-x-auto, así que la página
                no scrollea de lado, pero igual habría que arrastrar para leer
                una sola caja — y 768 es el ancho típico de una tablet en
                mostrador. */}
            <div className="hidden xl:block">
              <SunmiTable headers={headers}>
                {turnos.map((t) => (
                    <SunmiTableRow key={t.id} tono={tonoFila(t)}>
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
                ))}
              </SunmiTable>
            </div>

            {/* ===== MÓVIL Y TABLET (hasta 1279px) =====
                Una tabla de 14 columnas en un teléfono obliga a desplazarse de
                lado para leer una sola caja. Acá cada caja es una tarjeta con
                cada dato etiquetado, y nada se sale del ancho. */}
            <div className="xl:hidden space-y-3">
              {turnos.map((t) => (
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
                        k="Cambio dejado"
                        v={t.fondoDejadoCierre != null ? fmt(t.fondoDejadoCierre) : "—"}
                        clase="sunmi-text-link"
                      />
                      <Dato k="Ventas" v={t.cantidadVentas ?? "-"} />
                      <Dato k="Efectivo" v={fmt(t.totalVentasEfectivo)} />
                      <Dato k="Digital" v={fmt(t.totalVentasDigital)} />
                    </dl>
                  </div>
              ))}
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
      )}
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
