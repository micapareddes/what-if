(() => {
  "use strict";

  const CATEGORIES = window.ESE_CATEGORIES;
  const NAMES = window.ESE_NAMES;
  const REFS = window.ESE_REFERENCES;
  const IMG_DIR = "color-palette/";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Duração (ms) e quantidade de itens que passam em cada coluna.
  // Referência e imagem compartilham os mesmos valores: giram juntas.
  const TIMING = {
    category: { duration: 2100, steps: 16 },
    name:     { duration: 2800, steps: 22 },
    ref:      { duration: 3500, steps: 28 },
  };

  const $ = (sel) => document.querySelector(sel);
  const cols = {
    category: $('[data-col="category"] .strip'),
    name:     $('[data-col="name"] .strip'),
    ref:      $('[data-col="ref"] .strip'),
    image:    $('[data-col="image"] .strip'),
  };
  const button = $(".spin");

  let spinning = false;
  let current = null;      // { category, name, ref }

  // ---------- utilidades ----------
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randOther = (arr, avoid) => {
    if (arr.length < 2) return arr[0];
    let v;
    do { v = rand(arr); } while (v === avoid);
    return v;
  };
  // sequência aleatória sem repetir dois itens seguidos
  const sequence = (arr, n, first) => {
    const out = [];
    let prev = first;
    for (let i = 0; i < n; i++) { prev = randOther(arr, prev); out.push(prev); }
    return out;
  };

  const sparkSVG = '<svg class="spark" aria-hidden="true"><use href="#spark"/></svg>';

  function textItem(text, placeholder = false) {
    const el = document.createElement("div");
    el.className = "item" + (placeholder ? " item--placeholder" : "");
    el.textContent = text;
    return el;
  }

  function imageItem(ref) {
    const el = document.createElement("div");
    el.className = "item";
    if (!ref) { el.innerHTML = sparkSVG; return el; }
    const img = document.createElement("img");
    img.src = IMG_DIR + ref.file;
    img.alt = ref.name;
    img.decoding = "async";
    img.draggable = false;
    el.appendChild(img);
    return el;
  }

  // Pré-carrega todas as imagens para o giro não piscar.
  REFS.forEach((r) => { const i = new Image(); i.src = IMG_DIR + r.file; });

  // ---------- curva de movimento ----------
  // Velocidade: acelera suave no início, depois desacelera longamente até zero.
  // Integrada numericamente em uma tabela → posição normalizada 0..1.
  const LUT = (() => {
    const N = 400, accel = 0.14, pts = [0];
    let acc = 0;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      let v;
      if (t < accel) { const s = t / accel; v = s * s * (3 - 2 * s); }
      else { v = Math.pow(1 - (t - accel) / (1 - accel), 2.6); }
      acc += v;
      pts.push(acc);
    }
    return pts.map((p) => p / acc);
  })();
  const ease = (t) => {
    const x = Math.min(Math.max(t, 0), 1) * (LUT.length - 1);
    const i = Math.floor(x), f = x - i;
    return i >= LUT.length - 1 ? 1 : LUT[i] + (LUT[i + 1] - LUT[i]) * f;
  };
  // pequeno "assentamento" no final, como uma roleta que encaixa
  const settle = (u) => { const s = 1 - u; return s * s * (1 + 2.2 * u); };

  // ---------- render ----------
  function showStatic(strip, el) {
    strip.classList.remove("spinning");
    strip.style.transform = "";
    strip.style.filter = "";
    strip.replaceChildren(el);
  }

  function initial() {
    showStatic(cols.category, textItem("?", true));
    showStatic(cols.name, textItem("?", true));
    showStatic(cols.ref, textItem("?", true));
    showStatic(cols.image, imageItem(null));
  }

  // Anima um ou mais strips em sincronia (mesmo progresso).
  function runReel(strips, builders, { duration, steps }) {
    return new Promise((resolve) => {
      const sets = strips.map((strip, k) => {
        const win = strip.parentElement;
        const h = win.clientHeight;
        strip.style.setProperty("--item-h", h + "px");
        strip.classList.add("spinning");
        const els = builders[k]();
        strip.replaceChildren(...els);
        return { strip, h, distance: (els.length - 1) * h, last: els[els.length - 1] };
      });

      const overshoot = 0.16; // fração da altura de um item
      const settleMs = reduceMotion ? 0 : 340;
      const start = performance.now();
      let prevY = sets.map(() => 0);

      function frame(now) {
        const el = now - start;
        let done = false;
        sets.forEach((s, k) => {
          let y;
          if (el < duration) {
            y = ease(el / duration) * (s.distance + overshoot * s.h);
          } else if (el < duration + settleMs) {
            const u = (el - duration) / settleMs;
            y = s.distance + overshoot * s.h * settle(u);
          } else {
            y = s.distance;
            done = true;
          }
          s.strip.style.transform = `translate3d(0, ${-y}px, 0)`;
          // desfoque leve proporcional à velocidade
          if (!reduceMotion) {
            const v = Math.abs(y - prevY[k]) / s.h;
            s.strip.style.filter = v > 0.08 ? `blur(${Math.min(v * 3.2, 2.2).toFixed(2)}px)` : "";
          }
          prevY[k] = y;
        });
        if (done) {
          sets.forEach((s) => showStatic(s.strip, s.last));
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- tema a partir da imagem (modo teste) ----------
  // Cada referência tem uma paleta extraída da imagem (data/references.js).
  // Aqui ela vira papéis de cor da interface, garantindo contraste legível.
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const rgbToHsl = ([r, g, b]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  };
  const hslToHex = ([h, s, l]) => {
    const f = (n) => {
      const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const lum = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // versão clara (fundo) de uma cor, mantendo o matiz
  const tint = (hex, l) => { const [h, s] = rgbToHsl(hexToRgb(hex)); return hslToHex([h, s < 0.12 ? s : clamp(s * 1.15, 0.42, 0.85), l]); };
  // escurece até ter contraste suficiente contra o fundo
  const readable = (hex, against, min) => {
    let [h, s, l] = rgbToHsl(hexToRgb(hex));
    let out = hex;
    while (contrast(out, against) < min && l > 0.04) { l -= 0.03; s = Math.min(1, s + 0.01); out = hslToHex([h, s, l]); }
    return out;
  };
  const vivid = (hex) => { const [, s, l] = rgbToHsl(hexToRgb(hex)); return s * (1 - Math.abs(l - 0.45) * 1.3); };
  const hueDist = (a, b) => { const d = Math.abs(rgbToHsl(hexToRgb(a))[0] - rgbToHsl(hexToRgb(b))[0]); return Math.min(d, 1 - d); };

  // escolhe a cor mais viva e distinta do fundo, que fique legível sobre ele
  function pickInk(pal, bg, min, avoid = []) {
    const ranked = [...pal].sort((a, b) =>
      (vivid(b) + Math.min(...avoid.map((x) => hueDist(b, x)), 0.5)) -
      (vivid(a) + Math.min(...avoid.map((x) => hueDist(a, x)), 0.5)));
    return readable(ranked[0], bg, min);
  }

  function themeFrom(pal) {
    if (!pal || !pal.length) return null;
    const P = [...pal];
    while (P.length < 4) P.push(P[P.length - 1]);
    const byVivid = [...P].sort((a, b) => vivid(b) - vivid(a));
    const lightest = [...P].sort((a, b) => rgbToHsl(hexToRgb(b))[2] - rgbToHsl(hexToRgb(a))[2])[0];

    const bg = tint(lightest, 0.94);
    const ink = readable(byVivid[0], bg, 3.4); // texto grande: título e botão
    const [ih, is, il] = rgbToHsl(hexToRgb(ink));

    // quatro superfícies, com cores diferentes da paleta
    const s1 = byVivid[1 % byVivid.length], s2 = byVivid[2 % byVivid.length], s3 = byVivid[3 % byVivid.length];
    const c1bg = tint(s1, 0.8);
    const c2a = tint(s2, 0.82);
    const c3bg = tint(s3, 0.84);

    const strong = byVivid[0];
    const [sh, ss] = rgbToHsl(hexToRgb(strong));
    const c4a = hslToHex([sh, clamp(ss, 0.35, 0.9), 0.42]);
    const c4b = tint(byVivid[1 % byVivid.length], 0.72);

    return {
      "bg": bg,
      "ink": ink,
      "ink-shadow": hslToHex([ih, is, Math.max(0.05, il - 0.14)]),
      "c1-bg": c1bg,
      "c1-ink": pickInk(P, c1bg, 3.6, [s1]),
      "c2-a": c2a,
      "c2-b": bg,
      "c2-ink": pickInk(P, c2a, 3.6, [s2, ink]),
      "c3-bg": c3bg,
      "c3-ink": pickInk(P, c3bg, 4, [s3]),
      "c4-a": c4a,
      "c4-b": c4b,
      "c4-ink": bg,
      "frame": bg,
    };
  }

  function applyTheme(ref) {
    const t = themeFrom(ref && ref.palette);
    if (!t) return;
    const root = document.documentElement.style;
    Object.entries(t).forEach(([k, v]) => root.setProperty(`--${k}`, v));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
  }

  // ---------- sorteio ----------
  // Sorteio em "baralho": cada conjunto é embaralhado e consumido carta a carta.
  // Tudo sai uma vez antes de qualquer item repetir; ao fim, embaralha de novo.
  // O estado fica salvo no navegador, então vale também entre visitas.
  const STORE = "ese-bags-v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { saved = {}; }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch {} };

  const randInt = (n) => {
    if (window.crypto && crypto.getRandomValues) {
      const lim = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
      do { crypto.getRandomValues(buf); } while (buf[0] >= lim);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  };
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // ids: lista de identificadores estáveis do conjunto
  function nextFrom(bagName, ids) {
    const all = new Set(ids);
    const bag = saved[bagName] || { left: [], used: [] };
    // sincroniza com os dados atuais: remove apagados, inclui itens novos na rodada atual
    bag.left = bag.left.filter((id) => all.has(id));
    bag.used = bag.used.filter((id) => all.has(id));
    const known = new Set([...bag.left, ...bag.used]);
    ids.forEach((id) => { if (!known.has(id)) bag.left.splice(randInt(bag.left.length + 1), 0, id); });

    if (!bag.left.length) {
      const last = bag.used[bag.used.length - 1];
      bag.left = shuffle(ids);
      // não começa a nova rodada repetindo o último sorteado
      if (bag.left.length > 1 && bag.left[0] === last) bag.left.push(bag.left.shift());
      bag.used = [];
    }
    const id = bag.left.shift();
    bag.used.push(id);
    saved[bagName] = bag;
    return id;
  }

  const refByFile = new Map(REFS.map((r) => [r.file, r]));

  function draw() {
    const category = nextFrom("categories", CATEGORIES);
    const pool = NAMES[category] && NAMES[category].length ? NAMES[category] : ["Sem nome"];
    const name = nextFrom("names:" + category, pool);
    const ref = refByFile.get(nextFrom("refs", REFS.map((r) => r.file)));
    persist();
    return { category, name, ref };
  }

  const allNames = Object.values(NAMES).flat();
  const scale = (t) => reduceMotion
    ? { duration: Math.round(t.duration * 0.35), steps: Math.max(4, Math.round(t.steps * 0.3)) }
    : t;

  async function spin() {
    if (spinning) return;
    spinning = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    const prev = current;
    const next = draw();

    const tCat = scale(TIMING.category);
    const tName = scale(TIMING.name);
    const tRef = scale(TIMING.ref);

    // Primeira posição = o que já está na tela, para o giro começar sem salto.
    const catSeq = sequence(CATEGORIES, tCat.steps, prev && prev.category);
    const nameSeq = sequence(allNames, tName.steps, prev && prev.name);
    const refSeq = sequence(REFS, tRef.steps, prev && prev.ref);

    const firstText = (v) => (v ? textItem(v) : textItem("?", true));

    await Promise.all([
      runReel([cols.category], [() => [
        firstText(prev && prev.category), ...catSeq.map((c) => textItem(c)), textItem(next.category),
      ]], tCat),
      runReel([cols.name], [() => [
        firstText(prev && prev.name), ...nameSeq.map((n) => textItem(n)), textItem(next.name),
      ]], tName),
      // Referência + imagem: mesma sequência, mesmo tempo — sempre vinculadas.
      runReel([cols.ref, cols.image], [
        () => [firstText(prev && prev.ref.name), ...refSeq.map((r) => textItem(r.name)), textItem(next.ref.name)],
        () => [imageItem(prev && prev.ref), ...refSeq.map((r) => imageItem(r)), imageItem(next.ref)],
      ], tRef),
    ]);

    applyTheme(next.ref);
    current = next;
    spinning = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }

  button.addEventListener("click", spin);
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement !== button && !e.repeat) {
      e.preventDefault();
      spin();
    }
  });

  initial();
})();
