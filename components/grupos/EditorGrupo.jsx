// components/grupos/EditorGrupo.jsx
};
const quitarDeposito = async (id) => {
await apiRemoveDepositoFromGrupo(grupoId, id);
await load();
};


const agregarLocal = async (id) => {
await apiAddLocalToGrupo(grupoId, id);
await load();
};
const quitarLocal = async (id) => {
await apiRemoveLocalFromGrupo(grupoId, id);
await load();
};


if (loading) return <div className="text-sm text-gray-500">Cargando…</div>;


return (
<div className="space-y-8">
<section className="space-y-3">
<h2 className="text-lg font-semibold">Datos del grupo</h2>
<form onSubmit={saveNombre} className="flex gap-2 max-w-xl">
<input
className="flex-1 border rounded-lg px-3 py-2"
value={nombre}
onChange={(e) => setNombre(e.target.value)}
placeholder="Nombre del grupo"
/>
<button disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white">
{saving ? 'Guardando…' : 'Guardar'}
</button>
</form>
</section>


<section className="space-y-3">
<div className="flex items-center justify-between">
<h3 className="font-semibold">Depósitos del grupo</h3>
<SelectAgregarDeposito
opciones={(allDepositos || []).filter(d => !(depositos || []).some(x => x.id === d.id))}
onSelect={agregarDeposito}
/>
</div>
<TablaDepositos rows={depositos} onRemove={quitarDeposito} />
</section>


<section className="space-y-3">
<div className="flex items-center justify-between">
<h3 className="font-semibold">Locales del grupo</h3>
<SelectAgregarLocal
opciones={(allLocales || []).filter(l => !(locales || []).some(x => x.id === l.id))}
onSelect={agregarLocal}
/>
</div>
<TablaLocales rows={locales} onRemove={quitarLocal} />
</section>
</div>
);
}