// Slot Check: a patient's message, read against a clinic's roster, diary and booking rules.
// Plain code. No model. Every field it uses points at the words or the table row it came from.

export const DOC_NAMES = {
  msg: "The message",
  types: "Appointment types",
  doctors: "Doctors",
  roster: "Weekly roster",
  export: "Diary export",
  appts: "Diary export",
  patients: "Patient records",
  holidays: "Public holidays",
  rules: "Booking rules",
  reading: "Reading rules",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STEP = 15; // R1
const NOTICE = 120; // R4, minutes
const OFFER_MAX = 3; // R10

/* ---------- dates and times, all plain numbers, no time zones ---------- */

export const dayNum = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
export const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const weekday = (n) => new Date(n * 86400000).getUTCDay(); // 0 Sunday
export const mins = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const clock = (m) => {
  if (m === 720) return "noon";
  const h = Math.floor(m / 60), mm = m % 60;
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
};
export const dayLabel = (n) => {
  const d = new Date(n * 86400000);
  const y = d.getUTCFullYear();
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}${y === YEAR ? "" : ` ${y}`}`;
};
const YEAR = 2026; // the year of the sample; other years are written out
const at = (iso) => ({ day: dayNum(iso), min: mins(iso.slice(11, 16)) });

/* ---------- tables ---------- */

/** A CSV table: rows keep the line they came from, so every use can point back at it. */
function table(name, text) {
  const lines = text.split("\n");
  const head = lines[0].split(",");
  const rows = lines.slice(1).map((l, i) => {
    const cells = l.split(",");
    const row = { _line: i + 1, _doc: name };
    head.forEach((h, j) => (row[h] = cells[j]));
    return row;
  });
  return { lines, head, rows };
}

/** The character range of one cell on a CSV line. */
export function cellRef(doc, row, col, world) {
  const t = world.t[doc];
  const line = t.lines[row._line];
  const j = t.head.indexOf(col);
  let start = 0;
  const cells = line.split(",");
  for (let k = 0; k < j; k++) start += cells[k].length + 1;
  return { doc, line: row._line, start, end: start + cells[j].length, text: cells[j] };
}
export const rowRef = (doc, row, world) => {
  const line = world.t[doc].lines[row._line];
  return { doc, line: row._line, start: 0, end: line.length, text: line };
};
const ruleRef = (world, id, doc = "rules") => {
  const lines = world.docs[doc];
  const i = lines.findIndex((l) => l.startsWith(id + " "));
  return { doc, line: i, start: 0, end: lines[i].length, text: lines[i], id };
};

export function makeWorld(tables) {
  const t = {};
  for (const k of ["types", "doctors", "roster", "appts", "patients", "holidays", "export"]) t[k] = table(k, tables[k]);
  // the export file has no header; treat each line as key,value
  const ex = {};
  tables.export.split("\n").forEach((l, i) => {
    const [k, v] = l.split(",");
    ex[k] = { value: v, line: i };
  });
  const docs = {};
  for (const k of Object.keys(tables)) docs[k] = tables[k].split("\n");
  return {
    t, docs,
    types: Object.fromEntries(t.types.rows.map((r) => [r.code, { ...r, minutes: +r.minutes, buffer: +r.buffer_after, docs: r.doctors.split(";") }])),
    doctors: t.doctors.rows,
    roster: t.roster.rows,
    appts: t.appts.rows,
    patients: t.patients.rows,
    holidays: t.holidays.rows,
    exportFrom: dayNum(ex.from.value), exportTo: dayNum(ex.to.value),
    exportRefs: { from: { doc: "export", line: ex.from.line, start: 5, end: 5 + ex.from.value.length, text: ex.from.value }, to: { doc: "export", line: ex.to.line, start: 3, end: 3 + ex.to.value.length, text: ex.to.value } },
  };
}

/* ---------- reading the message ---------- */

const span = (m, groupText) => {
  const start = m.index + m[0].indexOf(groupText ?? m[0]);
  return { doc: "msg", line: 0, start, end: start + (groupText ?? m[0]).length, text: groupText ?? m[0] };
};
const all = (re, text) => [...text.matchAll(re)];
const overlaps = (a, list) => list.some((b) => a.start < b.end && b.start < a.end);

const DAY_RE = /\b(?:(this|next|coming)\s+)?(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
const DAY_INDEX = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
const iso7 = (wd) => (wd === 0 ? 7 : wd); // Monday 1 .. Sunday 7

/** Hour as written ("5", "5pm", "9.30am") to minutes, by reading rule W1. */
function hourOf(h, m, ap) {
  h = +h; m = m ? +m : 0;
  if (h > 23 || m > 59) return null;
  if (ap) {
    ap = ap.toLowerCase();
    if (h > 12 || h === 0) return null;
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return { min: h * 60 + m, rule: null };
  }
  if (h >= 13) return { min: h * 60 + m, rule: null };
  if (h >= 1 && h <= 7) return { min: (h + 12) * 60 + m, rule: "W1" };
  return { min: h * 60 + m, rule: "W1" };
}

export function readMessage(text, sentIso) {
  const sent = at(sentIso);
  const out = { refs: [], doctor: null, type: null, days: null, window: null, notes: [] };
  const taken = [];
  const claim = (r) => { taken.push(r); out.refs.push(r); return r; };

  // doctor
  const docs = [];
  for (const m of all(/\b(?:dr\.?|doctor)\s+([a-z][a-z'-]+)/gi, text)) {
    if (/^(pls|please|can|any)$/i.test(m[1])) continue;
    docs.push({ name: m[1], ref: claim(span(m)) });
  }
  for (const m of all(/\b(teh|oei|saffuan)\b/gi, text)) {
    const r = span(m);
    if (!overlaps(r, taken)) docs.push({ name: m[1], ref: claim(r) });
  }
  for (const m of all(/\bany\s+(?:doctor|dr|one)\b|\banyone\b/gi, text)) docs.push({ any: true, ref: claim(span(m)) });
  if (docs.length) out.doctor = docs;

  // type
  const types = [];
  for (const [code, re] of [
    ["FU", /\b(follow[\s-]?ups?|followup|review|f\/u)\b/gi],
    ["NEW", /\b(first time|first visit|new patient|never been)\b/gi],
    ["INJ", /\b(injections?|inject|jab)\b/gi],
  ]) for (const m of all(re, text)) types.push({ code, ref: claim(span(m)) });
  if (types.length) out.type = types;

  // time window, by W1 and W2; several are intersected
  const windows = [];
  for (const [re, from, to] of [
    [/\bmornings?\b|\bmorn\b/gi, 480, 720],
    [/\bafternoons?\b|\baftn\b/gi, 720, 1020],
    [/\bevenings?\b|\bnight\b/gi, 1020, 1440],
  ]) for (const m of all(re, text)) windows.push({ from, to, ref: claim(span(m)), rule: "W2" });
  for (const m of all(/\b(after|before|from|at)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/gi, text)) {
    const h = hourOf(m[2], m[3], m[4]);
    if (!h) continue;
    const w = m[1].toLowerCase();
    const r = claim(span(m));
    if (w === "after" || w === "from") windows.push({ from: h.min, to: 1440, ref: r, rule: h.rule });
    else if (w === "before") windows.push({ from: 0, to: h.min, ref: r, rule: h.rule });
    else windows.push({ from: h.min, to: h.min + 1, ref: r, rule: h.rule });
  }
  for (const m of all(/\bany\s*time\b/gi, text)) windows.push({ from: 0, to: 1440, ref: claim(span(m)), rule: null });
  if (windows.length) {
    out.window = {
      from: Math.max(...windows.map((w) => w.from)),
      to: Math.min(...windows.map((w) => w.to)),
      parts: windows,
    };
  }

  // days
  const days = []; // each: { dates:[n...], ref, ambiguous?:[n,n], past?:bool, rule }
  const today = sent.day, todayWd = iso7(weekday(today));
  for (const m of all(/\btoday\b/gi, text)) days.push({ dates: [today], ref: span(m) });
  for (const m of all(/\b(tomorrow|tmr|tmrw|tml)\b/gi, text)) days.push({ dates: [today + 1], ref: span(m) });
  for (const m of all(/\b(this|next)\s+week\b/gi, text)) {
    const sunday = today + (7 - todayWd);
    if (m[1].toLowerCase() === "this") days.push({ dates: range(today, sunday), ref: span(m), rule: "W4" });
    else days.push({ dates: range(sunday + 1, sunday + 7), ref: span(m), rule: "W4" });
  }
  for (const m of all(DAY_RE, text)) {
    const r = span(m);
    if (overlaps(r, days.map((d) => d.ref))) continue;
    const wd = iso7(DAY_INDEX[m[2].slice(0, 3).toLowerCase()]);
    const ahead = (wd - todayWd + 7) % 7; // 0 = today
    const mod = (m[1] || "").toLowerCase();
    if (mod === "next") {
      if (wd > todayWd) days.push({ dates: [today + ahead], ambiguous: [today + ahead, today + ahead + 7], ref: r, rule: "W3" });
      else days.push({ dates: [today + (ahead === 0 ? 7 : ahead)], ref: r });
    } else days.push({ dates: [today + ahead], ref: r });
  }
  const mon = MONTHS.join("|");
  for (const m of all(new RegExp(`\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${mon})[a-z]*\\b`, "gi"), text)) pushDate(days, +m[1], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), null, span(m), today);
  for (const m of all(new RegExp(`\\b(${mon})[a-z]*\\s+(\\d{1,2})\\b`, "gi"), text)) {
    const r = span(m);
    if (!overlaps(r, days.map((d) => d.ref))) pushDate(days, +m[2], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), null, r, today);
  }
  for (const m of all(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g, text)) pushDate(days, +m[1], +m[2] - 1, m[3] ? +m[3] : null, span(m), today);
  for (const d of days) claim(d.ref);
  if (days.length) out.days = days;

  out.refs.sort((a, b) => a.start - b.start);
  return out;
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function pushDate(days, d, mo, y, ref, today) {
  if (mo < 0 || mo > 11 || d < 1 || d > 31) { days.push({ dates: [], bad: true, ref }); return; }
  const ty = new Date(today * 86400000).getUTCFullYear();
  let year = y == null ? ty : y < 100 ? 2000 + y : y;
  const mk = (yy) => Math.round(Date.UTC(yy, mo, d) / 86400000);
  let n = mk(year);
  if (new Date(n * 86400000).getUTCDate() !== d) { days.push({ dates: [], bad: true, ref }); return; }
  // a date with no year that passed in the last 90 days is read as past, not as next year
  if (y == null && n < today && today - n > 90) n = mk(year + 1);
  if (n < today) days.push({ dates: [n], past: true, ref });
  else days.push({ dates: [n], ref });
}

/* ---------- checking ---------- */

const docName = (world, short) => world.doctors.find((d) => d.short === short)?.name || short;

/** Look for slots for one type, one set of doctors, one set of dates. */
function search(world, { type, doctors, dates, window, sent }) {
  const T = world.types[type];
  const allowed = [], blocked = [], notes = [];
  for (const day of dates) {
    const hol = world.holidays.find((h) => dayNum(h.date) === day);
    if (hol) {
      notes.push({ day, holiday: hol.name, text: `${dayLabel(day)} is ${hol.name}, a public holiday. The clinic does not book that day.`, refs: [rowRef("holidays", hol, world), ruleRef(world, "R5")] });
      continue;
    }
    if (day === sent.day && !world.roster.some((r) => doctors.includes(r.doctor) && r.day === DAYS[weekday(day)] && mins(r.end) - T.minutes >= sent.min + NOTICE)) continue;
    if (day < world.exportFrom || day > world.exportTo) {
      notes.push({ day, text: `${dayLabel(day)} is outside the diary export, which covers ${dayLabel(world.exportFrom)} to ${dayLabel(world.exportTo)}. Bookings that day are not known, so nothing is offered.`, refs: [world.exportRefs.from, world.exportRefs.to, ruleRef(world, "R11")] });
      continue;
    }
    for (const doc of doctors) {
      const sessions = world.roster.filter((s) => s.doctor === doc && s.day === DAYS[weekday(day)]);
      const fit = sessions.filter((s) => s.kind === T.session_kind);
      if (!sessions.length) {
        if (dates.length <= 2) notes.push({ day, text: `${docName(world, doc)} has no session on ${dayLabel(day)}.`, refs: [ruleRef(world, "R2")] });
        continue;
      }
      if (!fit.length) {
        notes.push({ day, text: `${docName(world, doc)}'s session on ${dayLabel(day)} is a ${sessions[0].kind} session. A ${T.name.toLowerCase()} needs a ${T.session_kind} session.`, refs: [rowRef("roster", sessions[0], world), cellRef("types", T, "session_kind", world), ruleRef(world, "R2")] });
        continue;
      }
      for (const s of fit) {
        const s0 = mins(s.start), s1 = mins(s.end);
        let any = false;
        for (let start = s0; start < s1; start += STEP) {
          const end = start + T.minutes;
          if (window) {
            if (start < window.from || start >= window.to) continue;
          }
          any = true;
          const base = { day, start, end, doctor: doc, session: s, type };
          const sRef = rowRef("roster", s, world);
          const tRef = rowRef("types", T, world);
          if (end > s1) {
            blocked.push({ ...base, why: `Would end at ${clock(end)}, after the session ends at ${clock(s1)}.`, rule: "R2", refs: [cellRef("roster", s, "end", world), cellRef("types", T, "minutes", world), ruleRef(world, "R2")] });
            continue;
          }
          const lead = (day - sent.day) * 1440 + start - sent.min;
          if (lead < NOTICE) {
            blocked.push({ ...base, why: lead < 0 ? "Already past when the message came in." : `Less than 2 hours after the message.`, rule: "R4", refs: [ruleRef(world, "R4")] });
            continue;
          }
          const occEnd = end + T.buffer;
          const iso = isoOf(day);
          const diary = world.appts.filter((a) => a.date === iso && a.doctor === doc);
          let clash = null;
          for (const a of diary.filter((a) => a.status !== "Cancelled").sort((x, y) => mins(x.start) - mins(y.start))) {
            const a0 = mins(a.start), a1 = mins(a.end), aBuf = world.types[a.type]?.buffer || 0;
            if (start < a1 + aBuf && a0 < occEnd) {
              if (start < a1 && a0 < end) clash = { a, why: `Taken: ${a.id}, ${clock(a0)} to ${clock(a1)}.`, refs: [rowRef("appts", a, world), ruleRef(world, "R3")] };
              else if (start < a1 + aBuf && start >= a1) clash = { a, why: `${a.id} is a ${world.types[a.type].name.toLowerCase()}; its ${aBuf}-minute buffer runs to ${clock(a1 + aBuf)}.`, refs: [rowRef("appts", a, world), cellRef("types", world.types[a.type], "buffer_after", world), ruleRef(world, "R3")] };
              else clash = { a, why: `Its own ${T.buffer}-minute buffer would run into ${a.id} at ${clock(a0)}.`, refs: [rowRef("appts", a, world), cellRef("types", T, "buffer_after", world), ruleRef(world, "R3")] };
              break;
            }
          }
          if (clash) { blocked.push({ ...base, why: clash.why, rule: "R3", refs: clash.refs, booking: clash.a.id }); continue; }
          const live = diary.filter((a) => a.status !== "Cancelled");
          const before = live.filter((a) => mins(a.end) <= start).sort((x, y) => mins(y.end) - mins(x.end))[0];
          const after = live.filter((a) => mins(a.start) >= end).sort((x, y) => mins(x.start) - mins(y.start))[0];
          const cancelled = diary.filter((a) => a.status === "Cancelled" && mins(a.start) < end && start < mins(a.end));
          allowed.push({ ...base, occEnd, before, after, cancelled, lead, refs: { session: sRef, type: tRef } });
        }
        if (!any && window) notes.push({ day, text: `${docName(world, doc)}'s session ${s.session} on ${dayLabel(day)} runs ${clock(s0)} to ${clock(s1)}, outside the time asked.`, refs: [rowRef("roster", s, world)] });
      }
    }
  }
  allowed.sort((a, b) => a.day - b.day || a.start - b.start || a.doctor.localeCompare(b.doctor));
  blocked.sort((a, b) => a.day - b.day || a.start - b.start || a.doctor.localeCompare(b.doctor));
  return { allowed, blocked, notes };
}

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** One request, start to finish. */
export function checkRequest(world, msg) {
  const read = readMessage(msg.text, msg.at);
  const sent = at(msg.at);
  const patient = world.patients.find((p) => p.phone === msg.from) || null;
  const name = patient ? patient.first_name : msg.name;
  const res = { id: msg.id, msg, read, patient, name, fields: [], notes: [], readings: [], state: "pass", kind: null, why: null, whyRefs: [] };
  let held = null; // the first reason not to search, in a fixed order
  const hold = (state, kind, why, refs) => { if (!held) held = { state, kind, why, whyRefs: refs || [] }; };

  // patient record
  res.fields.push(patient
    ? { label: "Patient", value: `${patient.first_name}, last seen ${dayLabel(dayNum(patient.last_visit))} by ${docName(world, patient.last_doctor)}`, refs: [rowRef("patients", patient, world)] }
    : { label: "Patient", value: `No record for ${msg.from}. ${msg.name} is the WhatsApp profile name.`, refs: [] });

  // type
  let type;
  const codes = [...new Set((read.type || []).map((t) => t.code))];
  if (codes.length > 1) {
    type = null;
    res.fields.push({ label: "Type", value: "Two types named", refs: read.type.map((t) => t.ref) });
    hold("none", "ask-type", `The message names two appointment types (${codes.map((c) => lower(world.types[c].name)).join(" and ")}). The reply asks which.`, read.type.map((t) => t.ref));
  } else if (codes.length === 1) {
    type = codes[0];
    if (type === "FU" && !patient) {
      type = "NEW";
      res.changed = true;
      res.fields.push({ label: "Type", value: `${world.types.NEW.name}, ${world.types.NEW.minutes} min. Asked for a follow-up, but this number has no visit on record.`, refs: [...read.type.map((t) => t.ref), rowRef("types", world.types.NEW, world), ruleRef(world, "R7")], changed: true });
      res.notes.push({ text: "If they were seen here under another number, the front desk links the record first and books a follow-up instead.", refs: [ruleRef(world, "R7")] });
    } else {
      res.fields.push({ label: "Type", value: `${world.types[type].name}, ${world.types[type].minutes} min`, refs: [...read.type.map((t) => t.ref), rowRef("types", world.types[type], world)] });
    }
  } else {
    type = patient ? "FU" : "NEW";
    res.fields.push({ label: "Type", value: `${world.types[type].name}, ${world.types[type].minutes} min (none named)`, refs: [rowRef("types", world.types[type], world), ruleRef(world, "R9")] });
  }
  res.type = type;
  const T = type ? world.types[type] : null;

  // doctor
  let doctors = [];
  const named = (read.doctor || []).filter((d) => !d.any);
  if (named.length) {
    const found = [], missing = [];
    for (const d of named) {
      const row = world.doctors.find((x) => x.short.toLowerCase() === d.name.toLowerCase());
      (row ? found : missing).push({ ...d, row });
    }
    if (missing.length) {
      res.missingDoctor = cap(missing[0].name);
      res.fields.push({ label: "Doctor", value: `No Dr ${cap(missing[0].name)} at this clinic`, refs: missing.map((m) => m.ref) });
      hold("none", "doctor", `There is no Dr ${cap(missing[0].name)} on the clinic's list of doctors. It is not matched to the nearest name. The reply asks which doctor.`, [...missing.map((m) => m.ref), ...world.doctors.map((d) => rowRef("doctors", d, world))]);
    } else {
      doctors = [...new Set(found.map((f) => f.row.short))];
      res.fields.push({ label: "Doctor", value: doctors.map((d) => docName(world, d)).join(", "), refs: [...found.map((f) => f.ref), ...found.map((f) => rowRef("doctors", f.row, world))] });
      const notTaking = T ? doctors.filter((d) => !T.docs.includes(d)) : [];
      if (notTaking.length) hold("fail", "doctor-type", `${docName(world, notTaking[0])} does not take a ${lower(T.name)}. On the types table that is ${joinAnd(T.docs.map((d) => docName(world, d)))}.`, [cellRef("types", T, "doctors", world)]);
      else if (type === "FU" && patient && !doctors.includes(patient.last_doctor)) hold("fail", "last-doctor", `A follow-up is with the doctor the patient last saw, and ${name} last saw ${docName(world, patient.last_doctor)}. The front desk decides.`, [cellRef("patients", patient, "last_doctor", world), ruleRef(world, "R6")]);
    }
  } else if (type === "FU" && patient) {
    doctors = [patient.last_doctor];
    res.fields.push({ label: "Doctor", value: `${docName(world, patient.last_doctor)}, last seen`, refs: [...(read.doctor || []).map((d) => d.ref), cellRef("patients", patient, "last_doctor", world), ruleRef(world, "R6")] });
  } else if (T) {
    doctors = [...T.docs];
    res.fields.push({ label: "Doctor", value: `Any who takes it: ${joinAnd(doctors.map((d) => docName(world, d)))}`, refs: [...(read.doctor || []).map((d) => d.ref), cellRef("types", T, "doctors", world)] });
    const others = world.doctors.map((d) => d.short).filter((d) => !T.docs.includes(d));
    if (others.length && (read.doctor || []).some((d) => d.any)) res.notes.push({ text: `${joinAnd(others.map((d) => docName(world, d)))} does not take a ${lower(T.name)}.`, refs: [cellRef("types", T, "doctors", world)] });
  }
  res.doctors = doctors;

  // referral
  if (T && T.needs_referral === "yes" && !(patient && patient.referral_letter === "yes")) {
    hold("fail", "referral", `A ${lower(T.name)} needs a referral letter on file, and ${patient ? `${name}'s record shows none` : "this number has no record"}. No slot is offered until it is in.`, [cellRef("types", T, "needs_referral", world), ...(patient ? [cellRef("patients", patient, "referral_letter", world)] : []), ruleRef(world, "R8")]);
  }

  // days
  let readings = [];
  const days = read.days || [];
  const bad = days.find((d) => d.bad), past = days.find((d) => d.past), amb = days.find((d) => d.ambiguous);
  if (bad) {
    res.fields.push({ label: "Day", value: `"${bad.ref.text}" is not a date`, refs: [bad.ref] });
    hold("none", "date", `"${bad.ref.text}" is not a date on the calendar. The reply asks which day.`, [bad.ref]);
  } else if (past) {
    res.fields.push({ label: "Day", value: `${dayLabel(past.dates[0])}, already past`, refs: [past.ref] });
    hold("none", "date", `${dayLabel(past.dates[0])} has already passed. The reply asks which day.`, [past.ref]);
  } else if (!days.length) {
    const ds = range(sent.day + 1, sent.day + 7);
    readings = [{ dates: ds, label: null }];
    res.fields.push({ label: "Day", value: `None named: ${dayLabel(ds[0])} to ${dayLabel(ds[ds.length - 1])}`, refs: [ruleRef(world, "W5", "reading")] });
  } else if (amb) {
    const others = days.filter((d) => d !== amb).flatMap((d) => d.dates);
    readings = amb.ambiguous.map((n) => ({ dates: [...new Set([n, ...others])].sort((a, b) => a - b), label: dayLabel(n) }));
    res.fields.push({ label: "Day", value: `Unclear: ${amb.ambiguous.map(dayLabel).join(" or ")}`, refs: [amb.ref, ruleRef(world, "W3", "reading")], unclear: true });
  } else {
    const ds = [...new Set(days.flatMap((d) => d.dates))].sort((a, b) => a - b);
    readings = [{ dates: ds, label: null }];
    const rules = days.filter((d) => d.rule).map((d) => ruleRef(world, d.rule, "reading"));
    res.fields.push({ label: "Day", value: ds.length > 2 ? `${dayLabel(ds[0])} to ${dayLabel(ds[ds.length - 1])}` : ds.map(dayLabel).join(", "), refs: [...days.map((d) => d.ref), ...rules] });
  }

  // time
  const w = read.window;
  if (w) {
    if (w.from >= w.to) {
      res.fields.push({ label: "Time", value: "The times asked do not overlap", refs: w.parts.map((p) => p.ref) });
      hold("none", "time", "The times in the message do not overlap. The reply asks what time suits.", w.parts.map((p) => p.ref));
    } else {
      const label = w.to - w.from === 1 ? `Starting at ${clock(w.from)}`
        : w.to >= 1440 ? (w.from === 0 ? "Any time" : `Starting from ${clock(w.from)}`)
        : w.from === 0 ? `Starting before ${clock(w.to)}`
        : `Starting ${clock(w.from)} to before ${clock(w.to)}`;
      const rules = [...new Set(w.parts.map((p) => p.rule).filter(Boolean))].map((r) => ruleRef(world, r, "reading"));
      res.fields.push({ label: "Time", value: label, refs: [...w.parts.map((p) => p.ref), ...rules] });
    }
  } else {
    res.fields.push({ label: "Time", value: "None named: any time in a session", refs: [] });
  }

  if (!read.refs.length) {
    held = { state: "none", kind: "unread", why: "Nothing in the message names a doctor, a type, a day or a time. Slots are not offered on a guess. The reply asks what they need.", whyRefs: [] };
  }
  if (held) {
    Object.assign(res, held);
    return finish(world, res);
  }

  // search each reading
  for (const r of readings) {
    const s = search(world, { type, doctors, dates: r.dates, window: w, sent });
    res.readings.push({ ...r, ...s, offered: s.allowed.slice(0, OFFER_MAX) });
  }
  res.notes.push(...dedupeNotes(res.readings.flatMap((r) => r.notes)));

  const total = res.readings.reduce((n, r) => n + r.allowed.length, 0);
  if (amb) {
    Object.assign(res, { state: "none", kind: "ask", why: `"${amb.ref.text}" sent on ${dayLabel(sent.day)} can mean ${amb.ambiguous.map(dayLabel).join(" or ")}. It is not guessed: the reply offers slots on both and asks.`, whyRefs: [amb.ref, ruleRef(world, "W3", "reading")] });
  } else if (!total) {
    const hol = res.notes.find((n) => n.holiday);
    const onlyHoliday = hol && res.readings.every((r) => r.dates.every((d) => world.holidays.some((h) => dayNum(h.date) === d)));
    if (onlyHoliday) {
      Object.assign(res, { state: "none", kind: "holiday", why: hol.text, whyRefs: hol.refs, holiday: hol });
      res.notes = res.notes.filter((n) => n !== hol);
    }
    else Object.assign(res, { state: "none", kind: "noslot", why: "No slot fits what was asked. The reply asks about another day or time.", whyRefs: [] });
  }
  return finish(world, res);
}

function dedupeNotes(notes) {
  const seen = new Set();
  return notes.filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true)));
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Headline, counts and the draft reply. */
function finish(world, res) {
  const offered = res.readings.flatMap((r) => r.offered || []);
  res.offered = offered;
  res.allowedCount = res.readings.reduce((n, r) => n + (r.allowed?.length || 0), 0);
  res.blockedCount = res.readings.reduce((n, r) => n + (r.blocked?.length || 0), 0);
  res.label = res.state === "pass" ? `${offered.length} slot${offered.length === 1 ? "" : "s"}` : { ask: "Ask", "ask-type": "Ask", unread: "Not read", doctor: "Not found", noslot: "No slot", holiday: "Closed", date: "Ask", time: "Ask" }[res.kind] || "Held";
  res.reply = draftReply(world, res);
  return res;
}

