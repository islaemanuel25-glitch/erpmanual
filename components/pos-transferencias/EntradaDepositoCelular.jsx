"use client";

// components/pos-transferencias/EntradaDepositoCelular.jsx
//
// "PEDIDOS DE LOCALES": LO QUE EL DEPÓSITO TIENE PARA PREPARAR, EN EL CELULAR
// (por debajo de 1024 px). Diseño aprobado por Emanuel el 2026-10-22.
//
//   · el título y el Volver van en el shell;
//   · "Para preparar": una tarjeta por pedido de local pendiente, el más VIEJO
//     arriba —es el que más espera—, con el estado ("Nuevo" o "Preparando · N
//     de M"), cuándo se pidió, cuántos productos y quién lo pidió, y el botón
//     que abre la pantalla de preparar;
//   · abajo, separado, "Transferencia sin pedido": los selectores de siempre
//     (`TransferenciaSinPedido`), en una hoja.
//
// Los pedidos son los de `/api/pos-transferencias/solicitados`, la misma ruta
// que la pantalla de siempre: el depósito ve los suyos y el admin, todos.
// "Preparando · N de M" sale de lo que la ruta ya sabe (`depositoEmpezo` y
// `revisados`, con el criterio de `lib/pedidos/revisionDeLinea.js`); la
// pantalla no cuenta nada por su cuenta.
//
// El MODO LOCAL no es de esta pantalla: los locales piden por /modulos/pedidos,
// y un local que entra acá ve la pantalla de siempre (`PantallaDeSiempre`).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import {
  SelectoresAdmin,
  SelectoresDeposito,
  useTransferenciaSinPedido,
} from "@/components/pos-transferencias/TransferenciaSinPedido";
import { cuandoDelPedido } from "@/lib/pedidos/cuandoDelPedido";

export const TITULO_ENTRADA_DEPOSITO = "Pedidos de locales";
export const TEXTO_SIN_PEDIDO = "Transferencia sin pedido";

const productos = (n) => (n === 1 ? "producto" : "productos");

/** El pedido más viejo arriba. Sin fecha (no debería pasar), al final. */
const porAntiguedad = (a, b) =>
  (a.solicitadoAt ? Date.parse(a.solicitadoAt) : Infinity) - (b.solicitadoAt ? Date.parse(b.solicitadoAt) : Infinity);

/** "Nuevo", o "Preparando · N de M" con N revisados de M renglones. */
export function estadoDelPedidoParaPreparar(s) {
  return s.depositoEmpezo ? `Preparando · ${s.revisados ?? 0} de ${s.itemCount}` : "Nuevo";
}

