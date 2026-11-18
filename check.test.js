import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, checkAll, checkRequest, readMessage, dayNum, dayLabel, hhmm, mins } from "./check.js";
import { tables, messages, SENT_AT, pasteExample } from "./samples.js";

const world = makeWorld(tables);
const all = checkAll(world, messages);
const by = (name) => all.find((r) => r.name === name);
const times = (slots) => slots.map((s) => `${dayLabel(s.day)} ${hhmm(s.start)}`);
const ask = (text, from = "+65 9••• 2141", at = SENT_AT) => checkRequest(world, { id: "t", from, name: "Sam", at, text });
const NEW_NUMBER = "+65 9••• 0000";

test("sample: 3 of 6 requests get slots, 1 is asked which day with slots for both, 2 are held or asked back", () => {
  assert.deepEqual(all.map((r) => [r.name, r.state, r.label]), [
    ["Wei Ling", "pass", "3 slots"],
    ["Rizal", "pass", "2 slots"],
    ["Devi", "fail", "Held"],
    ["Hui Min", "none", "Not found"],
    ["Jun", "pass", "2 slots"],
    ["Farah", "none", "Ask"],
  ]);
});

test("Wei Ling: 'after 5' this week with Dr Teh gives 6:15, 7:30 and 7:45 pm on Thursday", () => {
  const r = by("Wei Ling");
  assert.deepEqual(times(r.offered), ["Thu 19 Nov 18:15", "Thu 19 Nov 19:30", "Thu 19 Nov 19:45"]);
  assert.equal(r.blockedCount, 9);
  assert.match(r.reply, /6:15 pm, 7:30 pm or 7:45 pm/);
});

test("a cancelled booking does not block the slot it sat in, and is named on the slot", () => {
  const s = by("Wei Ling").offered[0];
  assert.equal(hhmm(s.start), "18:15");
  assert.deepEqual(s.cancelled.map((c) => c.id), ["B-2204"]);
  assert.equal(s.before.id, "B-2203");
  assert.equal(s.after.id, "B-2205");
});

test("the buffer after a new-patient consult blocks the next quarter hour", () => {
  const b = by("Wei Ling").readings[0].blocked;
  const at1730 = b.find((x) => hhmm(x.start) === "17:30");
  assert.equal(at1730.rule, "R3");
  assert.match(at1730.why, /B-2201 .*5-minute buffer runs to 5:35 pm/);
  const at1900 = b.find((x) => hhmm(x.start) === "19:00");
  assert.match(at1900.why, /B-2205 .*buffer runs to 7:05 pm/);
});

test("a slot's own buffer may not run into the next booking", () => {
  const b = by("Jun").readings[0].blocked.find((x) => hhmm(x.start) === "10:30");
  assert.match(b.why, /Its own 5-minute buffer would run into B-2210 at 11:00 am/);
});

test("an appointment must end inside the session", () => {
  const b = by("Rizal").readings[0].blocked.find((x) => hhmm(x.start) === "11:45");
  assert.equal(b.rule, "R2");
  assert.match(b.why, /end at 12:15 pm, after the session ends at noon/);
  assert.deepEqual(times(by("Rizal").offered), ["Sat 21 Nov 11:15", "Sat 21 Nov 11:30"]);
});

test("Rizal: a new number asking any doctor gets only doctors who take new patients, and the notes say who is out", () => {
  const r = by("Rizal");
  assert.equal(r.type, "NEW");
  assert.deepEqual(r.doctors, ["Teh", "Oei"]);
  const notes = r.notes.map((n) => n.text).join(" | ");
  assert.match(notes, /Dr Imran Saffuan does not take a new-patient consult/);
  assert.match(notes, /Dr Petrina Oei has no session on Sat 21 Nov/);
});

test("Rizal: words about the knee are not read", () => {
  const read = by("Rizal").read;
  assert.ok(!read.refs.some((x) => /knee/i.test(x.text)));
});

test("Devi: an injection needs a referral letter on file; nothing is offered without one", () => {
  const r = by("Devi");
  assert.equal(r.kind, "referral");
  assert.equal(r.offered.length, 0);
  assert.ok(r.whyRefs.some((x) => x.doc === "patients" && x.text === "no"));
  assert.match(r.reply, /send a photo of the letter/);
});

