'use strict';

const fs = require('fs');
const path = require('path');

// Carga variables desde .env (si existe) sin sobrescribir las que ya vienen del entorno.
function cargarEnv() {
  const ruta = path.join(__dirname, '.env');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
cargarEnv();

const express = require('express');
const crypto = require('crypto');
const { Pool, types } = require('pg');

// Las fechas (tipo date, OID 1082) se devuelven como texto AAAA-MM-DD.
types.setTypeParser(1082, (valor) => valor);

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error('Falta la variable SESSION_SECRET');

// Mapa código de estudiante -> esquema, por ejemplo {"ABC12345": "est01"}
const CODIGOS = JSON.parse(process.env.CODIGOS_JSON || '{}');
const COOKIE_SEGURA = process.env.COOKIE_SEGURA === 'true';
const EJERCICIOS = {
  planes: JSON.parse(fs.readFileSync(path.join(__dirname, 'ejercicios.json'), 'utf8')),
  sentencias: JSON.parse(fs.readFileSync(path.join(__dirname, 'ejercicios_sentencias.json'), 'utf8')),
};
// Esquemas est01 a est20: laboratorio de planes de consulta. est21 en adelante: sentencias SQL.
function tallerDe(esquema) {
  return Number(String(esquema).slice(3)) >= 21 ? 'sentencias' : 'planes';
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
});

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- sesión firmada ----------
function firmar(codigo) {
  return crypto.createHmac('sha256', SECRET).update(codigo).digest('hex');
}

function verificar(token) {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const codigo = token.slice(0, i);
  const firma = token.slice(i + 1);
  if (!Object.prototype.hasOwnProperty.call(CODIGOS, codigo)) return null;
  const esperada = firmar(codigo);
  if (firma.length !== esperada.length) return null;
  return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada)) ? codigo : null;
}

function leerCookie(req, nombre) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const idx = parte.indexOf('=');
    if (idx > 0 && parte.slice(0, idx).trim() === nombre) {
      return decodeURIComponent(parte.slice(idx + 1).trim());
    }
  }
  return null;
}

// ---------- límite de solicitudes: 30 por minuto por estudiante ----------
const ventanas = new Map();

function dentroDeLimite(codigo) {
  const ahora = Date.now();
  let r = ventanas.get(codigo);
  if (!r || ahora - r.inicio > 60000) r = { inicio: ahora, n: 0 };
  r.n += 1;
  ventanas.set(codigo, r);
  return r.n <= 30;
}

function autenticar(req, res, next) {
  const codigo = verificar(leerCookie(req, 'lab_sesion'));
  if (!codigo) return res.status(401).json({ error: 'Inicia sesión con tu código.' });
  if (!dentroDeLimite(codigo)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' });
  }
  req.codigo = codigo;
  req.esquema = CODIGOS[codigo];
  next();
}

// ---------- validación de SQL (lista blanca) ----------
const PALABRAS_PROHIBIDAS = /\b(RESET|ROLE|SCHEMA|DATABASE|COPY|GRANT|REVOKE|CALL|DO|VACUUM|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|LISTEN|NOTIFY|LOCK|DISCARD|PREPARE|EXECUTE|DEALLOCATE|FUNCTION|PROCEDURE|TRIGGER|VIEW|SEQUENCE|EXTENSION|REINDEX|CLUSTER|COMMENT|REFRESH|MERGE|RULE|POLICY|TYPE|DOMAIN|OWNER|SESSION|AUTHORIZATION|WITH)\b/i;

