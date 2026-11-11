/* Inorgánica Interactiva · Explorador de materiales
   Sin dependencias de compilación. Datos: data/materiales.js y data/estructuras.js
   (generados con scripts/generar_datos.py). Visor: 3Dmol.js. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtF = (f) => esc(f).replace(/(\d+\.?\d*)/g, '<sub>$1</sub>');
  const colorGap = (g) => (g < 0.1 ? 'var(--c-cond)' : g < 3 ? 'var(--c-semi)' : 'var(--c-aisl)');
  const num = (v, d = 2) => (v == null ? '—' : v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));

  const SIST = {
    cubic: 'Cúbico', tetragonal: 'Tetragonal', orthorhombic: 'Ortorrómbico', hexagonal: 'Hexagonal',
    trigonal: 'Trigonal', monoclinic: 'Monoclínico', triclinic: 'Triclínico',
  };
  const RESTR = {
    cubic: 'a = b = c y α = β = γ = 90°',
    tetragonal: 'a = b ≠ c y α = β = γ = 90°',
    orthorhombic: 'a ≠ b ≠ c y α = β = γ = 90°',
    hexagonal: 'a = b ≠ c, α = β = 90° y γ = 120°',
    trigonal: 'a = b ≠ c, α = β = 90° y γ = 120° (ejes hexagonales), o a = b = c con α = β = γ ≠ 90° (ejes romboédricos)',
    monoclinic: 'a ≠ b ≠ c, α = γ = 90° y β ≠ 90°',
    triclinic: 'a ≠ b ≠ c y ningún ángulo obligado a 90°',
  };
  const ANIONES = ['O', 'F', 'Cl', 'Br', 'I', 'S', 'Se'];

  const META = window.META || {};
  const DATA = (window.MATERIALES || []).map((m) => ({ ...m, els: new Set(m.el), hay: (m.f + ' ' + m.id).toLowerCase() }));
  const BY_ID = new Map(DATA.map((m) => [m.id, m]));
  const GMAX = Math.max(1, Math.ceil(Math.max(0, ...DATA.map((m) => m.g || 0))));
  const HMAX = 0.1;

  /* ---------- Estado ---------- */
  const SISTEMAS = Object.keys(SIST).filter((s) => DATA.some((m) => m.cs === s));
  const F = defaults();
  function defaults() {
    return { q: '', inc: [], exc: [], gmin: 0, gmax: GMAX, hull: HMAX, tipo: 'any', exp: false, sist: new Set(SISTEMAS), pred: null, preset: null };
  }
  let orden = { k: 'f', dir: 1 };
  let visibles = [];
  let mostrados = 50;
  let seleccionado = null;

  /* ---------- Atajos ---------- */
  const PRESETS = [
    { id: 'solar', nombre: 'Candidatos fotovoltaicos', desc: 'Gap directo de 1,1 a 1,8 eV', set: (f) => { f.gmin = 1.1; f.gmax = 1.8; f.tipo = '1'; } },
    { id: 'semi', nombre: 'Semiconductores', desc: 'Gap de 0,5 a 3 eV', set: (f) => { f.gmin = 0.5; f.gmax = 3; } },
    { id: 'aisl', nombre: 'Aislantes (gap ancho)', desc: 'Gap mayor que 4 eV', set: (f) => { f.gmin = 4; f.gmax = GMAX; } },
    { id: 'perov', nombre: 'Tipo perovskita ABX₃', desc: 'Fórmula ABX₃ con O, halógeno o calcógeno (candidatos; no toda ABX₃ es perovskita)', pred: (m) => m.an === 'ABC3' && ANIONES.some((a) => m.els.has(a)) },
    { id: 'oxidos', nombre: 'Óxidos (cerámicas)', desc: 'Contienen O y ningún otro anión', pred: (m) => m.els.has('O') && !ANIONES.filter((a) => a !== 'O').some((a) => m.els.has(a)) && m.el.length > 1 },
    { id: 'hal', nombre: 'Halogenuros', desc: 'Contienen F, Cl, Br o I', pred: (m) => ['F', 'Cl', 'Br', 'I'].some((a) => m.els.has(a)) },
  ];

  /* ---------- Controles ---------- */
  const el = {
    q: $('#f-q'), inc: $('#f-inc'), exc: $('#f-exc'), gmin: $('#f-gmin'), gmax: $('#f-gmax'), oGap: $('#o-gap'),
    tipo: $('#f-tipo'), hull: $('#f-hull'), oHull: $('#o-hull'), sist: $('#f-sist'), exp: $('#f-exp'),
    presets: $('#presets'), tbody: $('#tbody'), nRes: $('#n-res'), nota: $('#nota-res'), histo: $('#histo'), histoMax: $('#histo-max'),
    mas: $('#btn-mas'), vacio: $('#vacio'), tabla: $('#tabla'),
  };

  function construirControles() {
    el.gmin.max = el.gmax.max = GMAX; el.gmax.value = GMAX;
    el.sist.innerHTML = SISTEMAS.map((s) => `<label><input type="checkbox" value="${s}" checked> ${SIST[s]}</label>`).join('');
    el.presets.innerHTML = PRESETS.map((p) => `<button type="button" class="chip" data-p="${p.id}" title="${esc(p.desc)}">${esc(p.nombre)}</button>`).join('');
    el.histoMax.textContent = GMAX + ' eV';
  }

  const toEls = (txt) => txt.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean).map((t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

  function leerControles() {
    F.q = el.q.value.trim().toLowerCase();
    F.inc = toEls(el.inc.value);
    F.exc = toEls(el.exc.value);
    let a = parseFloat(el.gmin.value), b = parseFloat(el.gmax.value);
    if (a > b) { [a, b] = [b, a]; }
    F.gmin = a; F.gmax = b;
    F.hull = parseFloat(el.hull.value);
    F.tipo = el.tipo.value;
    F.exp = el.exp.checked;
    F.sist = new Set([...el.sist.querySelectorAll('input:checked')].map((i) => i.value));
  }

  function escribirControles() {
    el.q.value = F.q; el.inc.value = F.inc.join(', '); el.exc.value = F.exc.join(', ');
    el.gmin.value = F.gmin; el.gmax.value = F.gmax; el.hull.value = F.hull; el.tipo.value = F.tipo; el.exp.checked = F.exp;
    el.sist.querySelectorAll('input').forEach((i) => { i.checked = F.sist.has(i.value); });
  }

  function etiquetasRango() {
    const lo = Math.min(F.gmin, F.gmax), hi = Math.max(F.gmin, F.gmax);
    el.oGap.textContent = `${num(lo, 1)} a ${num(hi, 1)} eV`;
    el.oHull.textContent = F.hull >= HMAX ? 'sin límite (hasta 0,1)' : `≤ ${num(F.hull, 3)} eV/átomo`;
  }

  /* ---------- Filtro, orden, render ---------- */
  function pasa(m) {
    if (F.q && !m.hay.includes(F.q)) return false;
    if (F.inc.length && !F.inc.every((e) => m.els.has(e))) return false;
    if (F.exc.length && F.exc.some((e) => m.els.has(e))) return false;
    if (m.g < F.gmin - 1e-9 || m.g > F.gmax + 1e-9) return false;
    if ((m.eh || 0) > F.hull + 1e-9 && F.hull < HMAX) return false;
    if (!F.sist.has(m.cs)) return false;
    if (F.exp && !m.ex) return false;
    if (F.tipo !== 'any' && String(m.d) !== F.tipo) return false;
    if (F.pred && !F.pred(m)) return false;
    return true;
  }

  function aplicar(reiniciarPagina = true) {
    visibles = DATA.filter(pasa);
    ordenar();
    if (reiniciarPagina) mostrados = 50;
    etiquetasRango();
    pintar();
  }

  function ordenar() {
    const { k, dir } = orden;
    const val = (m) => (m[k] == null ? (k === 'f' || k === 'cs' || k === 'sg' ? '' : -1) : m[k]);
    visibles.sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === 'string' ? x.localeCompare(y, 'en') : x - y;
      return (r || a.f.localeCompare(b.f, 'en')) * dir;
    });
    el.tabla.querySelectorAll('th').forEach((th) => {
      const b = th.querySelector('button');
      th.setAttribute('aria-sort', b.dataset.k === k ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }

  function pintar() {
    el.nRes.textContent = visibles.length.toLocaleString('es');
    el.nota.textContent = `de ${DATA.length.toLocaleString('es')} en total`;
    el.vacio.hidden = visibles.length > 0;
    el.tabla.parentElement.hidden = visibles.length === 0;
    const filas = visibles.slice(0, mostrados);
    el.tbody.innerHTML = filas.map((m) => `
      <tr data-id="${esc(m.id)}" class="${m.id === seleccionado ? 'sel' : ''}">
        <td class="f"><button type="button" class="fila-btn" ${m.id === seleccionado ? 'aria-current="true"' : ''} aria-label="Ver ${esc(m.f)}, ${esc(m.id)}">${fmtF(m.f)}</button></td>
        <td class="num"><span class="gcel"><span>${num(m.g)}</span><span class="gbar" aria-hidden="true"><i style="--w:${Math.min(100, (m.g / GMAX) * 100)}%;--c:${colorGap(m.g)}"></i></span></span></td>
        <td>${m.d === 1 ? 'Directo' : m.d === 0 ? 'Indirecto' : '—'}</td>
        <td>${SIST[m.cs] || esc(m.cs)}</td>
        <td>${esc(m.sg || '—')}</td>
        <td class="num">${num(m.eh, 3)}</td>
        <td><span class="tag ${m.ex ? 'exp' : ''}">${m.ex ? 'Experimental' : 'Teórico'}</span></td>
      </tr>`).join('');
    el.mas.hidden = visibles.length <= mostrados;
    el.mas.textContent = `Mostrar más (${Math.min(100, visibles.length - mostrados)} de ${visibles.length - mostrados} restantes)`;
    histograma();
    document.querySelectorAll('#presets .chip').forEach((c) => c.classList.toggle('activo', c.dataset.p === F.preset));
  }

  function histograma() {
    const nb = Math.max(10, Math.min(40, GMAX * 4));
    const w = GMAX / nb;
    const cuenta = new Array(nb).fill(0);
    for (const m of visibles) cuenta[Math.min(nb - 1, Math.floor((m.g || 0) / w))]++;
    const mx = Math.max(1, ...cuenta);
    el.histo.innerHTML = cuenta.map((c, i) => `<div style="height:${(c / mx) * 100}%;--c:${colorGap((i + 0.5) * w)}" title="${num(i * w, 1)} a ${num((i + 1) * w, 1)} eV: ${c}"></div>`).join('');
    const clases = [0, 0, 0];
    for (const m of visibles) clases[m.g < 0.1 ? 0 : m.g < 3 ? 1 : 2]++;
    el.histo.setAttribute('aria-label', `Distribución del bandgap: ${clases[0]} conductores, ${clases[1]} semiconductores y ${clases[2]} aislantes`);
  }

  /* ---------- Eventos de filtros ---------- */
  function alCambiarControl() {
    leerControles();
    F.pred = null; F.preset = null;
    aplicar();
  }
  ['input', 'change'].forEach((ev) => $('#form-filtros').addEventListener(ev, (e) => {
    if (e.target.closest('#presets')) return;
    if (ev === 'change' && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') return;
    alCambiarControl();
  }));

  el.presets.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    const p = PRESETS.find((x) => x.id === b.dataset.p);
    if (F.preset === p.id) { Object.assign(F, defaults()); escribirControles(); aplicar(); return; }
    Object.assign(F, defaults());
    if (p.set) p.set(F);
    F.pred = p.pred || null;
    F.preset = p.id;
    escribirControles();
    aplicar();
  });

  $('#btn-reset').addEventListener('click', () => { Object.assign(F, defaults()); escribirControles(); aplicar(); });
  el.mas.addEventListener('click', () => { mostrados += 100; pintar(); });

  el.tabla.querySelector('thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    orden = { k, dir: orden.k === k ? -orden.dir : 1 };
    ordenar(); pintar();
  });

  // Clic en cualquier parte de la fila; con teclado se usa el botón de la fórmula.
  el.tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) abrir(tr.dataset.id); });
  function marcarFila(id) {
    el.tbody.querySelectorAll('tr').forEach((tr) => {
      const on = tr.dataset.id === id;
      tr.classList.toggle('sel', on);
      const b = tr.querySelector('.fila-btn');
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- Estructuras (carga diferida) ---------- */
  let promEst = null;
  function cargarEstructuras() {
    if (window.ESTRUCTURAS) return Promise.resolve(window.ESTRUCTURAS);
    if (!promEst) {
      promEst = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'data/estructuras.js';
        s.onload = () => ok(window.ESTRUCTURAS);
        s.onerror = () => { promEst = null; mal(new Error('No se pudo cargar data/estructuras.js')); };
        document.head.appendChild(s);
      });
    }
    return promEst;
  }

  /* ---------- Geometría ---------- */
  function vectores([a, b, c, al, be, ga]) {
    const r = Math.PI / 180, ca = Math.cos(al * r), cb = Math.cos(be * r), cg = Math.cos(ga * r), sg = Math.sin(ga * r);
    const cx = c * cb, cy = (c * (ca - cb * cg)) / sg, cz = Math.sqrt(Math.max(c * c - cx * cx - cy * cy, 0));
    return [[a, 0, 0], [b * cg, b * sg, 0], [cx, cy, cz]];
  }
  const cart = (L, f) => [0, 1, 2].map((i) => f[0] * L[0][i] + f[1] * L[1][i] + f[2] * L[2][i]);

  const ANION = new Set(['O', 'F', 'Cl', 'Br', 'I', 'S', 'Se', 'Te', 'N', 'P', 'As', 'H']);
  const envolver = (v) => { v -= Math.floor(v); return v > 1 - 1e-3 ? 0 : v; };
  const sitios = (est) => est.sites.map(([e, ...f]) => ({ e, f: f.map(envolver) }));

  /* Átomos que se dibujan: la celda n×n×n completa, incluyendo los átomos del borde. */
  function atomosCelda(S, n) {
    const eps = 1e-3, out = [];
    S.forEach((s, idx) => {
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) {
        const g = [s.f[0] + i, s.f[1] + j, s.f[2] + k];
        if (g[0] > n + eps || g[1] > n + eps || g[2] > n + eps) continue;
        out.push({ s: idx, e: s.e, g, T: [i, j, k] });
      }
    });
    return out;
  }

  /* Vecinos de cada sitio de la celda (con búsqueda periódica). Reglas didácticas:
     - metal–anión: la primera capa de coordinación (hasta un salto de distancia del 8 % o 1,3 × la mínima);
     - anión–anión solo si es un enlace covalente corto (≤ 2,1 Å), p. ej. S–O en sulfatos;
     - nunca metal–metal cuando hay aniones; sin aniones, todos con todos (Si, GaAs...). */
  const nbCache = new Map();
  function capa(c) {
    c.sort((x, y) => x.d - y.d);
    const out = [];
    if (!c.length) return out;
    const d1 = c[0].d;
    let prev = d1;
    for (const x of c) { if (x.d > 1.3 * d1 || x.d / prev > 1.08) break; out.push(x); prev = x.d; }
    return out;
  }
  function vecinos(id, est, S) {
    if (nbCache.has(id)) return nbCache.get(id);
    const L = vectores(est.lat);
    const mixto = S.some((s) => ANION.has(s.e)) && S.some((s) => !ANION.has(s.e));
    const R = S.length <= 40 ? 2 : 1;
    const res = S.map((si, i) => {
      const cand = [];
      S.forEach((sj, j) => {
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let cc = -R; cc <= R; cc++) {
          if (i === j && !a && !b && !cc) continue;
          const p = cart(L, [sj.f[0] + a - si.f[0], sj.f[1] + b - si.f[1], sj.f[2] + cc - si.f[2]]);
          cand.push({ d: Math.hypot(p[0], p[1], p[2]), j, t: [a, b, cc] });
        }
      });
      if (!mixto) return capa(cand);
      if (ANION.has(si.e)) return cand.filter((x) => ANION.has(S[x.j].e) && x.d <= 2.1);
      return capa(cand.filter((x) => ANION.has(S[x.j].e)));
    });
    nbCache.set(id, res);
    return res;
  }

  /* ---------- Visor 3D ---------- */
  let visor = null;
  const c = {
    estilo: $('#c-estilo'), super: $('#c-super'), celda: $('#c-celda'), spin: $('#c-spin'),
    msg: $('#visor-msg'), ley: $('#d-leyenda'), atomos: $('#d-atomos'),
  };

  function crearVisor() {
    if (visor) return visor;
    if (!window.$3Dmol) return null;
    visor = window.$3Dmol.createViewer($('#visor'), { antialias: true });
    visor.setBackgroundColor(0xffffff, 0); // transparente: se ve el fondo del tema (claro u oscuro)
    return visor;
  }

  function dibujar(m, est) {
    const v = crearVisor();
    if (!v) { c.msg.textContent = 'No se pudo cargar el visor 3D (3Dmol.js). Revise su conexión a internet.'; c.msg.hidden = false; return; }
    c.msg.hidden = true;
    let n = parseInt(c.super.value, 10);
    const estimado = (k) => est.sites.length * (k + 1) ** 3;
    for (const o of c.super.options) o.disabled = estimado(parseInt(o.value, 10)) > 2500;
    while (n > 1 && estimado(n) > 2500) n--;
    c.super.value = String(n);

    const L = vectores(est.lat);
    const S = sitios(est);
    const atomos = atomosCelda(S, n);
    const xyz = `${atomos.length}\n${m.f}\n` + atomos.map((a) => { const p = cart(L, a.g); return `${a.e} ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`; }).join('\n');

    // Enlaces propios (en vez de la detección automática, que une catión con catión en sólidos iónicos)
    const nb = vecinos(m.id, est, S);
    const clave = (g) => g.map((x) => Math.round(x * 1000)).join(',');
    const idx = new Map(atomos.map((a, k) => [clave(a.g), k]));
    const enlaces = atomos.map(() => []);
    atomos.forEach((a, k) => {
      for (const x of nb[a.s]) {
        const f = S[x.j].f;
        const k2 = idx.get(clave([f[0] + x.t[0] + a.T[0], f[1] + x.t[1] + a.T[1], f[2] + x.t[2] + a.T[2]]));
        if (k2 !== undefined && k2 !== k && !enlaces[k].includes(k2)) { enlaces[k].push(k2); enlaces[k2].push(k); }
      }
    });

    v.removeAllModels(); v.removeAllShapes();
    const modelo = v.addModel(xyz, 'xyz');
    modelo.selectedAtoms({}).forEach((at, k) => { at.bonds = enlaces[k] || []; at.bondOrder = (enlaces[k] || []).map(() => 1); });
    const st = c.estilo.value;
    if (st === 'bolas') v.setStyle({}, { stick: { radius: 0.14, colorscheme: 'Jmol' }, sphere: { scale: 0.32, colorscheme: 'Jmol' } });
    else if (st === 'compacto') v.setStyle({}, { sphere: { scale: 0.75, colorscheme: 'Jmol' } });
    else v.setStyle({}, { stick: { radius: 0.12, colorscheme: 'Jmol' } });

    if (c.celda.checked) {
      const P = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cart(L, [i & 1, (i >> 1) & 1, (i >> 2) & 1]));
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
        if (i & bit) continue;
        const a = P[i], b = P[i | bit];
        v.addCylinder({ start: { x: a[0], y: a[1], z: a[2] }, end: { x: b[0], y: b[1], z: b[2] }, radius: 0.05, color: '#c0643a', fromCap: 1, toCap: 1 });
      }
    }
    v.zoomTo(); v.rotate(25, 'x'); v.rotate(-35, 'y'); v.render(); // vista oblicua: de frente se ven las capas apiladas
    v.spin(c.spin.checked ? 'y' : false);

    const J = window.$3Dmol.elementColors.Jmol;
    const elems = [...new Set(est.sites.map((s) => s[0]))];
    c.ley.innerHTML = elems.map((e) => `<span><i style="background:#${(J[e] ?? 0xcccccc).toString(16).padStart(6, '0')}"></i>${esc(e)}</span>`).join('');
    c.atomos.textContent = `La celda contiene ${est.sites.length} átomos propios; en pantalla ves ${atomos.length} porque los de vértices, aristas y caras se repiten en el borde con las celdas vecinas.`;
  }

  ['change'].forEach((ev) => {
    c.estilo.addEventListener(ev, redibujar);
    c.super.addEventListener(ev, redibujar);
    c.celda.addEventListener(ev, redibujar);
  });
  c.spin.addEventListener('change', () => visor && visor.spin(c.spin.checked ? 'y' : false));

  function redibujar() {
    if (!seleccionado || !window.ESTRUCTURAS) return;
    const m = BY_ID.get(seleccionado), est = window.ESTRUCTURAS[seleccionado];
    if (m && est) dibujar(m, est);
  }

  /* ---------- Detalle ---------- */
  function claseGap(g) {
    if (g < 0.1) return 'conductor (gap ≈ 0)';
    if (g < 3) return 'semiconductor';
    return 'aislante / gap ancho';
  }

  async function abrir(id, desdeHash = false) {
    const m = BY_ID.get(id);
    if (!m) return;
    seleccionado = id;
    marcarFila(id);
    $('#det-vacio').hidden = true; $('#det-cont').hidden = false;
    $('#detalle').classList.add('abierto');
    if (!desdeHash) history.replaceState(null, '', '#' + encodeURIComponent(id));

    $('#d-formula').innerHTML = fmtF(m.f);
    $('#d-sub').textContent = `${SIST[m.cs] || m.cs} · grupo espacial ${m.sg || '—'}`;
    const badges = [
      `<span class="chip">${claseGap(m.g)}</span>`,
      m.d === 1 ? '<span class="chip">gap directo</span>' : m.d === 0 ? '<span class="chip">gap indirecto</span>' : '',
      `<span class="chip">${m.ex ? 'observado experimentalmente' : 'solo predicho (teórico)'}</span>`,
    ];
    $('#d-badges').innerHTML = badges.join('');

    const mp = $('#d-mp');
    const esMP = /^mp-\d+$/.test(m.id);
    mp.hidden = !esMP;
    if (esMP) mp.href = `https://next-gen.materialsproject.org/materials/${encodeURIComponent(m.id)}`;

    c.msg.textContent = 'Cargando estructura…'; c.msg.hidden = false;
    let est = null;
    try { est = (await cargarEstructuras())[id]; } catch (e) { c.msg.textContent = 'No se pudo cargar la estructura (data/estructuras.js).'; }
    if (seleccionado !== id) return;
    if (est) {
      c.super.value = est.sites.length <= 4 ? '2' : '1'; // celdas muy pequeñas se ven mejor repetidas
      datos(m, est);
      explicacion(m, est);
      dibujar(m, est);
      if (visor) setTimeout(() => { visor.resize(); visor.zoomTo(); visor.render(); }, 30); // zoomTo conserva la rotación
    } else if (!c.msg.hidden && c.msg.textContent === 'Cargando estructura…') {
      c.msg.textContent = 'Este material no tiene estructura en el archivo de datos.';
    }
  }

  function datos(m, est) {
    const [a, b, cc, al, be, ga] = est.lat;
    $('#d-datos').innerHTML = `
      <dt>Bandgap (DFT)</dt><dd>${num(m.g)} eV</dd>
      <dt>Energía sobre el hull</dt><dd>${num(m.eh, 3)} eV/átomo</dd>
      <dt>Átomos en la celda</dt><dd>${est.sites.length}</dd>
      <dt>a, b, c (Å)</dt><dd>${num(a, 3)}, ${num(b, 3)}, ${num(cc, 3)}</dd>
      <dt>α, β, γ (°)</dt><dd>${num(al, 1)}, ${num(be, 1)}, ${num(ga, 1)}</dd>
      <dt>ID</dt><dd>${esc(m.id)}</dd>`;
  }

  function explicacion(m, est) {
    const estab = (m.eh || 0) < 0.001 ? 'está sobre el hull (0 eV/átomo): es termodinámicamente estable frente a sus competidores' : `está ${num(m.eh * 1000, 0)} meV/átomo sobre el hull: puede ser metaestable`;
    $('#d-explica').innerHTML = `
      <p><strong>Sistema ${esc((SIST[m.cs] || m.cs).toLowerCase())}:</strong> la celda cumple ${RESTR[m.cs] || '—'}. Compare con los parámetros de arriba.</p>
      <p><strong>Bandgap:</strong> ${num(m.g)} eV calculados con DFT, así que el valor experimental probablemente es mayor. Clasificación orientativa: ${claseGap(m.g)}.</p>
      <p><strong>Estabilidad:</strong> este material ${estab}.</p>`;
  }

  function cerrar() {
    $('#detalle').classList.remove('abierto');
    if (visor) visor.spin(false);
    c.spin.checked = false;
    if (matchMedia('(min-width: 1300px)').matches) return;
    const previo = el.tbody.querySelector('tr.sel .fila-btn');
    seleccionado = null;
    marcarFila(null);
    if (previo && document.body.contains(previo)) previo.focus(); // devolver el foco a la fila de origen
    history.replaceState(null, '', location.pathname + location.search);
  }
  $('#btn-cerrar').addEventListener('click', cerrar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#detalle').classList.contains('abierto') && !matchMedia('(min-width: 1300px)').matches) cerrar(); });

  /* ---------- CIF y enlace ---------- */
  $('#btn-cif').addEventListener('click', async () => {
    const m = BY_ID.get(seleccionado); const est = window.ESTRUCTURAS && window.ESTRUCTURAS[seleccionado];
    if (!m || !est) return;
    const [a, b, cc, al, be, ga] = est.lat;
    const cont = {};
    const filas = est.sites.map(([e, x, y, z]) => { cont[e] = (cont[e] || 0) + 1; return `${e}${cont[e]} ${e} ${x.toFixed(5)} ${y.toFixed(5)} ${z.toFixed(5)}`; });
    const cif = `data_${m.f.replace(/[^A-Za-z0-9]/g, '')}\n_cell_length_a ${a}\n_cell_length_b ${b}\n_cell_length_c ${cc}\n_cell_angle_alpha ${al}\n_cell_angle_beta ${be}\n_cell_angle_gamma ${ga}\n_symmetry_space_group_name_H-M 'P 1'\n_symmetry_Int_Tables_number 1\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n${filas.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([cif], { type: 'chemical/x-cif' }));
    const a2 = Object.assign(document.createElement('a'), { href: url, download: `${m.f}_${m.id}.cif` });
    document.body.appendChild(a2); a2.click(); a2.remove(); URL.revokeObjectURL(url);
  });

  $('#btn-enlace').addEventListener('click', async (e) => {
    const b = e.currentTarget, t = b.textContent;
    try { await navigator.clipboard.writeText(location.href); b.textContent = 'Enlace copiado'; }
    catch { b.textContent = 'Copie la URL del navegador'; }
    setTimeout(() => { b.textContent = t; }, 1800);
  });

  /* ---------- Guía y avisos ---------- */
  const guia = $('#guia');
  $('#btn-guia').addEventListener('click', () => guia.showModal());
  $('#btn-guia-2').addEventListener('click', () => { guia.showModal(); $('#g-dft').scrollIntoView(); });

  /* ---------- Arranque ---------- */
  function iniciar() {
    if (META.ejemplo) { $('#aviso-ejemplo').hidden = false; $('#n-ejemplo').textContent = DATA.length; }
    $('#pie-datos').textContent = META.ejemplo ? '(Versión con datos de ejemplo.)' : `Instantánea de ${META.fecha || 's/f'}, ${DATA.length.toLocaleString('es')} materiales.`;
    construirControles();
    if (matchMedia('(max-width: 860px)').matches) $('#filtros').open = false;
    aplicar();
    window.addEventListener('load', () => cargarEstructuras().catch(() => {}));
    const desdeHash = decodeURIComponent(location.hash.slice(1));
    if (desdeHash && BY_ID.has(desdeHash)) {
      // Esperar a 3Dmol (script diferido) antes de dibujar
      let intentos = 0;
      const esperar = () => (window.$3Dmol || ++intentos > 100 ? abrir(desdeHash, true) : setTimeout(esperar, 50));
      esperar();
    }
  }
  iniciar();
  window.__visor = () => visor; // para depurar desde la consola
  window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && BY_ID.has(h) && h !== seleccionado) abrir(h, true); });
})();