function TarjetaParaPreparar({ s, onPreparar }) {
  const empezado = !!s.depositoEmpezo;
  return (
    <SunmiCard data-pedido-para-preparar={s.id} className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-lg2 font-semibold sunmi-text-strong">{s.destinoNombre}</span>
        <SunmiPill color={empezado ? "amber" : "cyan"}>{estadoDelPedidoParaPreparar(s)}</SunmiPill>
      </div>
      <div className="space-y-0.5">
        <p className="text-sm2 sunmi-text-muted">
          {[`Pedido #${s.id}`, cuandoDelPedido(s.solicitadoAt), `${s.itemCount} ${productos(s.itemCount)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-sm2 sunmi-text-muted">{`Lo pidió ${s.solicitadoPorNombre}`}</p>
      </div>
      <SunmiButton
        color={empezado ? "slate" : "primary"}
        className="w-full min-h-toque justify-center"
        onClick={onPreparar}
      >
        {empezado ? "Seguir preparando" : "Preparar"}
      </SunmiButton>
    </SunmiCard>
  );
}

export default function EntradaDepositoCelular({ PantallaDeSiempre }) {
  const router = useRouter();
  const { perfil, cargando: cargandoPerfil } = useUser();

  const [modo, setModo] = useState(null);
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState("");
  const [sinPedidoAbierto, setSinPedidoAbierto] = useState(false);
  const [errorSinPedido, setErrorSinPedido] = useState("");
  const sinPedido = useTransferenciaSinPedido();

  const esDelDeposito = modo === "deposito" || modo === "admin";

  useTituloDePagina(esDelDeposito ? TITULO_ENTRADA_DEPOSITO : null);
  useAccionDePagina(
    () => (esDelDeposito ? <SunmiBackButton onVolver={() => router.back()} /> : null),
    [esDelDeposito, router]
  );

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const resOpt = await fetch("/api/pos-transferencias/opciones", { cache: "no-store" });
        const jsonOpt = await resOpt.json();
        if (!vivo) return;
        if (!jsonOpt.ok) {
          // La pantalla de siempre dice el error como siempre.
          setModo("otro");
          return;
        }
        sinPedido.cargarOpciones(jsonOpt);
        setModo(jsonOpt.modo || "otro");
        if (jsonOpt.modo !== "deposito" && jsonOpt.modo !== "admin") return;

        const res = await fetch("/api/pos-transferencias/solicitados", { cache: "no-store" });
        const json = await res.json();
        if (!vivo) return;
        if (!json.ok) {
          setError(json.error || "No se pudieron cargar los pedidos de los locales.");
          setPedidos([]);
          return;
        }
        setPedidos([...(json.items || [])].sort(porAntiguedad));
      } catch (err) {
        console.error(err);
        if (vivo) {
          setError("Error de conexión al cargar los pedidos de los locales.");
          setPedidos([]);
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // `sinPedido` cambia en cada render; se carga una vez, al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const permisos = perfil?.permisos || [];
  const puede = (Array.isArray(permisos) && permisos.includes("*")) || permisos.includes("pos_transferencias.ver");

  if (cargandoPerfil || modo === null) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando opciones...</span>
      </div>
    );
  }
  if (!esDelDeposito) return <PantallaDeSiempre />;
  if (!puede) return <SinPermisos />;

  return (
    <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4 pb-4 space-y-4" data-entrada-deposito="">
      {error ? <SunmiAviso tono="danger">{error}</SunmiAviso> : null}

      <section className="space-y-2">
        <p className="text-sm2 sunmi-text-muted">Para preparar</p>
        {pedidos === null ? <p className="text-sm2 sunmi-text-muted text-center py-4">Cargando...</p> : null}
        {pedidos !== null && pedidos.length === 0 ? (
          <p className="text-sm2 sunmi-text-muted text-center py-4">No hay pedidos para preparar</p>
        ) : null}
        {(pedidos || []).map((s) => (
          <TarjetaParaPreparar
            key={s.id}
            s={s}
            onPreparar={() => router.push(`/modulos/pos-transferencias/nueva?posId=${s.id}`)}
          />
        ))}
      </section>

      <SunmiSeparator />

      <SunmiButton
        color="slate"
        className="w-full min-h-toque justify-center"
        onClick={() => {
          setErrorSinPedido("");
          setSinPedidoAbierto(true);
        }}
      >
        {TEXTO_SIN_PEDIDO}
      </SunmiButton>

      {/* ── LO DE SIEMPRE PARA ARRANCAR UNA TRANSFERENCIA ─────────────────
          Los mismos selectores y el mismo "iniciar" que la pantalla de la
          computadora (`TransferenciaSinPedido`), en una hoja: no cambia su
          lógica, cambia dónde están. */}
      <SunmiModalLayout
        open={sinPedidoAbierto}
        title={TEXTO_SIN_PEDIDO}
        onClose={() => setSinPedidoAbierto(false)}
        z={NIVEL_MODAL_GLOBAL}
        forma="hoja"
        espacioCuerpo="gap-2"
      >
        {errorSinPedido ? <SunmiAviso tono="danger">{errorSinPedido}</SunmiAviso> : null}
        {modo === "deposito" && sinPedido.origenDeposito ? (
          <SelectoresDeposito s={sinPedido} onIniciar={() => sinPedido.iniciarTransferencia(modo, setErrorSinPedido)} />
        ) : null}
        {modo === "admin" ? (
          <SelectoresAdmin s={sinPedido} onIniciar={() => sinPedido.iniciarTransferencia(modo, setErrorSinPedido)} />
        ) : null}
      </SunmiModalLayout>
    </div>
  );
}
