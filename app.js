import { makeWorld, checkAll, checkRequest, clock, mins, dayLabel, DOC_NAMES } from "./check.js?v=2";
import { tables, messages, pasteExample, SENT_AT } from "./samples.js?v=2";

const world = makeWorld(tables);
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
};
const glyph = { pass: "check", fail: "cross", none: "none" };
const wide = window.matchMedia("(min-width: 960px)");
const timeOf = (iso) => clock(+iso.slice(11, 13) * 60 + +iso.slice(14, 16));
const typeName = (r) => (r.type ? world.types[r.type].name : "Type unclear");

let results = checkAll(world, messages);
let openId = null;
let firstRender = true;
const approved = new Set();

function draw(node) {
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("drawn")));
}

/** A line with the referenced ranges underlined in place. */
function marked(text, ranges, csv = false) {
  const frag = document.createDocumentFragment();
  const show = (t) => (csv ? t.replace(/,/g, ", ") : t);
  let at = 0;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.start < at) continue;
    frag.append(show(text.slice(at, r.start)), el("span", `u ${r.tone || "pass"}`, show(text.slice(r.start, r.end))));
    at = r.end;
  }
  frag.append(show(text.slice(at)));
  return frag;
}

const ORDER = ["msg", "patients", "types", "doctors", "roster", "appts", "export", "holidays", "rules", "reading"];
const TABLES = ["patients", "types", "doctors", "roster", "appts", "export", "holidays"];

/** Source lines, grouped, each with its underlined part. */
function sources(refs, msgText, tone = "pass") {
  const box = el("div", "srcs");
  const by = new Map();
  for (const r of refs) {
    if (!r || r.doc === "msg") continue;
    const k = `${r.doc}:${r.line}`;
    if (!by.has(k)) by.set(k, { doc: r.doc, line: r.line, ranges: [] });
    by.get(k).ranges.push({ start: r.start, end: r.end, tone: r.tone || tone });
  }
  for (const s of [...by.values()].sort((a, b) => ORDER.indexOf(a.doc) - ORDER.indexOf(b.doc) || a.line - b.line)) {
    const f = el("div", "src");
    const isTable = TABLES.includes(s.doc);
    const label = isTable ? `${DOC_NAMES[s.doc]}, row ${s.doc === "export" ? s.line + 1 : s.line}` : DOC_NAMES[s.doc];
    f.append(el("p", "src-h", label));
    const p = el("p", "src-line");
    p.append(marked(world.docs[s.doc][s.line], s.ranges, isTable));
    f.append(p);
    box.append(f);
  }
  return box;
}

function calcRows(pairs) {
  const dl = el("dl", "calc");
  for (const [l, v, cls] of pairs) {
    const r = el("div", `cl-row${cls ? " " + cls : ""}`);
    r.append(el("dt", "cl-l", l), el("dd", "cl-v", v));
    dl.append(r);
  }
  return dl;
}

/** An expandable row inside a panel: a slot offered or a start time not offered. */
function subRow({ state, word, title, meta, body }) {
  const li = el("li", "row-item sub-item");
  const b = el("button", "row");
  b.type = "button";
  b.setAttribute("aria-expanded", "false");
  const st = el("span", `status st-${state}`);
  st.append(icon(glyph[state]), el("span", null, word));
  const val = el("span", "val");
  val.append(el("b", null, title), el("span", "meta", meta));
  const chev = icon("chev");
  chev.classList.add("chev");
  b.append(st, val, chev);
  let ev = null;
  b.addEventListener("click", () => {
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    if (open) { ev?.remove(); ev = null; return; }
    ev = el("div", "evidence enter");
    ev.append(...body());
    li.append(ev);
    draw(ev);
  });
  li.append(b);
  return li;
}

