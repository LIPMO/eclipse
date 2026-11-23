// Traduction du jeu (français → anglais), changeable à chaud dans PARAMÈTRES → Langue.
// Le texte d'origine est en français dans le code ; quand l'anglais est choisi, tout ce qui s'affiche
// (menus, partie, messages du serveur) est traduit à la volée à partir de /i18n/en.json.
// En français, aucun observateur n'est actif : zéro coût.
import { profile } from './store.js';

const ATTRS = ['placeholder', 'title', 'aria-label'];
const SEP = /( · | — | – | : | \| |\n)/;
const LETTER = /[A-Za-zÀ-ÿ]/;
let dict = null, upper = null, num = null, patterns = [], lang = 'fr', observer = null, loading = null;
const cache = new Map();

export const getLang = () => lang;

function build(data) {
  dict = new Map(); upper = new Map(); num = new Map();
  for (const [k, v] of Object.entries(data.strings || {})) {
    dict.set(k, v);
    const K = k.toUpperCase(); if (K !== k && !dict.has(K)) upper.set(K, v.toUpperCase());
    // variante avec les nombres remplacés par # (quêtes, compteurs…)
    const nk = k.replace(/\d+/g, '#'), nv = v.replace(/\d+/g, '#');
    if (nk !== k && (k.match(/\d+/g) || []).length === (v.match(/\d+/g) || []).length) { if (!num.has(nk)) num.set(nk, nv); }
  }
  patterns = (data.patterns || []).map(([re, out]) => [new RegExp(re), out]);
  cache.clear();
}

// recherche directe (exacte, majuscules, nombres remplacés par #)
function look(core) {
  let v = dict.get(core) ?? upper.get(core);
  if (v !== undefined) return v;
  if (/\d/.test(core)) {
    const nums = [];
    const key = core.replace(/\d+/g, x => { nums.push(x); return '#'; });
    const tpl = dict.get(key) ?? num.get(key) ?? upper.get(key);
    if (tpl !== undefined) { let i = 0; return tpl.replace(/#/g, () => nums[i++] ?? '#'); }
  }
  return undefined;
}
// modèles de phrases : $1 = morceau gardé tel quel (pseudo…), $t1 = morceau traduit à son tour
function viaPattern(core) {
  for (const [re, rep] of patterns) {
    const g = core.match(re);
    if (g) return rep.replace(/\$(t?)(\d)/g, (_, tt, i) => (tt ? tr(g[+i] ?? '') : g[+i] ?? ''));
  }
  return undefined;
}
function piece(core) {
  if (!LETTER.test(core)) return undefined;
  let v = look(core); if (v !== undefined) return v;
  // ponctuation finale (« Texte : », « Texte ! », « Texte. »)
  const pm = core.match(/^(.*?)(\s?[:!?.…]+)$/);
  if (pm && pm[1]) { v = look(pm[1]); if (v !== undefined) return v + pm[2].trim(); }
  // symbole ou émoji au début (« ✔ PRÊT », « ⚠ … »)
  const sm = core.match(/^([^A-Za-zÀ-ÿ0-9«“"(]+)(.+)$/);
  if (sm) { v = look(sm[2]); if (v !== undefined) return sm[1] + v; }
  return viaPattern(core);
}
export function tr(s) {
  if (lang === 'fr' || !dict || typeof s !== 'string' || !LETTER.test(s)) return s;
  const c = cache.get(s); if (c !== undefined) return c;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2];
  let out = piece(core);
  // phrase composée : on traduit chaque morceau séparément (« MANCHE 3 · ATTAQUE »)
  if (out === undefined && SEP.test(core)) {
    let changed = false;
    const parts = core.split(SEP).map((p, i) => {
      if (i % 2) return p === ' : ' ? ': ' : p;
      const ps = p.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const tt = piece(ps[2]);
      if (tt !== undefined && tt !== ps[2]) { changed = true; return ps[1] + tt + ps[3]; }
      return p;
    });
    if (changed) out = parts.join('');
  }
  const res = out === undefined ? s : m[1] + out + m[3];
  if (cache.size > 6000) cache.clear();
  cache.set(s, res);
  return res;
}
export const t = tr;

// ---------- application au DOM ----------
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
function skipEl(el) { return !el || SKIP.has(el.tagName) || el.closest?.('[translate="no"], .notranslate'); }
function doText(n) {
  const v = n.nodeValue;
  if (v === n._en) return;
  if (!LETTER.test(v)) { n._fr = undefined; n._en = undefined; return; }
  if (skipEl(n.parentElement)) return;
  const out = tr(v);
  n._fr = v;
  if (out !== v) { n._en = out; n.nodeValue = out; } else n._en = undefined;
}
function doAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const v = el.getAttribute(a);
    el._i18n ||= {};
    const st = el._i18n[a];
    if (st && v === st.en) continue;
    const out = tr(v);
    el._i18n[a] = { fr: v, en: out };
    if (out !== v) el.setAttribute(a, out);
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skipEl(root)) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = w.nextNode(); }
}
function restore() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.currentNode;
  while (n) {
    if (n.nodeType === 3) { if (n._en !== undefined && n.nodeValue === n._en) n.nodeValue = n._fr; n._en = undefined; n._fr = undefined; }
    else if (n._i18n) { for (const [a, st] of Object.entries(n._i18n)) if (n.getAttribute(a) === st.en) n.setAttribute(a, st.fr); n._i18n = null; }
    n = w.nextNode();
  }
  if (document.title !== docTitle.fr && docTitle.fr) document.title = docTitle.fr;
}
const docTitle = { fr: '' };
function start() {
  if (observer) return;
  observer = new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
      else for (const n of r.addedNodes) walk(n);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function stop() { observer?.disconnect(); observer = null; }

async function load() {
  if (dict) return;
  loading ||= fetch('/i18n/en.json').then(r => r.json()).then(build).catch(e => { console.warn('Traduction indisponible', e); loading = null; });
  await loading;
}
export async function setLang(l) {
  l = l === 'en' ? 'en' : 'fr';
  if (l === 'en') await load();
  if (l === 'en' && !dict) l = 'fr';
  lang = l;
  document.documentElement.lang = l;
  if (l === 'fr') { stop(); restore(); }
  else { docTitle.fr ||= document.title; document.title = tr(docTitle.fr); walk(document.body); start(); }
  document.dispatchEvent(new CustomEvent('lang-changed', { detail: { lang: l } }));
}

// boîtes de dialogue du navigateur
for (const fn of ['alert', 'confirm', 'prompt']) {
  const orig = window[fn];
  if (typeof orig === 'function') window[fn] = (msg, ...rest) => orig.call(window, tr(String(msg ?? '')), ...rest);
}

document.addEventListener('settings-changed', e => { const k = e.detail?.key; if ((k === 'lang' || k === '*') && (profile.settings.lang || 'fr') !== lang) setLang(profile.settings.lang); });
if ((profile.settings.lang || 'fr') !== 'fr') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setLang(profile.settings.lang));
  else setLang(profile.settings.lang);
}
