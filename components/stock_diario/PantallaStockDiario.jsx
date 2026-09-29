"use client";

// components/stock_diario/PantallaStockDiario.jsx
//
// STOCK DIARIO, MÓVIL (Figma 300:478 y sus estados, 300:676).
//
// ── LA MISMA ESTRUCTURA QUE LAS PANTALLAS POR PERÍODO ────────────────────
//
//   1. Día / Semana / Mes / Otro      → `ChipsDePeriodo`.
//   2. Otro: desde y hasta            → `SunmiDateRangePicker`, como dice la pieza.
//   3. el período, con sus flechas    → `NavegadorDePeriodo`.
//   4. la actividad                   → `ResumenStockDiario` (`ResumenConImporte`).
//   5. el buscador                    → `SunmiCampoBusquedaVoz`.
//   6. los productos que se movieron  → `DiaConBanda` con `FilaStockDiario`.
//   7. más de una página              → `SunmiPaginador`.
//
// Fuera de historia no hay 4 a 7: hay un bloque que dice desde cuándo existe el
// registro, y que antes no hay datos —no que el stock era cero—.
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
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import ChipsDePeriodo, { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { ESTADO_DEL_DIA } from "@/lib/stock/libro/stockDiario";
import {
  ESPERA_BUSQUEDA_MS,
  consultaDeProductos,
  consultaDelResumen,
  contextoAnterior,
  contextoSiguiente,
  datoDeLaLista,
  parseContextoStockDiario,
  puedeAvanzar,
  puedeRetroceder,
  textoFueraDeHistoria,
  textosDelNavegador,
  urlDeStockDiario,
} from "@/lib/stock/libro/stockDiarioPantalla";

import FilaStockDiario from "./FilaStockDiario";
import ResumenStockDiario from "./ResumenStockDiario";

async function pedir(ruta, consulta) {
  const res = await fetch(`/api/stock_locales/diario/${ruta}?${consulta}`, { cache: "no-store", credentials: "include" });
  const j = await res.json().catch(() => ({}));
  // El caso malo tiene rama propia: un error no se dibuja como un período vacío.
  if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo leer el Stock Diario.");
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
  const [busqueda, setBusqueda] = useState("");
  const [termino, setTermino] = useState("");
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState(null);
  const [errorLista, setErrorLista] = useState("");
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
    pedir("resumen", consultaResumen)
      .then((r) => vigente && setRespuesta(r))
      .catch((e) => {
        if (!vigente) return;
        setError(e.message);
        setRespuesta(null);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [consultaResumen]);

  // Lo escrito pasa a buscarse un momento después de la última tecla.
  useEffect(() => {
    const espera = setTimeout(() => setTermino(busqueda.trim()), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(espera);
  }, [busqueda]);

  // Otro período u otra búsqueda: de vuelta a la primera página.
  useEffect(() => setPagina(1), [consultaResumen, termino]);

  const consultaLista = consultaDeProductos(ctx, { q: termino, page: pagina });
  const fuera = respuesta?.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA;

  // La lista: la página pedida, con la búsqueda hecha en el servidor.
  useEffect(() => {
    if (!consultaLista || !respuesta || fuera) {
      setLista(null);
      return undefined;
    }
    let vigente = true;
    // Una página de otro período no se muestra mientras llega la de éste.
    setLista(null);
    setErrorLista("");
    pedir("productos", consultaLista)
      .then((r) => vigente && setLista(r))
      .catch((e) => {
        if (!vigente) return;
        setErrorLista(e.message);
        setLista(null);
      });
    return () => {
      vigente = false;
    };
  }, [consultaLista, respuesta, fuera]);

  const navegador = respuesta ? textosDelNavegador(respuesta) : null;
  const hoy = respuesta?.hoy || hoyArgentinaISO();

  return (
    <>
      <ChipsDePeriodo
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
          Marcá desde y hasta en el calendario para ver el Stock Diario de esos días.
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

      {respuesta && !cargando && !fuera && (
        <>
          <ResumenStockDiario respuesta={respuesta} />

          <SunmiCampoBusquedaVoz
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar producto o código"
            ariaLabel="Buscar producto o código"
          />

          {errorLista && (
            <SunmiAviso tono="danger" titulo="No se pudo cargar la lista">
              {errorLista}
            </SunmiAviso>
          )}

          {!lista && !errorLista && (
            <div className="py-12">
              <SunmiLoader />
            </div>
          )}

          {lista && (
            <DiaConBanda titulo="Productos" dato={datoDeLaLista(lista.total, respuesta)}>
              {lista.items.length === 0 ? (
                <div className="text-center py-12 sunmi-text-muted text-xs">
                  {termino ? "Ningún producto coincide con la búsqueda." : "Ningún producto se movió en este período."}
                </div>
              ) : (
                lista.items.map((item) => <FilaStockDiario key={item.productoLocalId} item={item} respuesta={respuesta} />)
              )}
            </DiaConBanda>
          )}

          {lista && lista.totalPages > 1 && (
            <SunmiPaginador
              page={lista.page}
              pageSize={lista.pageSize}
              totalPages={lista.totalPages}
              totalItems={lista.total}
              onPrev={() => setPagina((p) => Math.max(1, p - 1))}
              onNext={() => setPagina((p) => Math.min(lista.totalPages, p + 1))}
              onGoToPage={(p) => setPagina(p)}
            />
          )}
        </>
      )}
    </>
  );
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
