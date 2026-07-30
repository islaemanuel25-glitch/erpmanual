/**
 * Script de auto-documentación
 *
 * Lee los cambios recientes de git y actualiza la documentación
 * correspondiente en docs/modulos/ y CHANGELOG.md
 *
 * Uso: node scripts/update-docs.js [--since="2025-01-01"] [--dry-run]
 *
 * --since acepta YYYY-MM-DD (se toma desde las 00:00:00 hora local),
 * "YYYY-MM-DD HH:MM[:SS]", ISO con zona, o una expresión relativa de git.
 * Ver normalizarSince(): una fecha sin hora NO puede pasarse cruda a
 * `git log --since`, porque git le rellena la hora actual.
 *
 * Tests: node --test scripts/update-docs.test.mjs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuración ───────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const MODULOS_DIR = path.join(DOCS_DIR, 'modulos');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const ULTIMA_ACT_PATH = path.join(DOCS_DIR, 'ULTIMA-ACTUALIZACION.md');

// Mapeo de rutas a módulos
const MODULO_MAP = {
  'app/modulos/pos-ventas':       'pos-ventas',
  'components/pos-ventas':        'pos-ventas',
  'app/api/pos-ventas':           'pos-ventas',
  // Librería compartida del POS (generador de comprobantes, pagos, servicios,
  // consumo de stock…). La usan también otros módulos, pero la implementación
  // vive acá, así que se documenta en pos-ventas. No colisiona con
  // lib/auditoria-pos-ventas: ese prefijo no empieza con "lib/pos-ventas".
  'lib/pos-ventas':               'pos-ventas',
  'app/modulos/auditoria-pos-ventas': 'pos-ventas',
  'components/auditoria-pos-ventas':  'pos-ventas',
  'app/api/auditoria-pos-ventas':     'pos-ventas',
  'lib/auditoria-pos-ventas':         'pos-ventas',
  // Bitácora de auditoría central. DEBE ir DESPUÉS de auditoria-pos-ventas:
  // detectarModulo usa startsWith y "auditoria" es prefijo de "auditoria-pos-ventas".
  'app/modulos/auditoria':            'auditoria',
  'components/auditoria':             'auditoria',
  'app/api/auditoria':                'auditoria',
  'lib/auditoria':                    'auditoria',
  'app/modulos/pos-transferencias': 'pos-transferencias',
  'components/pos-transferencias':  'pos-transferencias',
  'app/api/pos-transferencias':     'pos-transferencias',
  // Reportes de ventas: listado, detalle "Ver venta" y corrección. Las 4 raíces
  // apuntan al mismo doc (docs/modulos/reportes-ventas.md). No colisiona con
  // reportes-stock porque startsWith compara el nombre completo del módulo.
  'app/modulos/reportes-ventas':  'reportes-ventas',
  'components/reportes-ventas':   'reportes-ventas',
  'app/api/reportes-ventas':      'reportes-ventas',
  'lib/reportes-ventas':          'reportes-ventas',
  'app/modulos/productos':        'productos',
  'components/productos':         'productos',
  'app/api/productos':            'productos',
  'app/modulos/stock_locales':    'stock',
  'components/stock':             'stock',
  'app/api/stock':                'stock',
  'app/modulos/transferencias':   'transferencias',
  'components/transferencias':    'transferencias',
  'app/api/transferencias':       'transferencias',
  'app/modulos/usuarios':         'usuarios',
  'components/usuarios':          'usuarios',
  'app/api/usuarios':             'usuarios',
  'app/modulos/roles':            'roles',
  'app/api/roles':                'roles',
  'app/modulos/grupos':           'grupos',
  'components/grupo':             'grupos',
  'app/api/grupos':               'grupos',
  'app/modulos/locales':          'locales',
  'components/locales':           'locales',
  'app/api/locales':              'locales',
  'app/modulos/categorias':       'categorias',
  'app/api/categorias':           'categorias',
  'app/modulos/proveedores':      'proveedores',
  'app/api/proveedores':          'proveedores',
  'app/modulos/configuracion':    'configuracion',
  'app/api/configuracion':        'configuracion',
  'app/modulos/dashboard':        'dashboard',
  'app/api/dashboard':            'dashboard',
  'lib/conversiones':             'productos',
  'components/sidebar':           'configuracion',
  'components/LayoutBase':        'configuracion',
};

// ─── Argumentos CLI ──────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sinceArg = args.find(a => a.startsWith('--since='));

// ─── Helpers ─────────────────────────────────────────────────────

function ahora() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function hoy() {
  return ahora().split(' ')[0];
}

function gitExec(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

// Fecha local YYYY-MM-DD (no usar toISOString: eso convierte a UTC y en zonas
// negativas como AR devuelve el día anterior).
function fechaLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const RE_SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
// Expresiones relativas de git (approxidate): se pasan tal cual.
const RE_RELATIVA = /(\bago\b|\byesterday\b|\btoday\b|\bnoon\b|\bmidnight\b|\blast\s)/i;
// ISO con zona explícita (Z u offset): ya trae su propio huso, no se toca.
const RE_ISO_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function esFechaCalendarioValida(y, m, d, hh = 0, mi = 0, ss = 0) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (hh > 23 || mi > 59 || ss > 59) return false;
  // Construir en hora LOCAL y verificar que no hubo rollover (ej: 2026-02-30).
  const dt = new Date(y, m - 1, d, hh, mi, ss);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d &&
    dt.getHours() === hh &&
    dt.getMinutes() === mi &&
    dt.getSeconds() === ss
  );
}

/**
 * Normaliza el valor de `--since` (o la fecha derivada de docs/) a algo que git
 * interprete de forma determinista, en la ZONA LOCAL del servidor.
 *
 * El bug que corrige: `git log --since="2026-07-29"` no significa "desde el
 * comienzo del 29". Git usa approxidate y rellena la hora que falta con la HORA
 * ACTUAL, así que corriendo el script a las 21:53 se saltea todos los commits de
 * ese mismo día anteriores a las 21:53.
 *
 *   'YYYY-MM-DD'                 → 'YYYY-MM-DD 00:00:00'
 *   'YYYY-MM-DD HH:MM[:SS]'      → se respeta (se completan los segundos)
 *   'YYYY-MM-DDTHH:MM[:SS]'      → idem, con espacio en lugar de T
 *   ISO con Z u offset           → tal cual (ya trae huso propio)
 *   relativas de git ("2 days ago", "yesterday") → tal cual
 *   cualquier otra cosa          → Error con mensaje claro
 *
 * No se agrega sufijo de zona: sin él, git la interpreta en la zona local, que es
 * el criterio que usa el resto del script (ahora()/hoy() son locales).
 */