function slotRow(r, s, word = "Offer") {
  const T = world.types[s.type];
  const doc = world.doctors.find((d) => d.short === s.doctor).name;
  return subRow({
    state: "pass", word,
    title: `${dayLabel(s.day)}, ${clock(s.start)}`,
    meta: `${doc}, ${T.minutes} min`,
    body: () => {
      const pairs = [
        ["Session", `${s.session.session}, ${s.session.day} ${clock(mins(s.session.start))} to ${clock(mins(s.session.end))}, ${s.session.kind}`],
        ["Fits", `${clock(s.start)} to ${clock(s.end)}${T.buffer ? `, then ${T.buffer} min buffer` : ""}, inside the session`],
        ["Before it", s.before ? `${s.before.id} ends ${clock(mins(s.before.end))}${world.types[s.before.type].buffer ? `, buffer to ${clock(mins(s.before.end) + world.types[s.before.type].buffer)}` : ""}` : "Nothing booked"],
        ["After it", s.after ? `${s.after.id} starts ${clock(mins(s.after.start))}` : "Nothing booked"],
      ];
      for (const c of s.cancelled) pairs.push(["Cancelled", `${c.id} was here. Cancelled, so not counted.`]);
      const h = Math.floor(s.lead / 60), m = s.lead % 60;
      pairs.push(["Notice", `${h} h${m ? ` ${m} min` : ""} after the message`]);
      const refs = [s.refs.session, s.refs.type];
      for (const a of [s.before, s.after]) if (a) refs.push({ doc: "appts", line: a._line, start: 0, end: world.docs.appts[a._line].length });
      for (const a of s.cancelled) refs.push({ doc: "appts", line: a._line, start: 0, end: world.docs.appts[a._line].length, tone: "none" });
      const rules = ["R1", "R2", "R3", "R4"].map((id) => {
        const i = world.docs.rules.findIndex((l) => l.startsWith(id + " "));
        return { doc: "rules", line: i, start: 0, end: world.docs.rules[i].length };
      });
      return [calcRows(pairs), el("p", "ev-h", "The rows and rules it was checked against"), sources([...refs, ...rules])];
    },
  });
}

function blockedRow(b) {
  return subRow({
    state: "fail", word: "No",
    title: `${dayLabel(b.day)}, ${clock(b.start)}`,
    meta: b.why,
    body: () => [sources(b.refs, null, "fail")],
  });
}

