"use client";

// PEDIDOS PENDIENTES — LOS BORRADORES QUE TODAVÍA NO SE MANDARON.
//
// ── EN EL CELULAR ES COPIA DE RECIBIR MERCADERÍA ──────────────────────────
//
// Mismo orden y mismas piezas que `recepcion/page.jsx`: la tarjeta del total
// (`TarjetaPorEntrar`), los chips y el navegador del período, el buscador y la
// tarjeta de día (`DiaDePedidos`). Lo único que cambia son las palabras, el
// estado de cada pedido y sus dos botones —Continuar pedido y Anular, los que
// ya tenía esta pantalla—, que las piezas reciben por props.
//
// Se sacaron, solo del celular: la cinta naranja con el título repetido, el
// subtítulo, Desde / Hasta, Hoy / Ver todo / Limpiar, el desplegable de
// proveedor y el paginador. El título lo pone el shell una vez.
//
// ── EL ESCRITORIO QUEDA COMO ESTABA ───────────────────────────────────────
//
// Se monta UNA versión según el ancho (`useDesdeMd`, el corte `md` de
// Tailwind, el mismo donde Recibir esconde la suya), y no las dos escondiendo
// una por CSS: cada versión pide su lista con sus propios filtros, y montar las
// dos haría dos pedidos al servidor por cada visita.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";

import ChipsDePeriodo, { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import { UNIDADES, caeEnElPeriodo } from "@/lib/transferencias/periodoDePago";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { useDesdeMd } from "@/lib/layout/useEsEscritorio";

import usePedidosProveedor, {
  diasDesde,
  DIAS_OPERATIVO,
} from "@/components/compras-proveedor/usePedidosProveedor";
import FiltrosPedidosProveedor from "@/components/compras-proveedor/FiltrosPedidosProveedor";
import ListadoPedidosProveedor from "@/components/compras-proveedor/ListadoPedidosProveedor";
import TarjetaPorEntrar from "@/components/compras-proveedor/TarjetaPorEntrar";
import DiaDePedidos from "@/components/compras-proveedor/DiaDePedidos";
import { agruparPedidosPorDia, diasEsperando } from "@/lib/compras-proveedor/diasDePedidos";
// El mismo texto que el buscador de Recibir. No se importa de su página para
// no arrastrar una pantalla entera dentro de la otra.
const PLACEHOLDER_BUSCADOR = "Buscar pedido por número o proveedor";

// Referencia ESTABLE (fuera del componente): pasar el array inline al hook
// recreaba la dependencia en cada render → loop de fetch/render.
const ESTADOS_EN_CURSO = ["BORRADOR"];

const rutaContinuar = (item) => `/modulos/compras-proveedor/nueva?pedidoId=${item.id}`;

/** Anula el pedido, la misma llamada de siempre, y recarga la lista. */
async function anularPedido(item, recargar) {
  if (!window.confirm("¿Seguro que querés anular este pedido?")) return;
  try {
    const res = await fetch(`/api/compras-proveedor/anular/${item.id}`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    if (data.ok) {
      recargar();
    } else {
      alert(data.error || "No se pudo anular el pedido");
    }
  } catch {
    alert("Error de conexión al anular el pedido");
  }
}

/**
 * Lo que dice la línea de color de cada pedido. Un borrador de más de siete
 * días se marca igual que en el escritorio: no es operación normal.
 */
function estadoDelPendiente(pedido) {
  return diasDesde(pedido?.createdAt) > DIAS_OPERATIVO ? "Antiguo · revisar" : "En curso";
}

export default function PedidosPendientesPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();
  const desdeMd = useDesdeMd();

  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  // Mientras no se sabe el ancho no se monta ninguna: así nunca aparece la
  // equivocada para después cambiarla.
  if (desdeMd === null) return null;
  return desdeMd ? <PendientesEscritorio /> : <PendientesCelular />;
}

function PendientesEscritorio() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [estado, setEstado] = useState(searchParams.get("estado") || "");
  const [proveedorId, setProveedorId] = useState(searchParams.get("proveedorId") || "");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { loading, items, page, setPage, totalPages, recargar } = usePedidosProveedor({
    estados: ESTADOS_EN_CURSO,
    estado,
    proveedorId,
    fechaDesde,
    fechaHasta,
    pageSize: 50,
    ordenar: true,
  });

  const renderAccion = (item) => (
    <div className="flex flex-wrap items-center gap-2 justify-end">
      <SunmiButton type="button" color="cyan" onClick={() => router.push(rutaContinuar(item))}>
        Continuar pedido
      </SunmiButton>
      <SunmiButton type="button" color="red" onClick={() => anularPedido(item, recargar)}>
        Anular
      </SunmiButton>
    </div>
  );

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="mb-4">
          <SunmiHeader title="Pedidos pendientes" />
          <p className="text-xs sunmi-text-muted px-1">Pedidos en preparación o listos para enviar</p>
        </div>

        <FiltrosPedidosProveedor
          mostrarEstado={false}
          separadorLabel={null}
          proveedorId={proveedorId}
          onProveedor={setProveedorId}
          fechaDesde={fechaDesde}
          onFechaDesde={setFechaDesde}
          fechaHasta={fechaHasta}
          onFechaHasta={setFechaHasta}
          onLimpiar={() => {
            setEstado("");
            setProveedorId("");
            setFechaDesde("");
            setFechaHasta("");
          }}
        />

        <ListadoPedidosProveedor
          items={items}
          loading={loading}
          renderAccion={renderAccion}
          marcarAtrasados
          agruparPorDia
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </SunmiCard>
    </div>
  );
}

