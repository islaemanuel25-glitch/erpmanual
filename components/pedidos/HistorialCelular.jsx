"use client";

// components/pedidos/HistorialCelular.jsx
//
// EL HISTORIAL DE PEDIDOS AL DEPÓSITO, EN EL CELULAR (por debajo de 1024 px).
//
// Rehecho el 2026-10-22. Antes, desde la entrada de Pedidos, tocar un pedido
// anterior llevaba a otra pantalla: cinta naranja, buscador, desplegable y
// tarjetas "POS #15" con "Ver detalle" que desplegaba en el lugar. Otro
// diseño, otra numeración, y no abría el pedido tocado. En la computadora
// sigue esa pantalla hasta que se diseñe la suya (ver el reparto en
// `app/modulos/pedidos/historial/page.jsx`).
//
//   · el título y el Volver van en el shell; el Volver vuelve a la entrada;
//   · arriba, el filtro de estado: Todos / En curso / Recibidos / Cancelados;
//   · la lista: la MISMA fila que "Pedidos anteriores" de la entrada
//     (`FilaDePedidoAnterior`), el más nuevo arriba;
//   · tocar uno abre su detalle; uno en curso (Borrador, Enviado o
//     Preparando) va a la entrada de Pedidos, que es donde se maneja.
//
// ── POR QUÉ SE LEE TODO Y SE PAGINA ACÁ ───────────────────────────────────
//
// Los filtros son en palabras del local (`lib/pedidos/estadoParaElLocal.js`):
// "Recibidos" sale del estado de la TRANSFERENCIA y "En curso" junta estados
// del pedido y de la transferencia. `/api/pedidos/historial` filtra por el
// estado del pedido y nada más, así que no puede contestar estos filtros. La
// pantalla pide todas las páginas (de a 50, el máximo de la ruta), filtra, y
// pagina lo filtrado con `SunmiPaginador`.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import FilaDePedidoAnterior from "@/components/pedidos/FilaDePedidoAnterior";
import {
  FILTRO_HISTORIAL,
  OPCIONES_FILTRO_HISTORIAL,
  SE_MANEJA_EN_LA_ENTRADA,
  estadoParaElLocal,
  pasaFiltroHistorial,
} from "@/lib/pedidos/estadoParaElLocal";

/** Cuántos por página, en la pantalla. */
const POR_PAGINA = 25;
/** De a cuántos se le piden a la ruta: su máximo. */
const DE_A = 50;
/** Un tope, por si la ruta contestara mal el total: nunca más de 40 pedidos a la red. */
const PAGINAS_MAXIMAS = 40;

export default function HistorialCelular() {
  const router = useRouter();
  const { perfil, cargando: cargandoPerfil } = useUser();

  useTituloDePagina("Historial de pedidos");
  useAccionDePagina(() => <SunmiBackButton onVolver={() => router.push("/modulos/pedidos")} />, [router]);

  const [pedidos, setPedidos] = useState(null);
  const [pendiente, setPendiente] = useState(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState(FILTRO_HISTORIAL.TODOS);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const todos = [];
        let p = 1;
        let totalPages = 1;
        do {
          const res = await fetch(`/api/pedidos/historial?page=${p}&pageSize=${DE_A}`, { cache: "no-store" });
          const json = await res.json();
          if (!json.ok) {
            if (json.needsContexto) {
              router.push("/inicio");
              return;
            }
            if (vivo) setError(json.error || "No se pudo cargar el historial.");
            return;
          }
          todos.push(...(json.items || []));
          totalPages = json.totalPages || 1;
          p += 1;
        } while (p <= totalPages && p <= PAGINAS_MAXIMAS);
        // El pedido en curso, para saber si el depósito ya lo empezó: es lo
        // que separa "Enviado" de "Preparando", y la lista no lo trae.
        const resCarrito = await fetch("/api/pedidos/carrito", { cache: "no-store" });
        const carrito = await resCarrito.json().catch(() => ({}));
        if (!vivo) return;
        setPendiente(carrito?.ok ? carrito.pendiente || null : null);
        setPedidos(todos);
      } catch (err) {
        console.error(err);
        if (vivo) setError("Error de conexión al cargar el historial.");
      }
    };
    cargar();
    return () => {
      vivo = false;
    };
  }, [router]);

  const permisos = perfil?.permisos || [];
  const puede = (Array.isArray(permisos) && permisos.includes("*")) || permisos.includes("pedidos.ver");

  if (cargandoPerfil) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando...</span>
      </div>
    );
  }
  if (!puede) return <SinPermisos />;

  const conEstado = (pedidos || []).map((p) => ({
    pedido: p,
    estado: estadoParaElLocal({
      estado: p.estado,
      transferenciaEstado: p.transferenciaEstado,
      depositoEmpezo: pendiente?.posId === p.posId && !!pendiente.depositoEmpezo,
    }),
  }));
  const filtrados = conEstado.filter((x) => pasaFiltroHistorial(x.estado, filtro));
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);

  const abrir = ({ pedido, estado }) => {
    if (SE_MANEJA_EN_LA_ENTRADA.includes(estado)) router.push("/modulos/pedidos");
    else router.push(`/modulos/pedidos/historial/${pedido.posId}`);
  };

  return (
    <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4 pb-4 space-y-4" data-historial-celular="">
      {error ? <SunmiAviso tono="danger">{error}</SunmiAviso> : null}

      <SunmiFiltroEstado
        rotulo="Estado"
        opciones={OPCIONES_FILTRO_HISTORIAL}
        valor={filtro}
        onCambiar={(v) => {
          setFiltro(v);
          setPagina(1);
        }}
      />

      {pedidos === null && !error ? <p className="text-sm2 sunmi-text-muted text-center py-4">Cargando...</p> : null}
      {pedidos !== null && filtrados.length === 0 ? (
        <p className="text-sm2 sunmi-text-muted text-center py-4">
          {pedidos.length === 0 ? "Todavía no hay pedidos al depósito." : "No hay pedidos en este estado."}
        </p>
      ) : null}

      {visibles.length ? (
        <div className="space-y-2">
          {visibles.map((x) => (
            <FilaDePedidoAnterior key={x.pedido.posId} pedido={x.pedido} estado={x.estado} onAbrir={() => abrir(x)} />
          ))}
        </div>
      ) : null}

      {filtrados.length > POR_PAGINA ? (
        <SunmiPaginador
          page={paginaVista}
          pageSize={POR_PAGINA}
          totalPages={totalPaginas}
          totalItems={filtrados.length}
          onPrev={() => setPagina(Math.max(1, paginaVista - 1))}
          onNext={() => setPagina(Math.min(totalPaginas, paginaVista + 1))}
          onGoToPage={(p) => setPagina(p)}
          formaDelCelular
        />
      ) : null}
    </div>
  );
}
