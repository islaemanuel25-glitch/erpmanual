"use client";

import { useEffect, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

import SunmiListCard from "@/components/sunmi/SunmiListCard";
import SunmiListCardItem from "@/components/sunmi/SunmiListCardItem";
import SunmiListCardRemove from "@/components/sunmi/SunmiListCardRemove";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ModalGrupo({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const { ui } = useUIConfig();
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({ nombre: "" });

  const [locales, setLocales] = useState([]);
  const [depositos, setDepositos] = useState([]);

  const [localesSeleccionados, setLocalesSeleccionados] = useState([]);
  const [depositosSeleccionados, setDepositosSeleccionados] = useState([]);

  const [localSeleccionado, setLocalSeleccionado] = useState("");
  const [depositoSeleccionado, setDepositoSeleccionado] = useState("");

  // Cargar datos iniciales
  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      setForm({ nombre: "" });
      setLocalesSeleccionados([]);
      setDepositosSeleccionados([]);
      setLocalSeleccionado("");
      setDepositoSeleccionado("");
      return;
    }

    setForm({ nombre: initialData.nombre || "" });

    setLocalesSeleccionados(
      (initialData.localesGrupo || []).map((lg) => ({
        id: lg.local.id,
        nombre: lg.local.nombre,
      }))
    );

    setDepositosSeleccionados(
      (initialData.locales || []).map((d) => ({
        id: d.localId,
        nombre: d.local.nombre,
      }))
    );

    setLocalSeleccionado("");
    setDepositoSeleccionado("");
  }, [open, initialData]);

  // Cargar listas (locales y depósitos)
  useEffect(() => {
    if (!open) return;

    const loadLocales = async () => {
      try {
        const res = await fetch("/api/locales/listar?soloLocales=true", {
          credentials: "include",
        });
        const data = await res.json();
        setLocales(data.items || []);
      } catch {
        setLocales([]);
      }
    };

    const loadDepositos = async () => {
      try {
        const res = await fetch("/api/locales/listar?soloDepositos=true", {
          credentials: "include",
        });
        const data = await res.json();
        setDepositos(data.items || []);
      } catch {
        setDepositos([]);
      }
    };

    loadLocales();
    loadDepositos();
  }, [open]);

  // Acciones locales y depósitos
  const agregarLocal = () => {
    if (!localSeleccionado) return;
    const local = locales.find((l) => l.id === Number(localSeleccionado));
    if (!local) return;

    setLocalesSeleccionados((prev) => [
      ...prev,
      { id: local.id, nombre: local.nombre },
    ]);

    setLocalSeleccionado("");
  };

  const quitarLocal = (id) => {
    setLocalesSeleccionados((prev) => prev.filter((l) => l.id !== id));
  };

  const agregarDeposito = () => {
    if (!depositoSeleccionado) return;
    const dep = depositos.find((d) => d.id === Number(depositoSeleccionado));
    if (!dep) return;

    setDepositosSeleccionados((prev) => [
      ...prev,
      { id: dep.id, nombre: dep.nombre },
    ]);

    setDepositoSeleccionado("");
  };

  const quitarDeposito = (id) => {
    setDepositosSeleccionados((prev) => prev.filter((d) => d.id !== id));
  };

  const validar = () => {
    if (!form.nombre.trim()) return "Completá el nombre del grupo.";
    return null;
  };

  const handleSubmit = () => {
    const err = validar();
    if (err) return alert(err);

    onSubmit({
      nombre: form.nombre,
      localesIds: localesSeleccionados.map((l) => l.id),
      depositosIds: depositosSeleccionados.map((d) => d.id),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-full max-w-xl">
        <SunmiCard>
          <SunmiCardHeader
            title={editMode ? "Editar grupo" : "Nuevo grupo"}
            subtitle="Configurá el grupo y sus asignaciones"
            color="amber"
          />

          {/* CONTENIDO SCROLLEABLE */}
          <div
            className="flex flex-col overflow-y-auto"
            style={{
              maxHeight: "65vh",
            }}
          >

            {/* Datos */}
            <SunmiSeparator label="Datos" color="amber" />
            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
              />
            </Field>

            {/* LOCALES */}
            <SunmiSeparator label="Locales" color="amber" />

            <div
              className="flex"
              style={{
                gap: ui.helpers.spacing("sm"),
              }}
            >
              <SunmiSelectAdv
                value={localSeleccionado}
                onChange={setLocalSeleccionado}
              >
                <SunmiSelectOption value="">Seleccionar local…</SunmiSelectOption>
                {locales
                  .filter((l) => !localesSeleccionados.some((ls) => ls.id === l.id))
                  .map((l) => (
                    <SunmiSelectOption key={l.id} value={l.id}>
                      {l.nombre}
                    </SunmiSelectOption>
                  ))}
              </SunmiSelectAdv>

              <SunmiButton color="amber" onClick={agregarLocal}>
                Agregar
              </SunmiButton>
            </div>

            <SunmiListCard>
              {localesSeleccionados.length === 0 ? (
                <div className="flex justify-center">No hay locales asignados</div>
              ) : (
                localesSeleccionados.map((l) => (
                  <SunmiListCardItem key={l.id}>
                    <span>{l.nombre}</span>
                    <SunmiListCardRemove onClick={() => quitarLocal(l.id)} />
                  </SunmiListCardItem>
                ))
              )}
            </SunmiListCard>

            {/* DEPÓSITOS */}
            <SunmiSeparator label="Depósitos" color="amber" />

            <div
              className="flex"
              style={{
                gap: ui.helpers.spacing("sm"),
              }}
            >
              <SunmiSelectAdv
                value={depositoSeleccionado}
                onChange={setDepositoSeleccionado}
              >
                <SunmiSelectOption value="">Seleccionar depósito…</SunmiSelectOption>
                {depositos
                  .filter((d) => !depositosSeleccionados.some((ds) => ds.id === d.id))
                  .map((d) => (
                    <SunmiSelectOption key={d.id} value={d.id}>
                      {d.nombre}
                    </SunmiSelectOption>
                  ))}
              </SunmiSelectAdv>

              <SunmiButton color="amber" onClick={agregarDeposito}>
                Agregar
              </SunmiButton>
            </div>

            <SunmiListCard>
              {depositosSeleccionados.length === 0 ? (
                <div className="flex justify-center">No hay depósitos asignados</div>
              ) : (
                depositosSeleccionados.map((d) => (
                  <SunmiListCardItem key={d.id}>
                    <span>{d.nombre}</span>
                    <SunmiListCardRemove onClick={() => quitarDeposito(d.id)} />
                  </SunmiListCardItem>
                ))
              )}
            </SunmiListCard>
          </div>

          {/* ACCIONES */}
          <div
            className="flex justify-end"
            style={{
              gap: ui.helpers.spacing("sm"),
              marginTop: ui.helpers.spacing("sm"),
            }}
          >
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton color="amber" onClick={handleSubmit}>
              {editMode ? "Guardar cambios" : "Crear grupo"}
            </SunmiButton>
          </div>
        </SunmiCard>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  const { ui } = useUIConfig();
  return (
    <div
      className="flex flex-col"
      style={{
        gap: ui.helpers.spacing("xs"),
      }}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}
