'use strict';

const $ = (id) => document.getElementById(id);
let taller = 'planes';

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

const hora = (d) => new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota' });

async function cargar() {
  $('error').hidden = true;
  $('descarga-estudiante').href = `/api/docente/descargar?taller=${taller}&formato=estudiante`;
  $('descarga-respuesta').href = `/api/docente/descargar?taller=${taller}&formato=respuesta`;
  document.querySelectorAll('[data-taller]').forEach((b) => b.classList.toggle('activo', b.dataset.taller === taller));
  try {
    const { ejercicios, estudiantes } = await api(`/api/docente/respuestas?taller=${taller}`);
    const lista = $('lista');
    lista.replaceChildren();
    let conRespuestas = 0;

    for (const s of estudiantes) {
      const hechas = ejercicios.filter((e) => (s.respuestas[e.id]?.texto || '').trim() !== '').length;
      if (hechas > 0) conRespuestas += 1;
      const fechas = Object.values(s.respuestas).map((x) => new Date(x.actualizado).getTime());
      const ultima = fechas.length ? ` · última: ${hora(Math.max(...fechas))}` : '';
      const detalle = el('details', {}, el('summary', { text: `${s.codigo} · ${s.esquema} · ${hechas}/${ejercicios.length} respondidas${ultima}` }));
      for (const e of ejercicios) {
        const texto = (s.respuestas[e.id]?.texto || '').trim();
        detalle.append(
          el('p', { class: 'pregunta', text: `${e.id} · ${e.titulo}` }),
          el('p', { class: 'aviso', text: e.pregunta }),
          texto ? el('p', { class: 'respuesta', text: texto }) : el('p', { class: 'vacia', text: 'Sin respuesta' }),
        );
      }
      lista.append(detalle);
    }
    $('resumen').textContent = `${conRespuestas} de ${estudiantes.length} estudiantes han respondido al menos un ejercicio.`;
  } catch (err) {
    if (/Inicia sesión/.test(err.message)) return mostrarLogin();
    $('error').textContent = err.message;
    $('error').hidden = false;
  }
}

function mostrarLogin() {
  $('panel').hidden = true;
  $('salir').hidden = true;
  $('login').hidden = false;
}

function mostrarPanel() {
  $('login').hidden = true;
  $('panel').hidden = false;
  $('salir').hidden = false;
  cargar();
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error-login').hidden = true;
  try {
    await api('/api/docente/login', { method: 'POST', body: { clave: $('clave').value } });
    $('clave').value = '';
    mostrarPanel();
  } catch (err) {
    $('error-login').textContent = err.message;
    $('error-login').hidden = false;
  }
});

document.querySelectorAll('[data-taller]').forEach((b) => {
  b.addEventListener('click', () => {
    taller = b.dataset.taller;
    cargar();
  });
});

$('actualizar').addEventListener('click', cargar);

$('salir').addEventListener('click', async () => {
  await api('/api/docente/logout', { method: 'POST' }).catch(() => {});
  mostrarLogin();
});

api('/api/docente/sesion').then(mostrarPanel).catch(() => {});
