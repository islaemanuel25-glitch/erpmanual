"use client";

import { useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import {
  aplicarCambioDeTipo,
  cuerpoParaGuardar,
  estadoInicialDeMedio,
  formatearPct,
  textoOrigenComision,
  SIN_PROCESADOR,
} from "@/lib/pos-ventas/mediosCobroPantalla";
import { alEnfocarNumero, alEscribirNumero } from "@/lib/formularios/escrituraNumerica";

// EDITAR O CREAR UN MEDIO DE COBRO. Un solo formulario para las dos cosas.
//
// Las pantallas de "Editar medio" y "Agregar medio" del diseño son la misma:
// mismas cuatro secciones, mismas filas, mismo pie. Escribirlas por separado
// sería garantizar que dentro de dos meses una tenga un campo que la otra no.
//
// ── UN SOLO "GUARDAR" Y UN SOLO PEDIDO ─────────────────────────────────────
//
// El recargo se manda junto con el resto. NO se hace un segundo pedido a la ruta
// de recargos: el backend es una fachada transaccional y guarda las dos cosas o
// ninguna. Si acá se hicieran dos pedidos, uno podría entrar y el otro fallar, y
// el local quedaría con el medio renombrado y el recargo viejo.
//
// ── EL RECARGO ES DEL TIPO CONTABLE, NO DEL BOTÓN ──────────────────────────
//
// Por eso al cambiar el tipo, el campo de recargo se REEMPLAZA por el del tipo
// nuevo, que viene en `recargosPorTipo`. Sin eso, alguien que cambia un medio de
// débito a crédito y aprieta Guardar le escribiría al crédito el porcentaje que
// tenía cargado el débito, sin haberlo pedido nunca.
//
// ── null NO ES 0 ───────────────────────────────────────────────────────────
//
// El campo de comisión vacío significa "heredá la del grupo" y se manda como
// null. Un 0 escrito significa "en este local no se cobra comisión" y se manda
// como 0. Son dos estados distintos y el backend los distingue: convertir uno en
// el otro haría que el local deje de seguir la comisión contratada sin que nadie
// lo haya decidido.

export default function FormularioMedio({
  modo = "editar",
  medio = null,
  tiposContables = [],
  procesadores = [],
  recargosPorTipo = {},
  ordenSugerido = 1,
  subtitulo = "",
  alVolver = () => {},
}) {
  const esAlta = modo === "alta";

  const [form, setForm] = useState(() => estadoInicialDeMedio(medio, { ordenSugerido }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));
  const cambiarTipo = (nuevoTipo) => setForm((p) => aplicarCambioDeTipo(p, nuevoTipo, recargosPorTipo));

  // La navegación la decide la PANTALLA, no la pieza. Así esto se puede montar en
  // un candado sin un router: los dos defectos que el proyecto se comió en
  // producción —un identificador sin importar, un `SunmiInput` sin importar—
  // solo aparecen ejecutando el JSX, y no se puede ejecutar lo que exige estar
  // adentro de una app.
  const volver = alVolver;

  const guardar = async () => {
    setGuardando(true);
    setError(null);

    const cuerpo = cuerpoParaGuardar(form);

    try {
      const res = await fetch(
        esAlta
          ? "/api/medios-cobro"
          : `/api/medios-cobro/${encodeURIComponent(medio.claveEdicion)}`,
        {
          method: esAlta ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(cuerpo),
        }
      );
      const data = await res.json();

      if (data.ok) {
        volver();
        return;
      }

      // El mensaje del backend se muestra TAL CUAL. Los que importan —dos medios
      // activos del mismo tipo, quedarse sin ningún medio activo— explican qué
      // pasaría en la caja, y reemplazarlos por "No se pudo guardar" sería
      // quitarle a la persona lo único que le dice cómo arreglarlo.
      setError(data.error || "No se pudo guardar el medio de cobro.");
    } catch {
      setError("No se pudo conectar para guardar el medio de cobro.");
    } finally {
      setGuardando(false);
    }
  };

  const comisionHeredada = form.comisionPct === "";
  const pctHeredado = medio?.comisionHeredada ? medio?.comisionPct : null;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title={esAlta ? "Agregar medio de cobro" : medio?.nombre || "Medio de cobro"}
        subtitle={subtitulo}
      />

      <Seccion titulo="GENERAL">
        <SunmiListItem
          label="Visible en el POS"
          description="Apaga o muestra este botón al cajero."
          right={<SunmiToggle value={form.activo} onChange={(v) => set("activo", v)} />}
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Nombre en el POS"
          description="Texto visible"
          right={
            <SunmiInput
              className="w-40 text-right"
              value={form.nombre}
              maxLength={40}
              placeholder={esAlta ? "Ej. MP Débito" : undefined}
              onChange={(e) => set("nombre", e.target.value)}
            />
          }
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Orden"
          description="Posición del botón"
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
                // entero, no el valor: la decisión necesita saber qué operación
                // ocurrió, porque teclear `1` sobre `0` y pegar `"10"` sobre `0`
                // pueden dejar el mismo texto y tienen que terminar distinto.
                // La medición del navegador está en `escrituraNumerica.js`.
                onChange={(e) => set("recargoPct", alEscribirNumero(form.recargoPct, e))}
                // Al entrar, un 0 queda resaltado: así se ve de antemano que lo
                // que se escriba lo reemplaza. Con cualquier otro valor no hace
                // nada, para no borrarle los dígitos a quien entra a corregir.
                onFocus={alEnfocarNumero}
              />
              <span className="text-xs sunmi-text-muted">%</span>
            </>
          }
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Comisión / costo"
          description={medio ? textoOrigenComision(medio) : "Heredada del grupo · editable"}
          right={
            <>
              {/* ── LA MARCA DE AGUA DICE "HEREDADA", NUNCA EL NÚMERO ──────
                  La primera versión ponía el porcentaje del grupo de marca de
                  agua. Al mirar la captura se vio el problema: un "5" gris en la
                  caja se lee igual que un 5 cargado, y entonces el campo que
                  significa "no hay nada decidido acá" parecía tener un valor.
                  El número no se pierde: está en el renglón de abajo, dicho como
                  lo que es. Y el ancho subió a w-24 porque en w-16 la palabra
                  salía cortada —"Hered.."— a los tres anchos. */}
              <SunmiInput
                className="w-24 text-right"
                type="number"
                inputMode="decimal"
                value={form.comisionPct}
                placeholder="Heredada"
                // Mismo trato que el recargo, y con el mismo cuidado: la regla
                // no toca el campo VACÍO, que acá significa "heredá la del
                // grupo" y no es lo mismo que un cero.
                onChange={(e) => set("comisionPct", alEscribirNumero(form.comisionPct, e))}
                // Mismo trato, y con el mismo cuidado: un campo vacío —el que
                // hereda la comisión del grupo— no es un "0", así que no se
                // selecciona nada y no aparece ningún cero inventado.
                onFocus={alEnfocarNumero}
              />
              <span className="text-xs sunmi-text-muted">%</span>
            </>
          }
        />
        {/* Cómo se vuelve a heredar, dicho con palabras. Vaciar el campo es la
            acción, y sin esta línea sería un truco que hay que adivinar. */}
        <p className="text-[11px] sunmi-text-muted px-1">
          {comisionHeredada
            ? `Sin valor propio: este medio usa la comisión del grupo${
                pctHeredado != null ? ` (${formatearPct(pctHeredado)})` : ""
              }.`
            : "Vaciá el campo para volver a usar la comisión del grupo."}
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
              onChange={cambiarTipo}
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
        <SunmiListItem
          label="Procesador"
          description="Integraciones"
          right={
            <SunmiSelectAdv
              className="w-40"
              value={form.procesador}
              onChange={(v) => set("procesador", v)}
              placeholder="Elegir"
            >
              <SunmiSelectOption value={SIN_PROCESADOR}>Sin procesador</SunmiSelectOption>
              {procesadores.map((p) => (
                <SunmiSelectOption key={p.valor} value={p.valor}>
                  {p.label}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          }
        />
      </Seccion>

      <Seccion titulo="INTEGRACIÓN">
        {/* Nada de acá está conectado todavía: se muestra el estado real, que es
            que el cobro se registra a mano. No hay OAuth, ni webhooks, ni
            conciliación, y decir otra cosa sería prometer algo que no existe. */}
        <SunmiListItem
          label="Transacciones"
          description="Cobro manual hoy"
          right={
            <span className="text-xs sunmi-text-muted">{esAlta ? "Sin configurar" : "No conectado"}</span>
          }
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Conciliación automática"
          description="Disponible al conectar el procesador"
          right={<SunmiToggle value={false} disabled />}
        />
      </Seccion>

      <p className="text-[11px] sunmi-text-muted mt-3 px-1">
        El recargo y la comisión siguen siendo datos distintos aunque pertenezcan al mismo medio: el
        recargo lo paga el cliente y sube el total; la comisión la paga el comercio y baja el neto.
      </p>

      {error && (
        <SunmiCard className="p-3 mt-3 text-xs sunmi-text-danger">{error}</SunmiCard>
      )}

      <div className="flex gap-3 mt-4">
        <SunmiButton color="secondary" className="flex-1" onClick={volver} disabled={guardando}>
          Cancelar
        </SunmiButton>
        <SunmiButton color="primary" className="flex-1" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : esAlta ? "Crear medio" : "Guardar cambios"}
        </SunmiButton>
      </div>
    </div>
  );
}

/** Un título de sección y su tarjeta. Las cuatro del diseño son iguales. */
function Seccion({ titulo, children }) {
  return (
    <div className="mb-4">
      <h2 className="text-[11px] sunmi-section-title mb-2 px-1">{titulo}</h2>
      <SunmiCard className="p-3 flex flex-col">{children}</SunmiCard>
    </div>
  );
}