function slotsByDay(world, slots) {
  const many = new Set(slots.map((s) => s.doctor)).size > 1;
  const groups = [];
  for (const s of slots) {
    let g = groups.find((x) => x.day === s.day && x.doctor === s.doctor);
    if (!g) groups.push((g = { day: s.day, doctor: s.doctor, times: [] }));
    g.times.push(clock(s.start));
  }
  return groups.map((g) => `${dayLabel(g.day)} at ${joinOr(g.times)}${many ? ` with ${docName(world, g.doctor)}` : ""}`).join("; ");
}
const joinAnd = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const joinOr = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

export function draftReply(world, res) {
  const hi = `Hi ${res.name}, `;
  const T = res.type ? world.types[res.type] : null;
  if (res.state === "pass") {
    const many = new Set(res.offered.map((s) => s.doctor)).size > 1;
    const who = many ? "we can" : `${docName(world, res.offered[0].doctor)} can`;
    let lead = "";
    if (res.changed) lead = `we can't find a past visit under this number, so this would be a new-patient consult (${T.minutes} minutes). If you've been seen here before under another number, let us know. `;
    else if (res.type === "NEW" && !res.patient) lead = `welcome. A first visit is a new-patient consult (${T.minutes} minutes). `;
    const whoText = lead ? who.charAt(0).toUpperCase() + who.slice(1) : who;
    return `${hi}${lead}${whoText} see you on ${slotsByDay(world, res.offered)}.${res.offered.length > 1 ? " Which one suits you?" : " Does that suit you?"}`;
  }
  if (res.kind === "ask" && res.readings.length > 1) {
    const d = new Set(res.readings.flatMap((r) => r.offered.map((s) => s.doctor)));
    const who = d.size === 1 ? `${docName(world, [...d][0])} can see you` : "We can see you";
    const parts = res.readings.filter((r) => r.offered.length).map((r) => `on ${r.label} at ${joinOr(r.offered.map((s) => clock(s.start)))}`);
    const none = res.readings.filter((r) => !r.offered.length).map((r) => r.label);
    return `${hi}do you mean ${res.readings.map((r) => r.label).join(" or ")}?${parts.length ? ` ${who} ${parts.join(", or ")}.` : ""}${none.length ? ` Nothing is free on ${none.join(" or ")} at that time.` : ""}`;
  }
  if (res.kind === "ask-type") return `${hi}just to check, which appointment would you like: ${joinOr(Object.values(world.types).filter((t) => (res.read.type || []).some((x) => x.code === t.code)).map((t) => lower(t.name)))}?`;
  if (res.kind === "doctor") return `${hi}we don't have a Dr ${res.missingDoctor} at this clinic. Our doctors are ${joinAnd(world.doctors.map((d) => d.name))}. Which one would you like to see?`;
  if (res.kind === "referral") return `${hi}a ${lower(T.name)} needs a referral letter on file before we can book it. Could you send a photo of the letter here? We'll offer you a slot once it's in.`;
  if (res.kind === "unread") return `${hi}thanks for your message. Would you like to book an appointment? If so, which doctor and which day suit you?`;
  if (res.kind === "date") return `${hi}which day would you like to come in?`;
  if (res.kind === "time") return `${hi}what time of day suits you?`;
  if (res.kind === "holiday") return `${hi}the clinic is closed on ${dayLabel(res.holiday.day)} for ${res.holiday.holiday}. Would another day work?`;
  if (res.kind === "noslot") return `${hi}there's nothing free at the time you asked. Would another day or time work?`;
  return `${hi}thanks for your message. Our front desk will check this one and come back to you.`;
}

/** The whole inbox. */
export function checkAll(world, messages) {
  return messages.map((m) => checkRequest(world, m));
}
