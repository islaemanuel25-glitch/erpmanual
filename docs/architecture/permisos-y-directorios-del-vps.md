# Permisos y directorios de trabajo en el VPS `srv1431538`

Escrito el 2026-09-12, cuando los pedidos de autorización para entrar a
directorios se volvieron una interrupción en cada tanda. Está acá para no
volver a discutirlo.

## El problema, y por qué no lo resolvía `bypassPermissions`

Los tres archivos de configuración ya declaraban `defaultMode:
bypassPermissions` —usuario, proyecto y proyecto local—, y aun así el cartel
aparecía. No es una contradicción: **son dos mecanismos distintos.**

- `defaultMode` decide si una HERRAMIENTA necesita aprobación.
- El cartel de directorio decide si una RUTA está adentro del espacio de
  trabajo. Una ruta de afuera se pregunta igual, con cualquier modo.

Por eso lo que lo arregla es `permissions.additionalDirectories` y no aflojar
nada más.

## Qué rutas se usan fuera del directorio de trabajo

El directorio de trabajo es `/home/emanuel/trabajo/erpmanual`. Todo lo demás
que esta sesión toca, y para qué:

- **`/srv/produccion/erpazul`** — el repo del despliegue, con su
  `docker-compose.prod.yml` y su `.env`. Es donde el skill `/deploy` entra en
  casi todos sus pasos. **Era la fuente principal del cartel.**
- **`/srv/produccion/backups`** — los dumps de `pg_dump` y, bajo `env/`, las
  copias del `.env` de cada despliegue.
- **`/home/emanuel/.cache/erpazul-test`** — el `node_modules` que la imagen de
  pruebas monta. El repo no tiene `node_modules` propio: la suite, el arnés y
  el build se montan desde acá.
- **`/tmp`** — la salida del arnés y de la huella, y la de los comandos en
  segundo plano. Va el directorio entero y no los hijos a propósito: cada
  tanda crea el suyo —`/tmp/v15-capturas`, `/tmp/v21-capturas`…— y enumerarlos
  sería volver a pedir autorización en la tanda siguiente.

## Qué quedó configurado, y dónde

**En `/home/emanuel/.claude/settings.json`, que es la configuración de
USUARIO.** No en la del proyecto, a pedido de Emanuel: son rutas de esta
máquina y no del repo, así que no tienen por qué viajar en git ni aplicarse a
quien clone el proyecto en otro lado.

    "permissions": {
      "defaultMode": "bypassPermissions",
      "additionalDirectories": [
        "/srv/produccion/erpazul",
        "/srv/produccion/backups",
        "/home/emanuel/.cache/erpazul-test",
        "/tmp"
      ],
      "deny": [ … ]
    }

`theme`, `agentPushNotifEnabled` y `defaultMode` quedaron como estaban. **No se
tocó el archivo del proyecto**, ni su lista `allow`, ni sus hooks, ni la
guardia de migraciones.

## Y por qué vienen con reglas `deny` al lado

Agregar `/srv/produccion/erpazul` al espacio de trabajo pone al alcance de las
herramientas de archivo un directorio que contiene `.env` y `.env.prod`, con
`AUTH_SECRET`, `DATABASE_URL`, `POSTGRES_PASSWORD` y las claves de las APIs.

Las reglas `deny` que el proyecto ya tenía **no lo cubrían**, y eso está
medido, no supuesto: un `sed` sobre `.env` con la ruta resuelta adentro del
proyecto fue bloqueado —"blocked by a deny rule"—, y el mismo `sed` sobre
`/srv/produccion/erpazul/.env` pasó sin problema. Los patrones del proyecto
—`Read(.env)`, `Read(**/.env)`— se resuelven contra la raíz del proyecto.

Así que junto con los directorios se agregaron, en el mismo archivo de usuario,
cinco `deny` por ruta absoluta que tapan los secretos del despliegue y las
copias del `.env` en `backups/env/`. **Un `deny` aprieta, no afloja**, y gana
sobre cualquier `allow`.

Lo que esto NO cambia: `Bash` sigue pudiendo leer esos archivos, porque las
reglas de ruta no gobiernan lo que un comando hace por dentro. El procedimiento
de no imprimir secretos —derivarlos a una variable y nunca `cat`— sigue siendo
lo único que los protege ahí, y está en `CLAUDE.md`.

## Las reglas `allow` del proyecto no están sirviendo

Relevado el 2026-09-12 sobre `.claude/settings.json`: **57 entradas en `allow`,
y ninguna está haciendo efecto.** Con `defaultMode: bypassPermissions` en los
tres niveles, la lista entera es inerte.

Vale la pena saber qué hay ahí adentro, porque el día que se saque el bypass
—que es lo que habría que hacer si alguna vez se endurece— esa lista pasa a
estar viva de golpe:

- **26 son de `PowerShell`**, y este VPS es Linux. No hay `pwsh` ni
  `powershell` instalados. Son de cuando el trabajo se hacía desde la notebook.
- **Cuatro contradicen a la guardia de migraciones**: `Bash(npx prisma db
  push:*)` y `Bash(npx prisma migrate deploy:*)`, más sus gemelas de
  PowerShell. `db push` está en la lista de rechazo de
  `lib/deploy/guardiaMigraciones.js`, que no tiene autorización posible. Hoy
  gana la guardia —es un hook, corre antes— pero tener un `allow` de algo que
  el repo bloquea siempre es una contradicción escrita que confunde al que la
  lea.
- **Siete son destructivas**: `rm:*`, `rmdir:*`, `git clean:*`, `git rm:*` y
  las de PowerShell.
- **Tres son máximamente amplias**: `Read(**)`, `Edit(**)`, `Write(**)`.

**No se tocó ninguna en esta tanda**, porque sacarlas no cambia nada hoy y
podría cambiar algo el día que el bypass se saque. Queda anotado como lo que
es: una lista muerta que conviene limpiar a propósito y no de paso.

## Cómo comprobar que sigue bien

    python3 -c "import json;print(json.load(open('/home/emanuel/.claude/settings.json'))['permissions'])"

Tiene que devolver los cuatro directorios y los cinco `deny`, y `defaultMode`
en `bypassPermissions`. Si el cartel vuelve, lo primero es mirar si apareció
una ruta nueva fuera de esas cuatro.
