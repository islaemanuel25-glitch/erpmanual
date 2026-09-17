# Sacar `pgdata/` del historial

**Estado: PLANIFICADO, NO EJECUTADO.** Este documento es el procedimiento, no un
registro de algo que ya pasó. Cuando se ejecute, se anota acá abajo con fecha.

---

## Qué hay que sacar, y por qué todavía está

`pgdata/` es el directorio de datos de PostgreSQL 16 entero: **71,5 MB, 1721
archivos**. Entró en el **primer commit** del repositorio (`e509002d`,
23/11/2025) y se sacó del árbol el **17/02/2026** (`a39b9bca`, el commit que lo
agregó al `.gitignore`).

Que se haya sacado del árbol no lo saca del historial. Sigue estando en **20
commits**, y cualquiera que clone el repo lo baja entero sin pedirlo.

Lo que contiene, medido:

- `pgdata/base/` — los datos de las tablas del negocio: productos, proveedores,
  usuarios.
- `pgdata/global/1260` — `pg_authid`: **1 hash SCRAM-SHA-256**, la contraseña del
  rol de PostgreSQL.
- **34 hashes bcrypt** — las contraseñas de los usuarios de la aplicación.
- 4 direcciones de correo.

### Lo que ya se hizo

- **17/09/2026** — el repositorio pasó a privado. Estuvo público desde el
  23/11/2025: **casi diez meses**.
- **17/09/2026** — se cambió la contraseña de PostgreSQL en el VPS.
- **17/09/2026** — se sacó `lib/compras-proveedor/comprobante/datosReales.mauro.json`
  del árbol (un pedido real de proveedor) y se reemplazó por un fixture
  inventado. **Ese archivo también sigue en el historial** y se va con la misma
  pasada que `pgdata/`.

### Lo que falta, además de esto

- [ ] Que los usuarios cambien su contraseña. Bcrypt aguanta, pero una
      contraseña corta o repetida se saca con el hash en la mano.
- [ ] Borrar las ramas viejas que llevan `pgdata/` en el árbol (ver abajo).

---

## Por qué esto NO es urgente

Conviene decirlo antes del procedimiento, porque cambia cómo se decide cuándo
hacerlo.

**Reescribir el historial no recupera nada.** Los datos estuvieron públicos diez
meses; quien los haya clonado los tiene, y borrarlos de GitHub no se los quita.
Lo que esta limpieza logra es que **no se sigan repartiendo de acá en más**: a
quien clone mañana, a un colaborador nuevo, a una integración que lea el repo.

Lo que de verdad cierra el agujero son las contraseñas, y ésas se cambian sin
tocar el historial. **Primero eso, después esto.**

---

## La herramienta: `git-filter-repo`

No `filter-branch`: es diez veces más lento sobre 1810 commits, y su propia
documentación recomienda no usarlo. No BFG: anda bien, pero deja el
`.git/refs/original` y necesita Java.

```
pip install git-filter-repo
```

`git-filter-repo` **se niega a correr sobre un clon que no sea fresco**, a
propósito: quiere que el original quede intacto por si hay que volver.

---

## El procedimiento

Todo esto se hace en una carpeta aparte. **No se corre sobre el clon de trabajo.**

### 1. Avisar y congelar

Que nadie empuje mientras dura. Es minutos, no horas, pero un push en el medio
deja commits viejos apuntados por una rama nueva y hay que volver a empezar.

### 2. Clon espejo

```
git clone --mirror https://github.com/islaemanuel25-glitch/erpmanual.git erpmanual-limpio.git
cd erpmanual-limpio.git
```

`--mirror` trae **todas** las ramas y tags, no solo `main`. Sin eso la limpieza
dejaría `pgdata/` en las ramas que no vinieron.

### 3. Copia de seguridad ANTES de tocar nada

```
cd ..
cp -a erpmanual-limpio.git erpmanual-ANTES-DE-LIMPIAR.git
```

Guardarla **fuera** de la máquina donde se trabaja. Es la única vuelta atrás: una
vez que se fuerza el push, el historial viejo de GitHub se va.

Y ojo con dónde queda: esa copia **tiene adentro los datos que se están
sacando**. No va a una carpeta compartida ni a un backup que se sincronice a
ningún lado.

### 4. Borrar las rutas

```
cd erpmanual-limpio.git
git filter-repo --invert-paths \
  --path pgdata/ \
  --path lib/compras-proveedor/comprobante/datosReales.mauro.json
```

`--invert-paths` significa "quedate con todo MENOS esto".

### 5. Comprobar antes de empujar

```
git log --all --oneline -- pgdata/ | wc -l          # tiene que dar 0
git rev-list --objects --all | grep -c '^.* pgdata/' # tiene que dar 0
git count-objects -vH | grep size-pack               # de ~53 MiB a ~20 MiB
git rev-list --all --count                           # sigue en 1810
```

Los commits **no desaparecen**: cambian de identificador porque su contenido
cambió. Si la cuenta de commits bajara, algo se llevó puesto de más.

Y una comprobación más, que es la que importa:

```
git log --all --oneline | head -20
```

Los mensajes y las fechas tienen que ser los mismos de siempre.