function normalizarSince(valor) {
  const raw = String(valor == null ? '' : valor).trim();
  if (!raw) {
    throw new Error('--since vacío. Formato esperado: YYYY-MM-DD o "YYYY-MM-DD HH:MM[:SS]".');
  }

  if (RE_ISO_CON_ZONA.test(raw) || RE_RELATIVA.test(raw)) return raw;

  const soloFecha = raw.match(RE_SOLO_FECHA);
  if (soloFecha) {
    const [, y, m, d] = soloFecha.map(Number);
    if (!esFechaCalendarioValida(y, m, d)) {
      throw new Error(`Fecha inválida en --since: "${raw}" (no existe en el calendario).`);
    }
    return `${raw} 00:00:00`;
  }

  const conHora = raw.match(RE_FECHA_HORA);
  if (conHora) {
    const [, y, m, d, hh, mi, ss] = conHora;
    const seg = ss == null ? '00' : ss;
    if (!esFechaCalendarioValida(+y, +m, +d, +hh, +mi, +seg)) {
      throw new Error(`Fecha u hora inválida en --since: "${raw}".`);
    }
    return `${y}-${m}-${d} ${hh}:${mi}:${seg}`;
  }

  throw new Error(
    `Formato de --since no reconocido: "${raw}".\n` +
    '   Formatos aceptados:\n' +
    '     YYYY-MM-DD                 (se toma desde las 00:00:00 hora local)\n' +
    '     "YYYY-MM-DD HH:MM"         o "YYYY-MM-DD HH:MM:SS"\n' +
    '     ISO con zona               (2026-07-29T08:16:00-03:00)\n' +
    '     relativa de git            ("2 days ago", "yesterday")'
  );
}

function getUltimaActualizacionDocs() {
  if (sinceArg) {
    // Todo lo que venga del CLI pasa por la normalización (y su validación).
    return normalizarSince(sinceArg.slice('--since='.length));
  }
  // Buscar el último commit que tocó docs/
  const hash = gitExec('git log -1 --format=%H -- docs/');
  if (hash) {
    const fecha = gitExec(`git log -1 --format=%aI ${hash}`).split('T')[0];
    // Desde el COMIENZO de ese día: si se documentó a las 08:16 y después hubo
    // más commits ese mismo día, deben entrar igual.
    if (fecha) return normalizarSince(fecha);
  }
  // Fallback: 30 días atrás (fecha local, no UTC).
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return normalizarSince(fechaLocalISO(d));
}

function getCommitsDesde(since) {
  const log = gitExec(
    `git log --since="${since}" --format="%H|||%s|||%aI" --no-merges`
  );
  if (!log) return [];
  return log.split('\n').filter(Boolean).map(line => {
    const [hash, subject, date] = line.split('|||');
    return { hash, subject, date: date.split('T')[0] };
  });
}