/** Everything about one request. */
function detail(r, { own = false } = {}) {
  const box = el("div", "evidence");
  box.append(el("p", "side-h", own ? "Your message" : `WhatsApp from ${r.name}, ${timeOf(r.msg.at)}`));
  const titleText = r.state === "pass" ? `${r.offered.length} slot${r.offered.length === 1 ? "" : "s"} to offer` : r.kind === "ask" ? "Ask which day" : r.kind === "doctor" ? "Doctor not found" : r.kind === "holiday" ? "Clinic closed" : r.kind === "noslot" ? "No slot fits" : r.kind === "unread" ? "Nothing read" : r.state === "fail" ? "Held for the front desk" : "Ask the patient";
  box.append(el("p", `side-title st-${r.state}`, titleText));

  if (r.why) {
    const why = el("p", "reason");
    const g = icon(glyph[r.state]);
    g.style.color = `var(--${r.state})`;
    why.append(g, el("span", null, r.why));
    box.append(why);
  }

  box.append(el("p", "ev-h", own ? "What you wrote" : "What they wrote"));
  const badMsg = new Set(r.whyRefs.filter((x) => x.doc === "msg").map((x) => x.start));
  const q = el("p", "quote");
  q.append(marked(r.msg.text, r.read.refs.map((x) => ({ ...x, tone: badMsg.has(x.start) ? r.state : "pass" }))));
  box.append(q);
  if (!r.read.refs.length) box.append(el("p", "muted-line", "No word in it was read."));

  // the result first: what can be offered, then the reply
  for (const rd of r.readings) {
    const label = rd.label ? ` if it is ${rd.label}` : "";
    if (rd.offered?.length) {
      box.append(el("p", "ev-h", `Slots the rules allow${label}`));
      const ul = el("ul", "rows sub-rows");
      rd.offered.forEach((s) => ul.append(slotRow(r, s)));
      box.append(ul);
      const extra = rd.allowed.length - rd.offered.length;
      if (extra > 0) box.append(el("p", "muted-line", `${extra} more allowed later. The reply offers the earliest 3 (R10).`));
    }
  }

  box.append(el("p", "ev-h", "Reply for the front desk"));
  const reply = el("p", "reply", r.reply);
  box.append(reply);
  const act = el("div", "actions");
  if (!own) {
    const done = approved.has(r.id);
    const b = el("button", done ? "btn text" : "btn primary", done ? "Undo" : "Approve reply");
    b.type = "button";
    b.addEventListener("click", () => {
      done ? approved.delete(r.id) : approved.add(r.id);
      render({ keep: true });
    });
    act.append(b);
    if (done) {
      const p = el("p", "picked");
      p.append(icon("check"), el("span", null, "Approved. Nothing is sent from this page."));
      act.prepend(p);
    }
  } else {
    act.append(el("p", "muted-line", "Nothing is sent from this page."));
  }
  box.append(act);

  box.append(el("p", "ev-h", "Read as"));
  box.append(calcRows(r.fields.map((f) => [f.label, f.value, f.changed || f.unclear ? "flag" : ""])));

  const used = [...r.fields.flatMap((f) => f.refs), ...r.whyRefs];
  if (used.some((x) => x.doc !== "msg")) {
    box.append(el("p", "ev-h", "The rows and rules behind that"));
    box.append(sources(used, r.msg.text));
  }

  for (const n of r.notes) {
    const p = el("p", "reason note");
    const g = icon("none");
    g.style.color = "var(--muted)";
    p.append(g, el("span", null, n.text));
    box.append(p);
  }

  // then why: how it was read, the rows behind it, and every start time that was turned down
  for (const rd of r.readings) {
    const label = rd.label ? ` if it is ${rd.label}` : "";
    if (rd.blocked?.length) {
      const t = el("button", "btn text more-btn", `Start times not offered${label} (${rd.blocked.length})`);
      t.type = "button";
      t.setAttribute("aria-expanded", "false");
      const ul = el("ul", "rows sub-rows");
      ul.hidden = true;
      t.addEventListener("click", () => {
        const open = t.getAttribute("aria-expanded") === "true";
        t.setAttribute("aria-expanded", String(!open));
        if (!open && !ul.childElementCount) rd.blocked.forEach((b) => ul.append(blockedRow(b)));
        ul.hidden = open;
      });
      box.append(t, ul);
    }
  }

  return box;
}

function statusCell(r) {
  const st = el("span", `status st-${r.state}`);
  st.append(icon(glyph[r.state]), el("span", null, r.label));
  return st;
}

function render({ keep = false } = {}) {
  const pass = results.filter((r) => r.state === "pass").length;
  const sum = $("summary");
  sum.replaceChildren(
    el("span", "sum-main", `${pass} of ${results.length} get slots`),
    el("span", "sum-side muted", `${results.length - pass} held or asked back`),
  );
  const ul = el("ul", `rows${firstRender ? "" : keep ? "" : " fresh"}`);
  for (const r of results) {
    const li = el("li", "row-item");
    const b = el("button", "row");
    b.type = "button";
    b.setAttribute("aria-expanded", String(openId === r.id));
    const val = el("span", "val");
    val.append(el("b", null, r.msg.text), el("span", "meta", `${r.name}, ${typeName(r).toLowerCase()}${r.doctors?.length === 1 ? `, ${world.doctors.find((d) => d.short === r.doctors[0]).name}` : ""}`));
    const chev = icon("chev");
    chev.classList.add("chev");
    b.append(statusCell(r), val, chev);
    b.addEventListener("click", () => {
      openId = openId === r.id && !wide.matches ? null : r.id;
      render({ keep: true });
      if (!wide.matches && openId) li.scrollIntoView({ block: "nearest" });
    });
    li.append(b);
    if (openId === r.id && !wide.matches) {
      const d = detail(r);
      d.classList.add("enter");
      li.append(d);
      draw(d);
    }
    ul.append(li);
  }
  $("groups").replaceChildren(ul);

  const side = $("side");
  if (wide.matches) {
    const r = results.find((x) => x.id === openId) || results[0];
    if (!openId) openId = r.id;
    ul.querySelectorAll(".row").forEach((b, i) => b.setAttribute("aria-expanded", String(results[i].id === openId)));
    const d = detail(r);
    side.replaceChildren(d);
    draw(d);
  } else side.replaceChildren();

  const n = approved.size;
  $("approved").textContent = n ? `${n} repl${n === 1 ? "y" : "ies"} approved. Nothing is sent from this page.` : "";
  firstRender = false;
}

