"use client";

// app/modulos/pedidos/historial/[id]/page.jsx
//
// EL DETALLE DE UN PEDIDO ANTERIOR, de solo lectura (Emanuel, 2026-10-22).
//
// Se llega tocando un pedido en "Pedidos anteriores" de la entrada o en el
// historial. Es la pantalla del celular; en la computadora, la misma, centrada.
//
//   · el título "Pedido #N" y el Volver en el shell; el Volver vuelve a donde
//     se vino (la entrada o el historial);
//   · arriba, una tarjeta: "Pedido #N" con el estado, las fechas que existan
//     (enviado, recibido, cancelado), cuántos productos y, si salió, el enlace
//     a su transferencia;
//   · debajo, los productos con la tarjeta de solo lectura de Pedidos
//     (`TarjetaPedido` con `soloLectura`), con las fotos si "Ver fotos" está
//     prendido en Pedidos.
//
// Un pedido EN CURSO (Borrador, Enviado o Preparando) no se mira acá: se
// maneja en la entrada de Pedidos, y para allá se va.
//
// Sin "Recibido: N": la ruta no lo trae. Lo recibido vive en la transferencia,
// en su presentación, y no hay una regla escrita que la lleve a la cantidad
// pedida; se ve en la transferencia, por el enlace.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";
import TarjetaPedido from "@/components/pedidos/TarjetaPedido";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { juntarPorProducto, claveDeLoEnviado } from "@/lib/pedidos/lineasDelPedido";
import { COLOR_DEL_ESTADO, SE_MANEJA_EN_LA_ENTRADA, estadoParaElLocal } from "@/lib/pedidos/estadoParaElLocal";
import { fotosGuardadas } from "@/lib/pedidos/verFotos";

const productos = (n) => (n === 1 ? "producto" : "productos");
const cuando = (fecha) => `${diaMesAR(fecha)} ${horaAR(fecha)}`;

/** "Enviado 21/10 14:05 · recibido 22/10 09:30 · cancelado …", con las que existan. */
function lineaDeFechas(pedido) {
  const partes = [];
  if (pedido.solicitadoAt) partes.push(`Enviado ${cuando(pedido.solicitadoAt)}`);
  if (pedido.transferencia?.fechaRecepcion) partes.push(`recibido ${cuando(pedido.transferencia.fechaRecepcion)}`);
  if (pedido.canceladoAt) partes.push(`cancelado ${cuando(pedido.canceladoAt)}`);
  return partes.join(" · ");
}

export default function DetalleDePedido() {
  const router = useRouter();
  const { id } = useParams();
  const { perfil, cargando: cargandoPerfil } = useUser();

  useTituloDePagina(`Pedido #${id}`);
  useAccionDePagina(() => <SunmiBackButton onVolver={() => router.back()} />, [router]);

  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");
  // Se lee al crear el estado, como en Pedidos: la misma clave.
  const [verFotos] = useState(fotosGuardadas);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/pedidos/historial/${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!json.ok) {
          if (json.needsContexto) {
            router.push("/inicio");
            return;
          }
          setError(json.error || "No se pudo cargar el pedido.");
          return;
        }
        setPedido(json.pedido);
      } catch (err) {
        console.error(err);
        if (vivo) setError("Error de conexión al cargar el pedido.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [id, router]);

  const estado = pedido
    ? estadoParaElLocal({
        estado: pedido.estado,
        depositoEmpezo: pedido.depositoEmpezo,
        transferenciaEstado: pedido.transferencia?.estado ?? null,
      })
    : null;
  const enCurso = estado != null && SE_MANEJA_EN_LA_ENTRADA.includes(estado);

  useEffect(() => {
    if (enCurso) router.replace("/modulos/pedidos");
  }, [enCurso, router]);

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

  const lineas = pedido ? juntarPorProducto(pedido.items, claveDeLoEnviado) : [];
  const fechas = pedido ? lineaDeFechas(pedido) : "";

  return (
    <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4 pb-4 space-y-4" data-detalle-pedido="">
      {error ? <SunmiAviso tono="danger">{error}</SunmiAviso> : null}
      {!pedido && !error ? <p className="text-sm2 sunmi-text-muted text-center py-4">Cargando...</p> : null}

      {pedido && !enCurso ? (
        <>
          <SunmiCard data-cabecera-pedido="" className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold sunmi-text-strong">{`Pedido #${pedido.posId}`}</span>
              <SunmiPill color={COLOR_DEL_ESTADO[estado] ?? "slate"}>{estado}</SunmiPill>
            </div>
            {fechas ? <p className="text-sm2 sunmi-text-muted">{fechas}</p> : null}
            <p className="text-sm2 sunmi-text-muted">
              {`${lineas.length} ${productos(lineas.length)}`}
              {pedido.transferencia ? (
                <>
                  {" · "}
                  <SunmiLinkButton onClick={() => router.push(`/modulos/transferencias/${pedido.transferencia.id}`)}>
                    {`Transferencia #${pedido.transferencia.id}`}
                  </SunmiLinkButton>
                </>
              ) : null}
            </p>
          </SunmiCard>

          <SunmiListaProductoCards mismoAlto={false}>
            {lineas.map((item) => (
              <TarjetaPedido key={claveDeLoEnviado(item)} producto={item} cantidad={item.cantidad} conFoto={verFotos} soloLectura />
            ))}
          </SunmiListaProductoCards>
        </>
      ) : null}
    </div>
  );
}
