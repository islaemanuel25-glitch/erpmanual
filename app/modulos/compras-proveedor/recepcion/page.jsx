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

import { useEffect, useMemo, useState } from "react";
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
import ElegirProveedor from "@/components/compras-proveedor/ElegirProveedor";
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
  //
  // Eligiendo proveedor, VUELVE A LA LISTA y no a compras: es un paso adentro
  // de esta pantalla, y mandarlo afuera haría que salir de un toque dado sin
  // querer costara volver a entrar a la bandeja.
  useAccionDePagina(
    () =>
      eligiendoProveedor ? (
        <SunmiBackButton onVolver={() => setEligiendoProveedor(false)} />
      ) : (
        <SunmiBackButton href="/modulos/compras" />
      ),
    [eligiendoProveedor]
  );

  // ── EL PERÍODO ──────────────────────────────────────────────────────────
  //
  // Arranca en Semana, como pide el diseño. El estado vive acá y no en la URL
  // —transferencias lo pone en la URL porque vuelve del detalle y necesita
  // recuperar dónde estaba—; acá volver de recibir cae en la semana en curso,
  // que es el default y casi siempre es donde se estaba. Queda anotado.
  const [unidad, setUnidad] = useState(UNIDADES.SEMANA);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [busqueda, setBusqueda] = useState("");

  // ── LLEGÓ ALGO SIN PEDIDO: EL PASO DE ELEGIR PROVEEDOR ─────────────────
  //
  // Vive ACÁ ADENTRO y no en una ruta nueva, por dos motivos y el segundo es el
  // que manda:
  //
  // 1. La pantalla de elegir proveedor ya existe —`ElegirProveedor`, la misma
  //    que usa Nuevo pedido— y lo único que necesita es quién le pasa la lista.
  //
  // 2. LO QUE YA NOS PASÓ. El enlace "Crear borrador desde foto" se sacó de
  //    Nuevo pedido porque navegar ahí PERDÍA EL PEDIDO QUE SE ESTABA ARMANDO:
  //    los ítems viven en el estado de React y esa navegación no pasaba por el
  //    guardado. Entrar por acá no puede repetirlo: esta bandeja no tiene nada
  //    a medias —es una lista— y no toca ni el borrador de `/nueva` ni la
  //    recepción en curso, que son las dos cosas que sí viven en
  //    `sessionStorage`.
  const [eligiendoProveedor, setEligiendoProveedor] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState("");

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

  // La lista de proveedores se pide al entrar a elegir, no al abrir la
  // bandeja: el camino de todos los días es tocar un pedido de la lista, y
  // pedirla siempre sería un viaje por cada vez que alguien mira qué llegó.
  useEffect(() => {
    if (!eligiendoProveedor || proveedores.length) return;
    let vigente = true;
    (async () => {
      try {
        const r = await fetch("/api/proveedores/listar?estado=activos&pageSize=200", {
          credentials: "include",
          cache: "no-store",
        });
        const d = await r.json();
        if (vigente && d?.ok) setProveedores(d.items || []);
        else if (vigente) setErrorCrear("No se pudo traer la lista de proveedores.");
      } catch {
        if (vigente) setErrorCrear("No se pudo traer la lista de proveedores.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, [eligiendoProveedor, proveedores.length]);

  /**
   * Crea el pedido vacío y cae en la recepción, que es donde está el bloque de
   * la foto. El pedido nace ENVIADO y marcado: sus renglones los va a poner el
   * papel cuando se lea.
   */
  const entrarSinPedido = async (proveedorId) => {
    if (creando) return;
    setCreando(true);
    setErrorCrear("");
    try {
      const r = await fetch("/api/compras-proveedor/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proveedorId: Number(proveedorId), nacidoDeFactura: true }),
      });
      const d = await r.json();
      if (!d?.ok || !d?.item?.id) {
        setErrorCrear(d?.error || "No se pudo abrir la recepción para ese proveedor.");
        setCreando(false);
        return;
      }
      router.push(`/modulos/compras-proveedor/${d.item.id}`);
    } catch {
      setErrorCrear("No se pudo abrir la recepción para ese proveedor.");
      setCreando(false);
    }
  };

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

  // ── ELEGIR PROVEEDOR: LA MISMA PANTALLA QUE NUEVO PEDIDO ───────────────
  //
  // Se entra a hacer UNA cosa, así que ocupa la pantalla entera en vez de
  // abrirse como una capa arriba de la lista. El título y el volver los pone el
  // shell, igual que allá.
  if (eligiendoProveedor) {
    return (
      <div className="md:hidden p-2 flex flex-col gap-renglon">
        {errorCrear && (
          <p className="text-sm3 sunmi-text-danger break-words" role="alert">
            {errorCrear}
          </p>
        )}
        <ElegirProveedor
          proveedores={proveedores}
          filtro={filtroProveedor}
          onFiltro={setFiltroProveedor}
          onElegir={entrarSinPedido}
        />
      </div>
    );
  }

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
          // ── LA PUERTA DE "LLEGÓ ALGO SIN PEDIDO", YA CON DESTINO ────────
          //
          // Tres pasos y NINGUNA pantalla nueva: elegir el proveedor con la
          // misma pantalla de Nuevo pedido, y caer en la recepción, que es
          // donde vive el bloque de la foto. Lo que falta en el medio —el
          // pedido— se crea vacío y marcado como nacido de una factura, y sus
          // renglones los pone el papel al leerse.
          <>
            {errorCrear && (
              <p className="text-sm3 sunmi-text-danger break-words" role="alert">
                {errorCrear}
              </p>
            )}
            <EntradaSinPedido onEntrar={() => setEligiendoProveedor(true)} />
          </>
        }
      />
    </div>
  );
}
