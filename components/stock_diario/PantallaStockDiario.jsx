"use client";

// components/stock_diario/PantallaStockDiario.jsx
//
// VALOR DEL STOCK, MÓVIL, COMO TABLERO (Figma EVJ2KvVCrY0oVSowfboymQ, página
// "Finanzas · Valor del Stock · Dashboard móvil", 329-624 y 329-802). Contesta
// cuánto capital hay en mercadería, a costo, cuánto cambió y por qué.
//
// "Valor del Stock informa; los otros módulos muestran el detalle" (Emanuel,
// 2026-10-01): la pantalla NO muestra productos. Para investigar, cada causa
// lleva al módulo dueño. La API de la lista de productos sigue existiendo.
//
//   0. SOLO un admin en vista global: la ubicación → `SunmiSelectAdv`, con las
//      ubicaciones que manda el servidor (las del grupo activo). Queda en la URL
//      como `localId`. Un usuario con local no lo ve: mira la suya.
//   1. Día / Semana / Mes / Año / Otro → `ChipsDePeriodo` con `conAnio`.
//   2. Otro: desde y hasta            → `SunmiDateRangePicker`, como dice la pieza.
//   3. el período, con sus flechas    → `NavegadorDePeriodo`.
//   4. el capital                     → `CapitalEnMercaderia`, con el gráfico de
//      la evolución adentro.
//   5. ¿Por qué cambió?               → `PorQueCambio`: una fila por causa, con
//      su barra, que juntas suman el cambio.
//   6. lo que hay que mirar           → `AtencionDelValor`, solo si hay algo.
//
// Fuera de historia no hay 4 a 6: hay un bloque que dice desde cuándo existe el
// registro, y que antes no hay datos —no que el stock era cero—. Sin costos
// históricos (antes del 30/09 en producción) tampoco: se dice por qué.
//
// Es de SOLO LECTURA: ningún control de esta pantalla escribe nada.
//
// ── EL SERVIDOR DECIDE EL PERÍODO ────────────────────────────────────────
//
// La semana es la de Semana Operativa de la ubicación, y la arma el servidor.
// Las flechas navegan con las puntas que devuelve (`contextoAnterior`,
// `contextoSiguiente`): la pantalla no calcula ninguna semana.
//
// ── TODO VIVE EN LA URL ──────────────────────────────────────────────────
//
// Unidad, fecha y el rango de Otro: recargar o compartir el enlace muestra el
// mismo período. La búsqueda no viaja, como en las demás pantallas.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { CODIGO_FALTA_UBICACION } from "@/lib/stock/libro/stockDiarioApi";
import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import ChipsDePeriodo, { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { ESTADO_DEL_DIA } from "@/lib/stock/libro/stockDiario";
import {
  consultaDelResumen,
  contextoAnterior,
  contextoSiguiente,
  opcionesDeUbicacion,
  parseContextoStockDiario,
  puedeAvanzar,
  puedeRetroceder,
  textoFueraDeHistoria,
  textoSinValor,
  textosDelCapital,
  textosDelNavegador,
  urlDeStockDiario,
} from "@/lib/stock/libro/stockDiarioPantalla";

import AtencionDelValor from "./AtencionDelValor";
import CapitalEnMercaderia from "./CapitalEnMercaderia";
import PorQueCambio from "./PorQueCambio";

async function pedir(ruta, consulta) {
  const res = await fetch(`/api/stock_locales/diario/${ruta}?${consulta}`, { cache: "no-store", credentials: "include" });
  const j = await res.json().catch(() => ({}));
  // El caso malo tiene rama propia: un error no se dibuja como un período vacío.
  // Lleva el código y la lista de ubicaciones: el 400 FALTA_UBICACION del admin
  // en vista global no es un error que mostrar sino una pregunta que hacer.
  if (!res.ok || !j.ok) {
    const e = new Error(j?.error || "No se pudo leer el Valor del Stock.");
    e.codigo = j?.codigo ?? null;
    e.ubicaciones = j?.ubicaciones ?? null;
    throw e;
  }
  return j;
}

export default function PantallaStockDiario() {
  const router = useRouter();
  const params = useSearchParams();
  const ctx = parseContextoStockDiario(params);
  const consultaResumen = consultaDelResumen(ctx);

  const [respuesta, setRespuesta] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  // Admin en vista global sin ubicación elegida: las que puede elegir, o null.
  const [faltaUbicacion, setFaltaUbicacion] = useState(null);
  const [rango, setRango] = useState({ desde: ctx.desde || "", hasta: ctx.hasta || "" });

  const ir = (siguiente) => router.replace(urlDeStockDiario({ ...ctx, ...siguiente }), { scroll: false });

  // El resumen: uno por período.
  useEffect(() => {
    if (!consultaResumen) {
      setRespuesta(null);
      return undefined;
    }
    let vigente = true;
    setCargando(true);
    setError("");
    setFaltaUbicacion(null);
    pedir("resumen", consultaResumen)
      .then((r) => vigente && setRespuesta(r))
      .catch((e) => {
        if (!vigente) return;
        if (e.codigo === CODIGO_FALTA_UBICACION) setFaltaUbicacion(e.ubicaciones ?? []);
        else setError(e.message);
        setRespuesta(null);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [consultaResumen]);

  const fuera = respuesta?.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA;
  const navegador = respuesta ? textosDelNavegador(respuesta) : null;
  const hoy = respuesta?.hoy || hoyArgentinaISO();
  const opcionesUbicacion = opcionesDeUbicacion(respuesta?.ubicaciones ?? faltaUbicacion);

  return (
    <>
      {opcionesUbicacion && (
        <SunmiSelectAdv
          value={ctx.localId ? String(ctx.localId) : ""}
          onChange={(v) => ir({ localId: v ? Number(v) : null })}
          placeholder="Elegí la ubicación"
          aria-label="Ubicación"
        >
          {opcionesUbicacion.map((o) => (
            <SunmiSelectOption key={o.valor} value={o.valor}>
              {o.texto}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      )}

      {faltaUbicacion && !cargando && (
        <SunmiAviso tono="neutral" titulo="Elegí la ubicación">
          {faltaUbicacion.length
            ? "Estás en la vista global: el valor del stock es de una ubicación. Elegila arriba."
            : "Estás en la vista global y no hay ubicaciones en el grupo activo."}
        </SunmiAviso>
      )}

      <ChipsDePeriodo
        conAnio
        valor={ctx.unidad}
        onCambiar={(u) => (u === CLAVE_OTRO ? ir({ unidad: u, desde: null, hasta: null }) : ir({ unidad: u }))}
      />

      {ctx.unidad === CLAVE_OTRO && (
        <SunmiDateRangePicker
          valueDesde={rango.desde}
          valueHasta={rango.hasta}
          onChangeDesde={(d) => setRango((x) => ({ ...x, desde: d }))}
          onChangeHasta={(h) => setRango((x) => ({ ...x, hasta: h }))}
          onApply={(d, h) => ir({ desde: d, hasta: h })}
          placeholder="Elegí desde y hasta"
          maxDate={hoy}
        />
      )}

      {navegador && (
        <NavegadorDePeriodo
          titulo={navegador.titulo}
          subtitulo={navegador.subtitulo}
          puedeAvanzar={puedeAvanzar(ctx, respuesta)}
          puedeRetroceder={puedeRetroceder(ctx, respuesta)}
          onAtras={() => ir(contextoAnterior(ctx, respuesta))}
          onAdelante={() => ir(contextoSiguiente(ctx, respuesta))}
        />
      )}

      {!consultaResumen && (
        <SunmiAviso tono="neutral" titulo="Elegí el período">
          Marcá desde y hasta en el calendario para ver el valor del stock de esos días.
        </SunmiAviso>
      )}

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <SunmiAviso tono="danger" titulo="No se pudo cargar">
          {error}
        </SunmiAviso>
      )}

      {respuesta && !cargando && fuera && <FueraDeHistoria respuesta={respuesta} />}

      {respuesta && !cargando && !fuera &&
        (textosDelCapital(respuesta) ? (
          <>
            <CapitalEnMercaderia respuesta={respuesta} />
            <PorQueCambio respuesta={respuesta} ctx={ctx} />
            <AtencionDelValor respuesta={respuesta} />
          </>
        ) : (
          <SinValor respuesta={respuesta} />
        ))}
    </>
  );
}

/** Sin costos históricos para el período: se dice por qué, en vez de mostrar $0. */
function SinValor({ respuesta }) {
  const t = textoSinValor(respuesta);
  return <ResumenConImporte rotulo="Valor del stock" importe={<span className="text-base2">{t.titulo}</span>} subtitulo={null} nota={t.detalle} />;
}

/** Antes del punto cero: no hay números, y se dice por qué en vez de mostrar ceros. */
function FueraDeHistoria({ respuesta }) {
  const t = textoFueraDeHistoria(respuesta);
  return (
    <ResumenConImporte
      rotulo="Stock del período"
      importe={<span className="text-base2">{t.titulo}</span>}
      subtitulo={null}
      nota={t.detalle}
    />
  );
}