/* ---------- try your own ---------- */
function fillFrom() {
  const sel = $("own-from");
  for (const p of world.patients) {
    const o = el("option", null, `${p.first_name}, last saw ${world.doctors.find((d) => d.short === p.last_doctor).name}${p.referral_letter === "yes" ? ", referral on file" : ""}`);
    o.value = p.phone;
    sel.append(o);
  }
  const o = el("option", null, "A new number, no record");
  o.value = "new";
  sel.append(o);
}
function checkOwn() {
  const text = $("own-in").value.trim();
  const err = $("own-error");
  if (!text) { err.textContent = "Type a message first."; err.hidden = false; return; }
  if (text.length > 500) { err.textContent = "Keep it under 500 characters, like a chat message."; err.hidden = false; return; }
  err.hidden = true;
  const from = $("own-from").value;
  const r = checkRequest(world, { id: "own", from: from === "new" ? "+65 9••• 0000" : from, name: "Sam", at: SENT_AT, text });
  const d = detail(r, { own: true });
  d.classList.add("enter");
  $("own-out").replaceChildren(d);
  draw(d);
}

/* ---------- the tables ---------- */
function showTables() {
  const out = $("src-out");
  if (out.childElementCount) return;
  const box = el("div", "docs");
  const list = [["msg", null], ["patients"], ["types"], ["doctors"], ["roster"], ["appts"], ["export"], ["holidays"], ["rules"], ["reading"]];
  const msgDoc = el("div", "doc");
  msgDoc.append(el("p", "doc-h", `The six messages, sent Wed 18 Nov ${timeOf(messages[0].at)} to ${timeOf(messages[messages.length - 1].at)}`));
  const mb = el("div", "doc-body");
  messages.forEach((m, i) => { const p = el("p"); p.append(el("span", "ln", String(i + 1)), el("span", null, `${m.name} (${m.from}): ${m.text}`)); mb.append(p); });
  msgDoc.append(mb);
  box.append(msgDoc);
  for (const [k] of list.slice(1)) {
    const d = el("div", "doc");
    d.append(el("p", "doc-h", k === "appts" ? "Diary export, appointments" : k === "export" ? "Diary export, header" : DOC_NAMES[k]));
    const body = el("div", `doc-body${TABLES.includes(k) ? " table" : ""}`);
    world.docs[k].forEach((l, i) => {
      const p = el("p");
      p.append(el("span", "ln", TABLES.includes(k) && k !== "export" ? (i === 0 ? "" : String(i)) : String(i + 1)), el("span", null, l));
      body.append(p);
    });
    d.append(body);
    box.append(d);
  }
  out.append(box);
}

$("own-check").addEventListener("click", checkOwn);
$("own-sample").addEventListener("click", () => {
  $("own-in").value = pasteExample.text;
  $("own-from").value = pasteExample.from;
  checkOwn();
});
$("src-btn").addEventListener("click", () => {
  const out = $("src-out");
  const open = $("src-btn").getAttribute("aria-expanded") === "true";
  $("src-btn").setAttribute("aria-expanded", String(!open));
  $("src-btn").textContent = open ? "Show them" : "Hide them";
  if (!open) showTables();
  out.hidden = open;
});
$("why-btn").addEventListener("click", () => {
  const b = $("why-btn");
  const open = b.getAttribute("aria-expanded") === "true";
  b.setAttribute("aria-expanded", String(!open));
  $("chain").hidden = open;
});
$("reset").addEventListener("click", () => { approved.clear(); openId = null; results = checkAll(world, messages); render(); });
wide.addEventListener("change", () => render({ keep: true }));
fillFrom();
render();