test("with a referral on file, the same injection request finds procedure-session slots", () => {
  const r = ask("Can I book the knee injection with Dr Oei next Tuesday morning?", "+65 9••• 6604");
  assert.equal(r.state, "pass");
  assert.deepEqual(times(r.offered), ["Tue 24 Nov 11:15", "Tue 24 Nov 11:30", "Tue 24 Nov 11:45"]);
  const own = r.readings[0].blocked.find((x) => hhmm(x.start) === "10:00");
  assert.match(own.why, /own 10-minute buffer would run into B-2223/);
});

test("an injection is not booked into a consult session", () => {
  const r = ask("injection with Dr Oei Friday", "+65 9••• 6604");
  assert.equal(r.offered.length, 0);
  assert.ok(r.notes.some((n) => /is a consult session\. A joint injection needs a procedure session/.test(n.text)));
});

test("Hui Min: a doctor not on the list is not matched to the nearest name", () => {
  const r = by("Hui Min");
  assert.equal(r.kind, "doctor");
  assert.match(r.why, /no Dr Tan/);
  assert.ok(!r.offered.length);
  assert.match(r.reply, /Dr Corwin Teh, Dr Petrina Oei and Dr Imran Saffuan/);
});

test("Jun: a follow-up asked for from a number with no visit becomes a new-patient consult", () => {
  const r = by("Jun");
  assert.equal(r.type, "NEW");
  assert.ok(r.changed);
  assert.deepEqual(times(r.offered), ["Fri 20 Nov 10:15", "Fri 20 Nov 11:45"]);
  assert.match(r.reply, /new-patient consult \(30 minutes\)/);
});

test("Farah: 'next Fri' on a Wednesday is not guessed; both Fridays are offered and the reply asks", () => {
  const r = by("Farah");
  assert.equal(r.kind, "ask");
  assert.deepEqual(r.readings.map((x) => x.label), ["Fri 20 Nov", "Fri 27 Nov"]);
  assert.deepEqual(times(r.readings[0].offered), ["Fri 20 Nov 10:15", "Fri 20 Nov 10:30", "Fri 20 Nov 10:45"]);
  assert.deepEqual(times(r.readings[1].offered), ["Fri 27 Nov 09:45", "Fri 27 Nov 10:15", "Fri 27 Nov 10:30"]);
  assert.match(r.reply, /do you mean Fri 20 Nov or Fri 27 Nov\?/);
});

test("'next Tuesday' on a Wednesday is the coming Tuesday, with no doubt", () => {
  const d = readMessage("next Tuesday", SENT_AT).days[0];
  assert.deepEqual(d.dates, [dayNum("2026-11-24")]);
  assert.equal(d.ambiguous, undefined);
});

test("a follow-up with a different doctor from the last one seen is held", () => {
  const r = ask("follow up with Dr Oei tmr");
  assert.equal(r.state, "fail");
  assert.equal(r.kind, "last-doctor");
});

test("a doctor who does not take the type is held", () => {
  const r = ask("first time with Dr Saffuan");
  assert.equal(r.kind, "doctor-type");
});

test("Christmas Day is a public holiday: the clinic is closed", () => {
  const r = ask(pasteExample.text, pasteExample.from);
  assert.equal(r.kind, "holiday");
  assert.equal(r.label, "Closed");
  assert.match(r.reply, /closed on Fri 25 Dec for Christmas Day/);
});

test("a date past the diary export offers nothing and says why", () => {
  const r = ask("review 1/12 morning");
  assert.equal(r.kind, "noslot");
  assert.ok(r.notes.some((n) => /outside the diary export/.test(n.text)));
});

test("dates that are not dates, or have passed, are asked about", () => {
  assert.equal(ask("can i come 31/11").kind, "date");
  assert.equal(ask("1 Nov").kind, "date");
});

test("two hours' notice: sent at 8 am, nothing before 10 am is offered", () => {
  const r = ask("injection Tuesday", "+65 9••• 6604", "2026-11-24T08:00");
  const b = r.readings[0].blocked.find((x) => hhmm(x.start) === "08:30");
  assert.ok(b);
  const anyBefore10 = r.readings[0].allowed.some((s) => s.start < mins("10:00"));
  assert.equal(anyBefore10, false);
  assert.ok(r.readings[0].blocked.filter((x) => x.rule === "R4").length >= 1);
});

