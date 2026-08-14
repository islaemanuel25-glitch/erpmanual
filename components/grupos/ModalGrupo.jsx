"use client";

import { useEffect, useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

import SunmiListCard from "@/components/sunmi/SunmiListCard";
import SunmiListCardItem from "@/components/sunmi/SunmiListCardItem";
import SunmiListCardRemove from "@/components/sunmi/SunmiListCardRemove";

export default function ModalGrupo({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
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
    <SunmiModalLayout
      open
      title={editMode ? "Editar grupo" : "Nuevo grupo"}
      onClose={onClose}
      // El velo NO cierra: es un formulario de alta y edición con nombre, locales
      // y depósitos cargados, y un toque al costado tira todo eso.
      destructivo
      z={50}
      // NO se declara `maxWidth`: su tarjeta ya era `max-w-xl`, que es el default
      // del kit. Y NO lleva `altoVa`: su tarjeta no estaba topada —`max-height:
      // none` medido— y el tope vivía en el cuerpo, que es exactamente lo que
      // hace `centrado`. Es la primera migrada que no necesita el séptimo
      // parámetro.
      //
      // `pr-1` sí se declara: son 3,5 px a la derecha que existen para que la
      // barra de scroll no se coma el borde de los campos, y el kit no los trae.
      espacioCuerpo="mt-2 gap-3 pr-1"
      footer={
        <>
          <SunmiButton color="slate" onClick={onClose}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="amber" onClick={handleSubmit}>
            {editMode ? "Guardar cambios" : "Crear grupo"}
          </SunmiButton>
        </>
      }
    >
          {/* El subtítulo va escrito a mano y no por `subtitle`: la pieza no
              reenvía ese prop a propósito. Pierde su `-mt-1 mb-2`, que eran
              relativos al encabezado viejo: ahora lo separa el `gap-3` del
              cuerpo. */}
          <p className="text-[11px] sunmi-text-muted">
            Configurá el grupo y sus asignaciones.
          </p>

            {/* Datos */}
            <Field label="Nombre del grupo *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
                placeholder="Ej: Grupo Centro"
              />
            </Field>

            {/* LOCALES */}
            <SunmiSeparator label="Locales" />

            <div>
              <label className="text-[11px] sunmi-label mb-1 block">
                Agregar local
              </label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
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
                </div>
                <SunmiButton color="amber" onClick={agregarLocal}>
                  Agregar
                </SunmiButton>
              </div>
            </div>

            {localesSeleccionados.length === 0 ? (
              <div className="py-3 text-center sunmi-text-muted text-[11px] border sunmi-divider rounded-md">
                No hay locales asignados.
              </div>
            ) : (
              <SunmiListCard compact>
                {localesSeleccionados.map((l) => (
                  <SunmiListCardItem key={l.id}>
                    <span className="text-sm sunmi-text-strong">{l.nombre}</span>
                    <SunmiListCardRemove compact onClick={() => quitarLocal(l.id)} />
                  </SunmiListCardItem>
                ))}
              </SunmiListCard>
            )}

            {/* DEPÓSITOS */}
            <SunmiSeparator label="Depósitos" />

            <div>
              <label className="text-[11px] sunmi-label mb-1 block">
                Agregar depósito
              </label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
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
                </div>
                <SunmiButton color="amber" onClick={agregarDeposito}>
                  Agregar
                </SunmiButton>
              </div>
            </div>

            {depositosSeleccionados.length === 0 ? (
              <div className="py-3 text-center sunmi-text-muted text-[11px] border sunmi-divider rounded-md">
                No hay depósitos asignados.
              </div>
            ) : (
              <SunmiListCard compact>
                {depositosSeleccionados.map((d) => (
                  <SunmiListCardItem key={d.id}>
                    <span className="text-sm sunmi-text-strong">{d.nombre}</span>
                    <SunmiListCardRemove compact onClick={() => quitarDeposito(d.id)} />
                  </SunmiListCardItem>
                ))}
              </SunmiListCard>
            )}
    </SunmiModalLayout>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] sunmi-label">{label}</label>
      {children}
    </div>
  );
}