function validarSql(entrada, esquema, taller) {
  let sql = String(entrada || '')
    .replace(/--[^\n\r]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();
  if (!sql) return { error: 'Escribe una consulta.' };
  if (sql.length > 4000) return { error: 'La consulta es demasiado larga.' };

  // Texto sin literales de cadena, para revisar palabras clave
  const sinTexto = sql.replace(/'(?:[^']|'')*'/g, "''");

  if (/[;"\\$]/.test(sinTexto)) {
    return { error: 'Solo se permite una sentencia, sin comillas dobles, barras invertidas ni $.' };
  }
  if (/\bpg_\w*|information_schema|\bdblink|\blo_\w*|\bcurrent_setting|\bset_config/i.test(sinTexto)) {
    return { error: 'Consulta no permitida en este taller.' };
  }
  if (PALABRAS_PROHIBIDAS.test(sinTexto)) {
    return { error: 'Palabra no permitida en este taller.' };
  }
  if (/\bpublic\b/i.test(sinTexto)) {
    return { error: 'Consulta no permitida en este taller.' };
  }
  // Solo tu propio esquema: se revisa también dentro de literales
  for (const m of sql.matchAll(/\best(\d\d)\b/gi)) {
    if (`est${m[1]}` !== esquema) return { error: 'Solo puedes trabajar con tu propio esquema.' };
  }

  if (taller === 'planes' && /\b(ALTER|TABLE|TRUNCATE)\b/i.test(sinTexto)) {
    return { error: 'Palabra no permitida en este taller.' };
  }

  if (/^SELECT\b/i.test(sinTexto)) {
    if (/\bINTO\b/i.test(sinTexto)) return { error: 'SELECT INTO no está permitido.' };
    return { modo: 'consulta', sql };
  }
  if (/^EXPLAIN\b/i.test(sinTexto)) {
    const interna = /^EXPLAIN\s+(?:\([^)]*\)\s*|(?:ANALYZE|VERBOSE|BUFFERS|COSTS|SETTINGS|TIMING|SUMMARY)\s+)*(SELECT|INSERT|UPDATE|DELETE)\b/i;
    if (!interna.test(sinTexto)) return { error: 'EXPLAIN solo aplica a SELECT, INSERT, UPDATE o DELETE.' };
    const analiza = /\bANALYZE\b/i.test(sinTexto);
    const dml = /\b(INSERT|UPDATE|DELETE)\b/i.test(sinTexto);
    return { modo: analiza && dml ? 'explain_dml' : 'explain', sql };
  }
  if (/^(INSERT|UPDATE|DELETE)\b/i.test(sinTexto)) return { modo: 'dml', sql };
  if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(sinTexto)) return { modo: 'comando', sql };
  if (/^DROP\s+INDEX\b/i.test(sinTexto)) return { modo: 'comando', sql };
  if (/^ANALYZE\b/i.test(sinTexto)) return { modo: 'comando', sql };
  if (/^CREATE\s+TABLE\b/i.test(sinTexto)) return { modo: 'comando', sql };
  if (/^ALTER\s+TABLE\b/i.test(sinTexto)) return { modo: 'comando', sql };
  if (/^DROP\s+TABLE\b/i.test(sinTexto)) return { modo: 'comando', sql };
  if (/^TRUNCATE\b/i.test(sinTexto)) return { modo: 'comando', sql };

  return { error: 'Solo se permiten SELECT, EXPLAIN, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE, TRUNCATE, CREATE INDEX, DROP INDEX y ANALYZE.' };
}

// ---------- ejecución dentro de una transacción ----------
async function ejecutar(esquema, validado) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SELECT set_config('statement_timeout', '5s', true)");
    await cliente.query("SELECT set_config('search_path', $1, true)", [esquema]);

    if (validado.modo === 'consulta') {
      const r = await cliente.query(`SELECT * FROM (${validado.sql}) AS resultado LIMIT 201`);
      await cliente.query('COMMIT');
      return {
        tipo: 'tabla',
        columnas: r.fields.map((f) => f.name),
        filas: r.rows.slice(0, 200),
        truncado: r.rows.length > 200,
      };
    }

    const r = await cliente.query(validado.sql);
    if (validado.modo === 'explain_dml') {
      await cliente.query('ROLLBACK');
      return { tipo: 'plan', lineas: r.rows.map((x) => x['QUERY PLAN']) };
    }
    await cliente.query('COMMIT');
    if (validado.modo === 'explain') {
      return { tipo: 'plan', lineas: r.rows.map((x) => x['QUERY PLAN']) };
    }
    return { tipo: 'comando', mensaje: `${r.command}: ${r.rowCount ?? 0} fila(s) afectada(s)` };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// ---------- rutas ----------