test("hours with no am or pm follow reading rule W1", () => {
  const w = (t) => readMessage(t, SENT_AT).window;
  assert.equal(w("after 5").from, mins("17:00"));
  assert.equal(w("after 9").from, mins("09:00"));
  assert.equal(w("after 9.30am").from, mins("09:30"));
  assert.equal(w("before 12").to, mins("12:00"));
  assert.equal(w("after 6pm").from, mins("18:00"));
});

test("times that cannot both hold are asked about", () => {
  assert.equal(ask("evening before 5").kind, "time");
});

test("a message with nothing readable offers nothing", () => {
  const r = ask("hi", NEW_NUMBER);
  assert.equal(r.kind, "unread");
  assert.equal(r.offered.length, 0);
});

test("two types in one message are asked about", () => {
  assert.equal(ask("review and injection").kind, "ask-type");
});

test("never more than 3 slots offered, earliest first", () => {
  const r = ask("first time, any doctor", NEW_NUMBER);
  assert.equal(r.offered.length, 3);
  const keys = r.offered.map((s) => s.day * 1440 + s.start);
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b));
  assert.ok(r.allowedCount > 3);
});

test("every offered slot sits inside its session, clears every live booking and its buffer, and starts on the quarter hour", () => {
  const checks = [...all, ask("first time, any doctor", NEW_NUMBER), ask("follow up next week")];
  for (const r of checks) for (const rd of r.readings) for (const s of rd.allowed) {
    assert.equal(s.start % 15, 0);
    assert.ok(s.start >= mins(s.session.start) && s.end <= mins(s.session.end));
    const T = world.types[s.type];
    const iso = new Date(s.day * 86400000).toISOString().slice(0, 10);
    for (const a of world.appts.filter((a) => a.date === iso && a.doctor === s.doctor && a.status !== "Cancelled")) {
      const aEnd = mins(a.end) + world.types[a.type].buffer;
      assert.ok(s.start >= aEnd || s.end + T.buffer <= mins(a.start), `${a.id} vs ${hhmm(s.start)}`);
    }
  }
});

test("every reference points at the exact text it claims", () => {
  const checks = [...all, ask(pasteExample.text, pasteExample.from), ask("Dr Saffuan follow up friday after 6pm"), ask("first time, any doctor", NEW_NUMBER)];
  const refsOf = (r) => [
    ...r.read.refs, ...r.whyRefs, ...r.fields.flatMap((f) => f.refs), ...r.notes.flatMap((n) => n.refs),
    ...r.readings.flatMap((rd) => [...rd.blocked.flatMap((b) => b.refs), ...rd.allowed.flatMap((s) => [s.refs.session, s.refs.type])]),
  ];
  let n = 0;
  for (const r of checks) for (const ref of refsOf(r)) {
    const line = ref.doc === "msg" ? r.msg.text : world.docs[ref.doc][ref.line];
    assert.ok(line != null, `${ref.doc}:${ref.line}`);
    if (ref.text != null) assert.equal(line.slice(ref.start, ref.end), ref.text, `${ref.doc}:${ref.line}`);
    assert.ok(ref.end > ref.start);
    n++;
  }
  assert.ok(n > 100);
});

test("a cancellation or a change is passed to the front desk, not booked", () => {
  for (const text of ["I want to cancel my appointment", "Can I change my appointment to Thursday?", "need to reschedule pls"]) {
    const r = ask(text, "+65 8••• 7730");
    assert.equal(r.kind, "change", text);
    assert.equal(r.offered.length, 0, text);
    assert.match(r.reply, /front desk will find your booking/, text);
  }
});

test("Jun: the switch to a new-patient consult leads the panel", () => {
  const r = by("Jun");
  assert.equal(r.changed, true);
  assert.match(r.why, /no visit on record\. Offered a new-patient consult instead/);
});

test("a bare time like 9am is read", () => {
  assert.equal(ask("Dr Teh sat 9am").read.window.from, 540);
});

test("'Wed' sent on a Wednesday evening reads as next Wednesday once today's session is over", () => {
  const r = ask("Dr Oei Wed afternoon", "+65 8••• 7730");
  assert.equal(r.state, "pass");
  assert.equal(times(r.offered)[0], "Wed 25 Nov 14:45");
});

test("a day the doctor is not in says so in the reply", () => {
  const r = ask("follow up with Dr Oei on Thursday", "+65 8••• 7730");
  assert.equal(r.kind, "noslot");
  assert.match(r.reply, /isn't in clinic on Thu 19 Nov/);
});