function getArchivosModificados(hash) {
  const files = gitExec(`git diff-tree --no-commit-id --name-only -r ${hash}`);
  return files ? files.split('\n').filter(Boolean) : [];
}

function detectarModulo(filepath) {
  // Normalizar separadores
  const normalized = filepath.replace(/\\/g, '/');
  for (const [prefix, modulo] of Object.entries(MODULO_MAP)) {
    if (normalized.startsWith(prefix)) {
      return modulo;
    }
  }
  return null;
}

// ─── Lógica principal ────────────────────────────────────────────

function analizarCambios() {
  const since = getUltimaActualizacionDocs();
  console.log(`📅 Analizando cambios desde: ${since}`);

  const commits = getCommitsDesde(since);
  console.log(`📝 Commits encontrados: ${commits.length}`);

  if (commits.length === 0) {
    console.log('✅ No hay cambios nuevos para documentar.');
    return null;
  }

  // Agrupar cambios por módulo
  const modulosAfectados = {};

  for (const commit of commits) {
    const archivos = getArchivosModificados(commit.hash);
    for (const archivo of archivos) {
      const modulo = detectarModulo(archivo);
      if (modulo) {
        if (!modulosAfectados[modulo]) {
          modulosAfectados[modulo] = {
            archivos: new Set(),
            commits: [],
            archivosNuevos: [],
            archivosModificados: [],
          };
        }
        modulosAfectados[modulo].archivos.add(archivo);
        // Evitar commits duplicados
        if (!modulosAfectados[modulo].commits.find(c => c.hash === commit.hash)) {
          modulosAfectados[modulo].commits.push(commit);
        }
      }
    }
  }

  // Clasificar archivos nuevos vs modificados
  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    for (const archivo of data.archivos) {
      // Verificar si el archivo fue creado en este rango
      const firstCommit = gitExec(
        `git log --diff-filter=A --format=%H --since="${since}" -- "${archivo}"`
      );
      if (firstCommit) {
        data.archivosNuevos.push(archivo);
      } else {
        data.archivosModificados.push(archivo);
      }
    }
  }

  return { since, commits, modulosAfectados };
}

