"use client";

// RECIBIR MERCADERÍA — EL LISTADO DE LO QUE ESTÁ POR LLEGAR.
//
// ── QUÉ SE SACÓ, Y POR QUÉ ────────────────────────────────────────────────
//
// Había que scrollear una pantalla entera de filtros para ver el primer pedido,
// y hay dos pedidos. Lo que ocupaba ese espacio:
//
//   · Un SEGUNDO título "RECIBIR MERCADERÍA", en naranja y del tamaño de un
//     botón sin serlo. El título lo pone el shell, una sola vez.
//   · "Estado: Enviado (fijo)" — un campo que no se puede cambiar, ocupando el
//     lugar de uno que sí.
//   · Desde / Hasta y los botones Hoy / Ver todo / Limpiar, en columna contra
//     el borde derecho con media pantalla en blanco al lado. Los reemplaza el
//     selector de período con su navegador, que dice dónde estás parado en vez
//     de pedir dos fechas.
//   · El desplegable de proveedor, que lo reemplaza el buscador.
//   · El paginador "Página 1 de 1". Vuelve cuando haya con qué paginar.
//
// ── LA ESTRUCTURA ES LA DE LA CUENTA DE TRANSFERENCIAS ────────────────────
//
// Y las piezas del período son LAS MISMAS, importadas de ahí: `ChipsDePeriodo`,
// `NavegadorDePeriodo` y el cálculo de `periodoDePago` / `descripcionDelPeriodo`.
// No se copiaron. Viven en `components/transferencias/` y no en el kit, que es
// donde deberían estar: moverlas arrastra `periodoDePago`, que tiene 19
// importadores incluidas rutas de API, así que esa mudanza es su propia tanda.
//
// El armado —gutter, separación entre bloques, lista y pie— lo pone
// `SunmiPantallaDeTrabajo`, que ya existe.
//
// ── EL AGRUPADO ES POR FECHA DE ENVÍO ─────────────────────────────────────
//
// No por la de la mercadería: todavía no llegó, y agrupar por una fecha vacía
// pondría todo en un montón. La fecha de envío contesta la pregunta real, que
// es hace cuánto que esto está esperando.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";

import ChipsDePeriodo, { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";

import TarjetaPorEntrar from "@/components/compras-proveedor/TarjetaPorEntrar";
import DiaDePedidos from "@/components/compras-proveedor/DiaDePedidos";
import EntradaSinPedido from "@/components/compras-proveedor/EntradaSinPedido";
import usePedidosProveedor from "@/components/compras-proveedor/usePedidosProveedor";
import { agruparPedidosPorDia, diasEsperando } from "@/lib/compras-proveedor/diasDePedidos";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { caeEnElPeriodo } from "@/lib/transferencias/periodoDePago";

export const PLACEHOLDER_BUSCADOR = "Buscar pedido por número o proveedor";

export default function RecepcionMercaderiaPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  // El Volver va al slot del shell, que es donde viven los de las otras 32
  // pantallas. Antes esta pantalla no tenía ninguno.
  useAccionDePagina(() => <SunmiBackButton href="/modulos/compras" />, []);

  // ── EL PERÍODO ──────────────────────────────────────────────────────────
  //
  // Arranca en Semana, como pide el diseño. El estado vive acá y no en la URL
  // —transferencias lo pone en la URL porque vuelve del detalle y necesita
  // recuperar dónde estaba—; acá volver de recibir cae en la semana en curso,
  // que es el default y casi siempre es donde se estaba. Queda anotado.
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

  // Bandeja de recepción: SOLO pedidos ENVIADO. Deja de ser un campo en
  // pantalla porque nunca fue una elección: es qué es esta pantalla.
  const { loading, items } = usePedidosProveedor({
    estado: "ENVIADO",
    pageSize: 200,
    ordenar: true,
  });

  // ── FILTRAR Y AGRUPAR ───────────────────────────────────────────────────
  //
  // El período y el texto se aplican del lado del cliente sobre la misma lista.
  // Con dos pedidos y un tope de 200 no hay nada que pedirle al servidor, y
  // pedirle un rango por cada flecha sería un viaje por toque.
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

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  // El MISMO permiso que pedía la pantalla vieja. Esta tanda rediseña, no
  // cambia quién puede entrar.
  const autorizado = permisos.includes("*") || permisos.includes("compras.ver");
  if (!autorizado) return <SinPermisos />;

  return (
    <div className="md:hidden p-2">
      <SunmiPantallaDeTrabajo
        contexto={
          <TarjetaPorEntrar
            total={total}
            rotuloDelPeriodo={periodo.titulo}
            pedidos={visibles.length}
            diasDelMasViejo={masViejo}
          />
        }
        antesDeLista={
          <>
            <ChipsDePeriodo
              valor={unidad}
              onCambiar={(u) => {
                // Cambiar de unidad vuelve al período en curso: quedarse en el
                // desplazamiento anterior mostraría "hace tres meses" sin que
                // nadie lo haya pedido. Es lo mismo que hace transferencias.
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

            {/* EL BUSCADOR ES SIMPLE, SIN VOZ, y es el mismo criterio que
                transferencias: acá se busca un NÚMERO de pedido o un nombre de
                proveedor —dos o tres palabras conocidas—, no un producto entre
                cientos. Dictar un número de cuatro cifras no es más rápido que
                escribirlo. */}
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
                : "No hay pedidos esperando mercadería en este período."}
            </p>
          ) : (
            dias.map((dia) => (
              <DiaDePedidos
                key={dia.fecha}
                dia={dia}
                onRecibir={(p) => router.push(`/modulos/compras-proveedor/${p.id}`)}
              />
            ))
          )
        }
        despuesDeLista={
          // ── LA PUERTA DE "LLEGÓ ALGO SIN PEDIDO", SIN DESTINO TODAVÍA ───
          //
          // Medido: NO existe hoy ningún camino para subir una factura sin un
          // pedido detrás. Subir un comprobante vive adentro del detalle de un
          // pedido —`PanelComprobantes`, en `[id]/page.jsx`— así que siempre
          // hay que elegir primero a qué pedido pertenece, que es exactamente
          // lo que este caso no tiene.
          //
          // Queda VISIBLE y sin handler a propósito, porque mandarla a
          // cualquiera de las pantallas que sí existen sería peor: el listado
          // de pendientes no sube nada y el detalle de un pedido pide elegir un
          // pedido que no hay. A dónde debería ir es la forma 2 y es la próxima
          // tanda.
          <EntradaSinPedido />
        }
      />
    </div>
  );
}
