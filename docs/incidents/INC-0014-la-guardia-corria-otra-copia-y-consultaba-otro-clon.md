# INC-0014 — La guardia de migraciones corría otra copia y consultaba otro clon

**Estado:** arreglado en `scripts/clasificar-migraciones.mjs`,
`scripts/hook-guardia-migraciones.mjs` y `.claude/settings.json`, sin
desplegar ni activar en el VPS. No hubo daño conocido. Se detectó auditando
cómo activar el PR #151, antes de usarlo.
**Cuándo:** 2026-10-08, después de mergear el PR #151 (`3ce5a15`) con
producción en `25172fe`.
**Alcance:** toda migración del ERP corrida desde una sesión de Claude Code en
el VPS, y todo comando que pase por la guardia después de un `cd`.

## Lo que pasó

Al auditar cómo activar en el VPS la guardia corregida en el PR #151 aparecieron
dos defectos que ninguno de los candados podía ver: cada pieza estaba probada
por separado y los dos vivían entre ellas.

**A · El clasificador consultaba el clon equivocado.** Corría git sobre el árbol
donde vive el script. En el VPS, Claude Code trabaja desde un clon
(`/home/emanuel/trabajo/erpmanual`) y la aplicación está en
`/srv/produccion/erpazul`. Si el clon estaba atrasado, el SHA que atiende no
estaba en su historial y el clasificador salía INDETERMINADO con un SHA válido;
y el destino era el HEAD del clon, no lo que se despliega. **Verificado en
código:** `correr()` usaba `cwd: ROOT`, y `ROOT` es el padre del script.
**Inferido:** que ese clon estuviera atrasado en un despliegue real; desde la
nube no se ve el VPS.

**B · El hook se resolvía contra el directorio actual.** `.claude/settings.json`
decía `node scripts/hook-guardia-migraciones.mjs`. **Comprobado con Claude Code
2.1.293**, en un `claude -p` sobre un proyecto descartable:

- el hook corre en el directorio actual de la sesión, que se mueve con `cd`;
- con el archivo ausente, node sale con 1 y el comando **corre igual**: un
  PreToolUse solo bloquea con 2.

O sea que, según el último `cd`, corría la copia de otro checkout —otra
versión— o ninguna.

## El arreglo

- El clasificador separa el directorio de ejecución del repositorio. Todo git
  corre con `-C <repositorio>`, y los datos del rango se resuelven explícitos:
  - origen: la imagen que atiende;
  - destino: `APP_IMAGE` en el VPS, el HEAD fuera de él;
  - repositorio: `/srv/produccion/erpazul` en el VPS, el árbol del script fuera;
  - migraciones: se leen del commit destino.
- El repositorio se valida, y si algo no cierra sale INDETERMINADO.
- `settings.json` llama al hook por `$CLAUDE_PROJECT_DIR`, envuelto en un `sh`
  que sale con 2 si el hook no pudo correr y el comando nombra prisma.
  Comprobado con el `claude` real que ese 2 frena.
- El hook dice qué copia corre y frena lo que nombra prisma si no es la del
  proyecto de la sesión. También frena con el motivo real si falta el
  clasificador o si se cae.

Candados en `scripts/guardiaRutasYEjecucion.test.mjs`, con repos git
temporales y el comando literal de `settings.json` corrido con `sh -c`. El
procedimiento de activación y los límites del PreToolUse están en el skill
`/deploy`, "Qué repositorio consulta el clasificador y qué copia de la guardia
corre".

## La segunda revisión, el mismo día

Antes del merge se pidió demostrar dos cosas: que un comando peligroso no pasa
cuando el hook falla, y que el SHA clasificado es la imagen que migra.

**Lo primero tenía tres huecos, reproducidos y cerrados.** Los tres hacían pasar
un comando que nombra prisma:

- un evento ininterpretable —JSON roto, sin `tool_name`, con un `command` que no
  es texto— recibía `allow`;
- un hook que salía con 0 sin una decisión —texto, `{}`, vacío— pasaba el
  envoltorio;
- un 2 del hook sobre un comando sin prisma se convertía en "pasa".

**Comprobado además con Claude Code 2.1.293:**

- un hook que se pasa de su `timeout` deja correr el comando;
- un clasificador colgado se corta a tiempo aunque un ssh hijo siga vivo.

**Lo segundo no tiene garantía, y está escrito así.** La etiqueta de la imagen
no prueba su contenido, y un comando puede migrar con otra imagen en la misma
línea. Se cerró un caso: `APP_IMAGE` del entorno distinta de la del `.env`.
Quedaron dos propuestas a decidir en el skill `/deploy`: comprobar la imagen
local y exigir la forma exacta del runbook para el ERP.

## Lección

Las rutas relativas de un hook se resuelven contra un directorio que no elige el
hook. Y "el hook falla cerrado" solo es cierto para lo que pasa adentro del
hook: si el hook no arranca, decide Claude Code, y Claude Code deja pasar.

## Sin verificar

- Que el vigilador de archivos de Claude Code levante un `settings.json` editado
  en una sesión abierta: está documentado, no se comprobó. El procedimiento pide
  reiniciar la sesión.
- El comportamiento en el VPS de verdad: todo lo comprobado fue en la nube.
- Que la imagen bajo la etiqueta `erpmanual:<SHA>` en el VPS contenga las
  migraciones de ese commit: no se comprueba, ni hoy ni con este arreglo.
