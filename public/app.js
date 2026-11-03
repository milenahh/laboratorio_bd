'use strict';

let ejercicios = [];
let actual = null;
let respuestas = {};

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const h of hijos) n.append(h);
  return n;
}

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    method: opciones.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'Error inesperado.');
  return datos;
}

async function entrar() {
  ejercicios = await api('/api/ejercicios');
  const guardadas = await api('/api/respuestas');
  respuestas = Object.fromEntries(guardadas.map((r) => [r.ejercicio, r.texto]));
  $('vista-login').hidden = true;
  $('vista-taller').hidden = false;
  $('salir').hidden = false;
  renderMenu();
  seleccionar(ejercicios[0].id);
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error-login').hidden = true;
  try {
    await api('/api/login', { method: 'POST', body: { codigo: $('codigo').value.trim() } });
    await entrar();
  } catch (err) {
    $('error-login').textContent = err.message;
    $('error-login').hidden = false;
  }
});

$('salir').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

function renderMenu() {
  const menu = $('menu');
  menu.replaceChildren();
  let parte = null;
  for (const e of ejercicios) {
    if (e.parte !== parte) {
      parte = e.parte;
      menu.append(el('h3', { text: parte }));
    }
    const b = el('button', { type: 'button', 'data-id': e.id, text: `${e.id} · ${e.titulo}` });
    b.addEventListener('click', () => seleccionar(e.id));
    menu.append(b);
  }
}

function marcarMenu(id) {
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('activo', b.dataset.id === id));
}

function seleccionar(id) {
  actual = ejercicios.find((e) => e.id === id);
  marcarMenu(id);
  const c = $('contenido');
  c.replaceChildren();

  c.append(el('h2', { text: `${actual.id} · ${actual.titulo}` }));
  c.append(el('p', { class: 'enunciado', text: actual.enunciado }));

  if (actual.ejemplo) {
    c.append(el('p', { class: 'aviso', text: 'Ejemplo resuelto:' }), el('pre', { text: actual.ejemplo }));
  }
  if (actual.consultas.length) {
    c.append(el('p', { class: 'aviso', text: 'Escribe tus consultas:' }));
    c.append(el('ol', {}, ...actual.consultas.map((t) => el('li', { text: t }))));
  }

  const sql = el('textarea', { spellcheck: 'false', placeholder: 'Escribe tu consulta SQL aquí' });
  c.append(sql);

  const ejecutar = el('button', { class: 'primario', type: 'button', text: 'Ejecutar' });
  const limpiar = el('button', { class: 'secundario', type: 'button', text: 'Limpiar' });
  const reiniciar = el('button', { class: 'secundario', type: 'button', text: 'Restablecer mis datos' });
  const botones = el('div', { class: 'botones' }, ejecutar, limpiar, reiniciar);
  if (actual.id === 'B1') {
    const estad = el('button', { class: 'secundario', type: 'button', text: 'Ver estadísticas' });
    botones.append(estad);
    estad.addEventListener('click', () => verEstadisticas(salida));
  }
  c.append(botones);

  const salida = el('div', { class: 'resultado', hidden: '' });
  c.append(salida);

  ejecutar.addEventListener('click', () => correr(sql.value, salida));
  limpiar.addEventListener('click', () => {
    sql.value = '';
    salida.replaceChildren();
    salida.hidden = true;
  });
  reiniciar.addEventListener('click', async () => {
    if (!confirm('Esto borra y vuelve a crear tus datos de trabajo. ¿Continuar?')) return;
    salida.hidden = false;
    try {
      await api('/api/reiniciar', { method: 'POST' });
      salida.replaceChildren(el('p', { text: 'Datos restablecidos.' }));
    } catch (err) {
      salida.replaceChildren(el('p', { class: 'error', text: err.message }));
    }
  });

  if (actual.pregunta) {
    const txt = el('textarea', { placeholder: 'Escribe tu respuesta' });
    txt.value = respuestas[actual.id] || '';
    const estado = el('p', { class: 'aviso' });
    const guardar = el('button', { class: 'primario', type: 'button', text: 'Guardar respuesta' });
    guardar.addEventListener('click', async () => {
      estado.className = 'aviso';
      try {
        await api(`/api/respuestas/${actual.id}`, { method: 'PUT', body: { texto: txt.value } });
        respuestas[actual.id] = txt.value;
        estado.textContent = 'Respuesta guardada.';
      } catch (err) {
        estado.className = 'error';
        estado.textContent = err.message;
      }
    });
    c.append(
      el('h3', { text: 'Respuesta por escrito' }),
      el('p', { class: 'enunciado', text: actual.pregunta }),
      txt,
      el('div', { class: 'botones' }, guardar),
      estado,
    );
  }
}

async function correr(sql, salida) {
  salida.hidden = false;
  salida.replaceChildren(el('p', { class: 'aviso', text: 'Ejecutando…' }));
  try {
    const r = await api('/api/ejecutar', { method: 'POST', body: { sql } });
    salida.replaceChildren(pintar(r));
  } catch (err) {
    salida.replaceChildren(el('p', { class: 'error', text: err.message }));
  }
}

function pintar(r) {
  if (r.tipo === 'plan') return el('pre', { text: r.lineas.join('\n') });
  if (r.tipo === 'comando') return el('p', { text: r.mensaje });

  const cabecera = el('tr', {}, ...r.columnas.map((c) => el('th', { text: c })));
  const cuerpo = r.filas.map((f) =>
    el('tr', {}, ...r.columnas.map((c) => el('td', { text: f[c] === null ? 'NULL' : String(f[c]) })))
  );
  const tabla = el('table', {}, el('thead', {}, cabecera), el('tbody', {}, ...cuerpo));
  const nodos = [tabla];
  if (r.truncado) nodos.push(el('p', { class: 'aviso', text: 'Solo se muestran las primeras 200 filas.' }));
  return el('div', {}, ...nodos);
}

async function verEstadisticas(salida) {
  salida.hidden = false;
  try {
    const r = await api('/api/estadisticas');
    const lineas = [
      'Tablas (pg_class):',
      ...r.tablas.map((t) => `  ${t.tabla}: filas estimadas=${t.filas_estimadas}, páginas=${t.paginas}`),
      '',
      'Estadísticas (pg_stats):',
      ...r.estadisticas.map((s) => `  ${s.tablename}.${s.attname}: n_distinct=${s.n_distinct}, most_common_vals=${s.most_common_vals ?? '—'}`),
    ];
    salida.replaceChildren(el('pre', { text: lineas.join('\n') }));
  } catch (err) {
    salida.replaceChildren(el('p', { class: 'error', text: err.message }));
  }
}

// Al cargar, si ya hay sesión, entra directo.
api('/api/sesion').then(entrar).catch(() => {});