function actualizarDocModulo(modulo, data) {
  const docPath = path.join(MODULOS_DIR, `${modulo}.md`);

  if (!fs.existsSync(docPath)) {
    console.log(`  ⚠️  No existe docs/modulos/${modulo}.md — omitido`);
    return;
  }

  let contenido = fs.readFileSync(docPath, 'utf-8');

  // Fecha de última actualización: actualizar si existe; si no, crearla justo
  // después del primer encabezado H1 (tolera CRLF).
  const fechaRegex = /\*\*Última actualización:\*\*\s*.*/;
  if (fechaRegex.test(contenido)) {
    contenido = contenido.replace(
      fechaRegex,
      `**Última actualización:** ${ahora()}`
    );
  } else {
    contenido = contenido.replace(
      /^(#\s.*(?:\r?\n))/,
      `$1\n**Última actualización:** ${ahora()}\n`
    );
  }

  // Cambios recientes: insertar bajo la sección; si NO existe, crearla al final
  // del archivo (así el doc del módulo se mantiene aunque no la tuviera).
  const cambiosSection = '## Cambios recientes';
  const nuevosEntries = data.commits
    .map(c => `- ${c.date}: ${c.subject}`)
    .join('\n');
  if (contenido.includes(cambiosSection)) {
    contenido = contenido.replace(
      cambiosSection,
      `${cambiosSection}\n${nuevosEntries}`
    );
  } else {
    contenido = `${contenido.replace(/\s*$/, '')}\n\n${cambiosSection}\n${nuevosEntries}\n`;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Actualizaría: docs/modulos/${modulo}.md`);
  } else {
    fs.writeFileSync(docPath, contenido, 'utf-8');
    console.log(`  ✅ Actualizado: docs/modulos/${modulo}.md`);
  }
}

function actualizarUltimaActualizacion(modulosAfectados) {
  const fecha = ahora();
  const modulos = Object.keys(modulosAfectados);

  let seccionModulos = '';
  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    const totalArchivos = data.archivos.size;
    const nuevos = data.archivosNuevos.length;
    const modificados = data.archivosModificados.length;
    const resumen = data.commits.map(c => c.subject).slice(0, 3).join(', ');

    seccionModulos += `### ${modulo}
- ${resumen}
- Archivos: ${nuevos > 0 ? `${nuevos} nuevos` : ''}${nuevos > 0 && modificados > 0 ? ', ' : ''}${modificados > 0 ? `${modificados} modificados` : ''} (${totalArchivos} total)
\n`;
  }

  // Listar archivos nuevos
  const archivosNuevos = [];
  for (const data of Object.values(modulosAfectados)) {
    archivosNuevos.push(...data.archivosNuevos);
  }

  let seccionArchivosNuevos = '';
  if (archivosNuevos.length > 0) {
    seccionArchivosNuevos = `## Archivos nuevos desde última sincronización
${archivosNuevos.map(a => `- ${a}`).join('\n')}
`;
  }

  const contenido = `## Última actualización del Proyecto Claude

**Fecha:** ${fecha}

## Módulos modificados recientemente

${seccionModulos}
${seccionArchivosNuevos}
## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
`;

  if (dryRun) {
    console.log('[DRY-RUN] Actualizaría: docs/ULTIMA-ACTUALIZACION.md');
  } else {
    fs.writeFileSync(ULTIMA_ACT_PATH, contenido, 'utf-8');
    console.log('✅ Actualizado: docs/ULTIMA-ACTUALIZACION.md');
  }
}

function actualizarChangelog(modulosAfectados) {
  const fecha = hoy();
  const modulos = Object.keys(modulosAfectados);
  const modulosStr = modulos.join(', ');

  // Generar sección de cambios
  let cambios = `## [${fecha}] - Actualización: ${modulosStr}\n\n### Modificado\n`;

  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    for (const commit of data.commits) {
      cambios += `- **${modulo}**: ${commit.subject}\n`;
    }
  }

  cambios += '\n';

  if (!fs.existsSync(CHANGELOG_PATH)) {
    const contenido = `# Changelog\n\n${cambios}`;
    if (!dryRun) {
      fs.writeFileSync(CHANGELOG_PATH, contenido, 'utf-8');
    }
    return;
  }

  const actual = fs.readFileSync(CHANGELOG_PATH, 'utf-8');

  // Verificar que no se duplique la misma entrada de fecha
  if (actual.includes(`## [${fecha}]`)) {
    console.log(`⚠️  CHANGELOG.md ya tiene entrada para ${fecha} — omitido`);
    return;
  }

  // Insertar después del título. Tolera CRLF ('# Changelog\r\n' o '\n');
  // el replace literal con '\n' fallaba en archivos con saltos CRLF (no-op).
  // Fallback: si no hay header reconocible, prepend el bloque.
  const headerRe = /# Changelog\r?\n/;
  const nuevoContenido = headerRe.test(actual)
    ? actual.replace(headerRe, (m) => `${m}\n${cambios}`)
    : `# Changelog\n\n${cambios}${actual}`;

  if (dryRun) {
    console.log('[DRY-RUN] Actualizaría: CHANGELOG.md');
  } else {
    fs.writeFileSync(CHANGELOG_PATH, nuevoContenido, 'utf-8');
    console.log('✅ Actualizado: CHANGELOG.md');
  }
}

// ─── Main ────────────────────────────────────────────────────────

function main() {
  console.log('🔄 Sistema de auto-documentación');
  console.log('================================\n');

  // Verificar que estamos en un repo git
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('❌ No se encontró repositorio git en', ROOT);
    process.exit(1);
  }

  // Asegurar que existen los directorios
  if (!fs.existsSync(MODULOS_DIR)) {
    fs.mkdirSync(MODULOS_DIR, { recursive: true });
  }

  let resultado;
  try {
    resultado = analizarCambios();
  } catch (e) {
    // Fecha inválida en --since y similares: mensaje claro, sin stack trace.
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  if (!resultado) return;

  const { modulosAfectados } = resultado;
  const modulos = Object.keys(modulosAfectados);

  console.log(`\n📦 Módulos afectados: ${modulos.join(', ')}\n`);

  // Actualizar docs de cada módulo
  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    actualizarDocModulo(modulo, data);
  }

  // Actualizar ULTIMA-ACTUALIZACION.md
  actualizarUltimaActualizacion(modulosAfectados);

  // Actualizar CHANGELOG.md
  actualizarChangelog(modulosAfectados);

  console.log('\n✅ Auto-documentación completada.');

  if (!dryRun) {
    console.log(`\n📋 Módulos actualizados: ${modulos.join(', ')}`);
    console.log('💡 Sugerencia de commit:');
    console.log(`   git add docs/ CHANGELOG.md && git commit -m "docs: auto-update [${modulos.join(', ')}]"`);
  }
}

// Solo corre como CLI. Al requerirlo desde un test no ejecuta nada.
if (require.main === module) {
  main();
}

// Exportado para los tests (scripts/update-docs.test.mjs). Funciones puras.
module.exports = { detectarModulo, normalizarSince, MODULO_MAP, fechaLocalISO };