app.post('/api/login', (req, res) => {
  const codigo = String(req.body?.codigo || '').trim();
  if (!codigo || !Object.prototype.hasOwnProperty.call(CODIGOS, codigo)) {
    return res.status(401).json({ error: 'Código no válido.' });
  }
  if (tallerDe(CODIGOS[codigo]) !== req.body?.taller) {
    return res.status(401).json({ error: 'Este código no pertenece al laboratorio elegido.' });
  }
  const token = `${codigo}.${firmar(codigo)}`;
  const atributos = [`lab_sesion=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=28800'];
  if (COOKIE_SEGURA) atributos.push('Secure');
  res.setHeader('Set-Cookie', atributos.join('; '));
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'lab_sesion=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/sesion', autenticar, (req, res) => res.json({ ok: true, taller: tallerDe(req.esquema) }));

app.get('/api/ejercicios', autenticar, (req, res) => res.json(EJERCICIOS[tallerDe(req.esquema)]));

app.post('/api/ejecutar', autenticar, async (req, res) => {
  const validado = validarSql(req.body?.sql, req.esquema, tallerDe(req.esquema));
  if (validado.error) return res.status(400).json({ error: validado.error });
  try {
    res.json(await ejecutar(req.esquema, validado));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/reiniciar', autenticar, async (req, res) => {
  try {
    await pool.query('SELECT lab_crear_esquema($1)', [req.esquema]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron restablecer tus datos. Intenta de nuevo.' });
  }
});

app.get('/api/estadisticas', autenticar, async (req, res) => {
  try {
    const tablas = await pool.query(
      `SELECT c.relname AS tabla, c.reltuples AS filas_estimadas, c.relpages AS paginas
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r' ORDER BY c.relname`,
      [req.esquema]
    );
    const estadisticas = await pool.query(
      `SELECT tablename, attname, n_distinct, most_common_vals::text AS most_common_vals
       FROM pg_stats WHERE schemaname = $1 ORDER BY tablename, attname`,
      [req.esquema]
    );
    res.json({ tablas: tablas.rows, estadisticas: estadisticas.rows });
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron consultar las estadísticas.' });
  }
});

app.get('/api/respuestas', autenticar, async (req, res) => {
  try {
    const r = await pool.query('SELECT ejercicio, texto FROM public.lab_respuestas WHERE codigo = $1', [req.codigo]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron cargar tus respuestas.' });
  }
});

app.put('/api/respuestas/:ejercicio', autenticar, async (req, res) => {
  const id = req.params.ejercicio;
  if (!EJERCICIOS[tallerDe(req.esquema)].some((e) => e.id === id)) return res.status(400).json({ error: 'Ejercicio no válido.' });
  const texto = String(req.body?.texto ?? '').slice(0, 5000);
  try {
    await pool.query(
      `INSERT INTO public.lab_respuestas (codigo, ejercicio, texto, actualizado)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (codigo, ejercicio) DO UPDATE SET texto = EXCLUDED.texto, actualizado = now()`,
      [req.codigo, id, texto]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar tu respuesta. Intenta de nuevo.' });
  }
});

async function iniciar() {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.lab_respuestas (
    codigo text NOT NULL,
    ejercicio text NOT NULL,
    texto text NOT NULL DEFAULT '',
    actualizado timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (codigo, ejercicio))`);
  const puerto = Number(process.env.PORT || 3000);
  app.listen(puerto, () => console.log(`Taller escuchando en el puerto ${puerto}`));
}

iniciar().catch((err) => {
  console.error('Error al iniciar:', err.message);
  process.exit(1);
});