function PendientesCelular() {
  const router = useRouter();

  useAccionDePagina(() => <SunmiBackButton href="/modulos/compras" />, []);

  // Arranca en Semana, igual que Recibir mercadería.
  const [unidad, setUnidad] = useState(UNIDADES.SEMANA);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [busqueda, setBusqueda] = useState("");

  const periodo = useMemo(
    () =>
      descripcionDelPeriodo({
        unidad: unidad === CLAVE_OTRO ? UNIDADES.SEMANA : unidad,
        desplazamiento,
      }),
    [unidad, desplazamiento]
  );

  // La misma consulta que Recibir, con los estados de esta pantalla. El
  // período y el texto se aplican en el cliente sobre esta lista, igual que
  // allá: sin proveedor ni fechas en la consulta.
  const { loading, items, recargar } = usePedidosProveedor({
    estados: ESTADOS_EN_CURSO,
    pageSize: 200,
    ordenar: true,
  });

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (items || []).filter((p) => {
      const fecha = p.fechaEnviado || p.createdAt;
      if (!caeEnElPeriodo(fecha, periodo.rango)) return false;
      if (!texto) return true;
      return (
        String(p.id).includes(texto) ||
        String(p.proveedorNombre || "").toLowerCase().includes(texto)
      );
    });
  }, [items, periodo.rango, busqueda]);

  const dias = useMemo(() => agruparPedidosPorDia(visibles), [visibles]);
  const total = useMemo(
    () => visibles.reduce((acc, p) => acc + (Number(p.totalEstimado) || 0), 0),
    [visibles]
  );
  const masViejo = useMemo(() => diasEsperando(visibles), [visibles]);

  return (
    <div className="md:hidden p-2">
      <SunmiPantallaDeTrabajo
        contexto={
          <TarjetaPorEntrar
            total={total}
            rotuloDelPeriodo={periodo.titulo}
            pedidos={visibles.length}
            diasDelMasViejo={masViejo}
            titulo="Pendientes"
            aclaracion="estimado"
            estadoSingular="pedido pendiente"
            estadoPlural="pedidos pendientes"
          />
        }
        antesDeLista={
          <>
            <ChipsDePeriodo
              valor={unidad}
              onCambiar={(u) => {
                setUnidad(u);
                setDesplazamiento(0);
              }}
            />

            <NavegadorDePeriodo
              titulo={periodo.titulo}
              subtitulo={periodo.subtitulo}
              puedeRetroceder
              puedeAvanzar={desplazamiento < 0}
              onAtras={() => setDesplazamiento((d) => d - 1)}
              onAdelante={() => setDesplazamiento((d) => Math.min(0, d + 1))}
            />

            <SunmiInput
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={PLACEHOLDER_BUSCADOR}
              aria-label={PLACEHOLDER_BUSCADOR}
              className="w-full min-h-buscadorListado px-4 text-sm3"
            />
          </>
        }
        lista={
          loading && !items?.length ? (
            <div className="py-12">
              <SunmiLoader />
            </div>
          ) : dias.length === 0 ? (
            <p className="text-center py-6 sunmi-text-muted text-sm2">
              {busqueda.trim()
                ? `No hay pedidos que coincidan con “${busqueda.trim()}”.`
                : "No hay pedidos pendientes en este período."}
            </p>
          ) : (
            dias.map((dia) => (
              <DiaDePedidos
                key={dia.fecha}
                dia={dia}
                estadoDe={estadoDelPendiente}
                renderAccion={(p, claseBoton) => (
                  <>
                    <SunmiButton
                      type="button"
                      color="primary"
                      onClick={() => router.push(rutaContinuar(p))}
                      className={claseBoton}
                    >
                      Continuar pedido
                    </SunmiButton>
                    <SunmiButton
                      type="button"
                      color="red"
                      onClick={() => anularPedido(p, recargar)}
                      className={claseBoton}
                    >
                      Anular
                    </SunmiButton>
                  </>
                )}
              />
            ))
          )
        }
      />
    </div>
  );
}