### 6. Empujar

```
git remote add origin https://github.com/islaemanuel25-glitch/erpmanual.git
git push --force --mirror origin
```

`--mirror` empuja todas las ramas y tags, y **borra en el servidor las ramas que
no estén en el clon**. Eso es lo que se quiere acá, pero es también la razón por
la que el paso 1 no es opcional.

### 7. Pedirle a GitHub que junte la basura

Los commits viejos siguen accesibles por su SHA un tiempo, y las *pull requests*
los conservan más. Hay que abrir un ticket en el soporte de GitHub pidiendo
`gc` sobre el repositorio, nombrando los SHA viejos. Sin eso,
`github.com/<owner>/<repo>/commit/<sha-viejo>` sigue mostrando el archivo.

---

## Qué se rompe

**Todos los SHA cambian.** Desde el primer commit, porque el primer commit es uno
de los que tenía `pgdata/`. Eso significa:

| Qué | Qué le pasa |
|---|---|
| Las 102 ramas remotas | Se reescriben. Las que no estén en el espejo, se borran. |
| Los 2 issues abiertos | Sobreviven, pero los SHA que mencionen quedan colgados. |
| Los enlaces a commits | Todos rotos: en issues, en PRs, en documentos, en chats. |
| `docs/CURRENT_STATE.md` | Guarda el hash del relevamiento en el encabezado: queda apuntando a un commit que ya no existe. |
| Los candados que nombran commits | Varios comentarios de `*.test.mjs` citan SHA (`072c7d0`, `27c70832`…). No fallan —son prosa— pero dejan de resolver. |
| Tags | No hay ninguno, así que nada. |

Ninguna de esas cosas justifica no hacerlo. Pero conviene saberlas antes, no
después.

---

## Qué tiene que hacer cada máquina que tenga una copia

Esto es lo que más problemas trae, porque **un `git pull` no alcanza**. Al
cambiar todos los SHA, git ve dos historias sin nada en común e intenta
fusionarlas: el resultado es un repo con las dos, y `pgdata/` vuelve.

### La regla, para todos

**Se borra la copia y se clona de nuevo.** Es más rápido que arreglarlo y no hay
forma de hacerlo mal.

### El VPS

El despliegue corre desde `/deploy`, que hace `git pull` en el servidor. Después
de la limpieza, ese pull falla o —peor— mezcla las dos historias.

```
# en el VPS, con el servicio corriendo (esto no lo toca)
cd /ruta/del/repo
git fetch origin
git reset --hard origin/main
```

`reset --hard` y no `pull`: descarta la historia vieja en vez de fusionarla.

**Antes de correrlo**, comprobar que no haya nada sin commitear en el servidor:

```
git status --porcelain
```

Si hay algo, es un cambio hecho a mano en producción y hay que mirarlo primero —
`reset --hard` se lo lleva.

Si el resultado queda raro, la salida segura es la de siempre: borrar la carpeta
y clonar de nuevo. El `.env.prod` **no está en el repo**, así que hay que
copiarlo aparte antes de borrar nada.

### Las sesiones en la nube (Claude Code)

Cada sesión clona el repo al arrancar, así que **una sesión nueva sale limpia
sola**. El problema son las que ya están abiertas: tienen el historial viejo y,
si empujan, lo reintroducen.

- Cerrar las sesiones abiertas antes de la limpieza.
- Las que queden abiertas, que no empujen: hay que abrir una nueva.

### Las máquinas de trabajo

Igual: borrar la carpeta y clonar de nuevo. Antes, comprobar que no haya trabajo
sin empujar:

```
git status --porcelain
git log --branches --not --remotes --oneline
```

Lo que aparezca ahí hay que guardarlo como parche (`git format-patch`) y volver a
aplicarlo después, porque el `reset` se lo lleva.

---

## Las ramas que hoy llevan `pgdata/` en el árbol

Cuatro, y no solo en el historial: en su contenido actual.

| Rama | Commits propios | Qué hacer |
|---|---|---|
| `codex/create-plan-for-price-update-module` | 0 | Borrar: está contenida en `main`. |
| `volver-8b43fda` | 0 | Borrar: está contenida en `main`. |
| `sandbox` | 2 | **Mirar primero.** Toca el builder de apariencia. |
| `fix-ui` | 4 | **Mirar primero.** Toca el layout y el header. |

Las dos primeras se pueden borrar ya. Las otras dos tienen trabajo que no está en
`main`: o se rescata lo que sirva, o se decide que no sirve, pero no se borran a
ciegas.

Borrarlas **no saca `pgdata/` del historial** —para eso es todo lo de arriba—
pero sí saca el camino fácil: hoy se descargan desde la web de GitHub con un
clic, sin saber git.

---

## Registro

| Fecha | Qué se hizo | Quién |
|---|---|---|
| 2026-09-17 | Repositorio a privado. | Emanuel |
| 2026-09-17 | Contraseña de PostgreSQL cambiada en el VPS. | Emanuel |
| 2026-09-17 | `datosReales.mauro.json` reemplazado por un fixture inventado. | — |
| 2026-09-17 | Este plan, escrito y **sin ejecutar**. | — |
