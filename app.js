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
  let lastKey = "";

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

  // ---------- sorteio ----------
  function draw() {
    let pick, key, tries = 0;
    do {
      const category = randOther(CATEGORIES, current && current.category);
      const pool = NAMES[category] && NAMES[category].length ? NAMES[category] : ["Sem nome"];
      const name = rand(pool);
      const ref = randOther(REFS, current && current.ref);
      pick = { category, name, ref };
      key = `${category}|${name}|${ref.file}`;
    } while (key === lastKey && ++tries < 20);
    lastKey = key;
    return pick;
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
