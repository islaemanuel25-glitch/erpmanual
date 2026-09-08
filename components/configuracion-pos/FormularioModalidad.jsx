"use client";

import { useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import {
  cuerpoParaGuardarModalidad,
  estadoInicialDeModalidad,
  textoComisionDeModalidad,
  TEXTO_COMISION_SIN_CONFIGURAR,
} from "@/lib/pos-ventas/modalidadesPantalla";
import { alEnfocarNumero, alEscribirNumero } from "@/lib/formularios/escrituraNumerica";

// CREAR O EDITAR UNA MODALIDAD. Un solo formulario para las dos cosas.
//
// Mismo criterio que `FormularioMedio`: las dos pantallas del diseño son la
// misma, y escribirlas por separado sería garantizar que dentro de dos meses una
// tenga un campo que la otra no.
//
// ── LO QUE ESTE FORMULARIO NO PIDE ─────────────────────────────────────────
//
// El PROCESADOR. Una modalidad no lo tiene: lo aporta el medio padre. Pedirlo
// acá crearía dos fuentes para el mismo hecho, y el día que difieran no habría
// forma de saber cuál manda.
//
// ── LA COMISIÓN NO SE HEREDA, Y ESO CAMBIA LO QUE DICE LA PANTALLA ─────────
//
// En un MEDIO, el campo vacío significa "heredá la del grupo", y el formulario
// lo dice con esas palabras. En una MODALIDAD significa SIN CONFIGURAR, que no
// es lo mismo.
//
// El motivo está en `modalidadesDeMedio.js`: `ConfiguracionGrupo` tiene tres
// columnas POR TIPO CONTABLE, así que una modalidad "Crédito" de Mercado Pago
// heredaría lo que cobra el posnet bancario. Cualquier herencia disponible hoy
// devuelve un número ajeno, y un número ajeno presentado como medición es el
// defecto que este proyecto ya pagó una vez.
//
// Por eso acá NO aparece la palabra "Heredada" en ningún lado, la marca de agua
// dice "Sin configurar", y se explica qué pasa mientras tanto: la venta queda
// con la comisión pendiente. Un 0 escrito es otra cosa —alguien decidió que no
// cobra comisión— y se muestra como tal. `null !== 0`.

const BAJADA = {
  editar: "Configurá cómo se cobra con esta modalidad.",
  alta: "Creá una modalidad para este medio de cobro.",
};

export default function FormularioModalidad({
  modo = "editar",
  medio = null,
  modalidad = null,
  tiposContables = [],
  ordenSugerido = 1,
  alVolver = () => {},
  alGuardar = null,
}) {
  const esAlta = modo === "alta";

  const [form, setForm] = useState(() =>
    estadoInicialDeModalidad(modalidad, { ordenSugerido, tipoDelPadre: medio?.tipoContable ?? "" })
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  // La navegación la decide la PANTALLA, no la pieza: así esto se puede montar en
  // un candado sin un router. Es el mismo motivo por el que `FormularioMedio` lo
  // hace igual, y viene de dos defectos que solo aparecen ejecutando el JSX.
  const volver = alVolver;

  const guardar = async () => {
    setGuardando(true);
    setError(null);

    const cuerpo = cuerpoParaGuardarModalidad(form);
    const baseUrl = `/api/medios-cobro/${encodeURIComponent(medio?.claveEdicion ?? "")}/modalidades`;

    try {
      const res = await fetch(esAlta ? baseUrl : `${baseUrl}/${modalidad.id}`, {
        method: esAlta ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();

      if (data.ok) {
        if (alGuardar) alGuardar(data);
        volver();
        return;
      }

      // El mensaje del backend se muestra TAL CUAL. El que importa acá es el de
      // "esa modalidad ya no existe", que pasa cuando otra sesión la borró
      // mientras esta pantalla estaba abierta: reemplazarlo por "No se pudo
      // guardar" le quitaría a la persona lo único que le dice qué hacer.
      setError(data.error || "No se pudo guardar la modalidad.");
    } catch {
      setError("No se pudo conectar para guardar la modalidad.");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/medios-cobro/${encodeURIComponent(medio?.claveEdicion ?? "")}/modalidades/${modalidad.id}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) {
        if (alGuardar) alGuardar(data);
        volver();
        return;
      }
      setError(data.error || "No se pudo borrar la modalidad.");
    } catch {
      setError("No se pudo conectar para borrar la modalidad.");
    } finally {
      setGuardando(false);
    }
  };

  const sinComision = form.comisionPct === "";

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-xs sunmi-text-muted mb-4 px-1">{BAJADA[modo] ?? BAJADA.editar}</p>

      <Seccion titulo="GENERAL">
        <SunmiListItem
          label="Visible en el POS"
          description="Apaga o muestra esta opción al cajero."
          right={<SunmiToggle value={form.activo} onChange={(v) => set("activo", v)} />}
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Nombre"
          description="Texto visible en el selector"
          right={
            <SunmiInput
              className="w-40 text-right"
              value={form.nombre}
              maxLength={40}
              placeholder={esAlta ? "Ej. Crédito 3 cuotas" : undefined}
              onChange={(e) => set("nombre", e.target.value)}
            />
          }
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Orden"
          description="Posición en el selector"
          right={
            <SunmiInput
              className="w-16 text-right"
              type="number"
              inputMode="numeric"
              value={form.orden}
              onChange={(e) => set("orden", e.target.value)}
            />
          }
        />
      </Seccion>

      <Seccion titulo="CONDICIÓN COMERCIAL">
        <SunmiListItem
          label="Recargo al cliente"
          description="Aumenta el total"
          right={
            <>
              <SunmiInput
                className="w-24 text-right"
                type="number"
                inputMode="decimal"
                value={form.recargoPct}
                // Escribir o pegar sobre un campo que muestra 0 reemplaza ese
                // cero en vez de sumarle el texto al lado. Se le pasa el EVENTO
                // entero, no el valor: teclear `1` sobre `0` y pegar `"10"` sobre
                // `0` pueden dejar el mismo texto y tienen que terminar distinto.
                // La medición del navegador está en `escrituraNumerica.js`.
                onChange={(e) => set("recargoPct", alEscribirNumero(form.recargoPct, e))}
                // Al entrar, un 0 queda resaltado: así se ve de antemano que lo
                // que se escriba lo reemplaza.
                onFocus={alEnfocarNumero}
              />
              <span className="text-xs sunmi-text-muted">%</span>
            </>
          }
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Comisión / costo"
          description={modalidad ? textoComisionDeModalidad(modalidad) : "Sin configurar hasta que la cargues"}
          right={
            <>
              {/* LA MARCA DE AGUA DICE "SIN CONFIGURAR", NUNCA UN NÚMERO NI
                  "HEREDADA". Un porcentaje gris en la caja se lee igual que uno
                  cargado, y "Heredada" sería directamente falso: una modalidad no
                  hereda de ningún lado. */}
              <SunmiInput
                className="w-24 text-right"
                type="number"
                inputMode="decimal"
                value={form.comisionPct}
                placeholder={TEXTO_COMISION_SIN_CONFIGURAR}
                onChange={(e) => set("comisionPct", alEscribirNumero(form.comisionPct, e))}
                onFocus={alEnfocarNumero}
              />
              <span className="text-xs sunmi-text-muted">%</span>
            </>
          }
        />
        <p className="text-sm2 sunmi-text-muted px-1">
          {sinComision
            ? "Sin comisión configurada: las ventas con esta modalidad quedan con la comisión pendiente hasta que se cargue."
            : "Escribí 0 si esta modalidad no cobra comisión. Vaciá el campo para dejarla sin configurar."}
        </p>
      </Seccion>

      <Seccion titulo="CLASIFICACIÓN">
        <SunmiListItem
          label="Tipo contable"
          description="Caja y reportes"
          right={
            <SunmiSelectAdv
              className="w-40"
              value={form.tipoContable}
              onChange={(v) => set("tipoContable", v)}
              placeholder="Elegir"
            >
              {tiposContables.map((t) => (
                <SunmiSelectOption key={t.valor} value={t.valor}>
                  {t.label}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          }
        />
        <SunmiSeparator />
        {/* El procesador NO se pide: es del padre. Se muestra para que quede
            claro por dónde va a pasar la plata de esta modalidad. */}
        <SunmiListItem
          label="Procesador"
          description="Lo aporta el medio"
          right={<span className="text-xs sunmi-text-muted">{medio?.nombre ?? "—"}</span>}
        />
      </Seccion>

      <p className="text-sm2 sunmi-text-muted mt-3 px-1">
        El recargo lo paga el cliente y sube el total; la comisión la paga el comercio y baja el neto.
        Con modalidades activas, los dos salen de acá y no de los campos del medio.
      </p>

      {error && <SunmiCard className="p-3 mt-3 text-xs sunmi-text-danger">{error}</SunmiCard>}

      <div className="flex gap-3 mt-4">
        <SunmiButton color="secondary" className="flex-1" onClick={volver} disabled={guardando}>
          Cancelar
        </SunmiButton>
        <SunmiButton color="primary" className="flex-1" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : esAlta ? "Crear modalidad" : "Guardar cambios"}
        </SunmiButton>
      </div>

      {!esAlta && (
        <div className="mt-3">
          {/* `red` y no "danger": los colores válidos están enumerados en
              `SunmiButton.COLORES` y uno desconocido cae en `slate`, o sea que un
              botón de borrar se dibujaría igual que uno neutro. */}
          <SunmiButton color="red" className="w-full" onClick={borrar} disabled={guardando}>
            Eliminar modalidad
          </SunmiButton>
          <p className="text-sm2 sunmi-text-muted mt-2 px-1">
            Las ventas ya cobradas con esta modalidad no se tocan: conservan el nombre y el
            porcentaje con los que se cobraron.
          </p>
        </div>
      )}
    </div>
  );
}

/** Un título de sección y su tarjeta. Igual que en `FormularioMedio`. */
function Seccion({ titulo, children }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm2 sunmi-section-title mb-2 px-1">{titulo}</h2>
      <SunmiCard className="p-3 flex flex-col">{children}</SunmiCard>
    </div>
  );
}
