# Slot Check

A patient sends a clinic a WhatsApp message asking for an appointment. This page reads the message against the clinic's own tables (patient records, appointment types, doctors, the weekly roster, a diary export and public holidays) and offers only the slots its booking rules allow. Every slot points at the session row, the type row and the bookings either side of it. Every start time it turned down says which rule or booking stopped it. What it cannot read is asked about, not guessed. The front desk approves each reply.

It is plain code. There is no model in it. The sample is made up.

## What it does

Six messages arrive on a Wednesday evening after the clinic has closed for the day. The page reads each one for a doctor, an appointment type, a day and a time, then checks:

1. **Who is asking.** The phone number is looked up in the patient records. A number with no visit on record books a new-patient consult, even if it asks for a follow-up (R7). A follow-up goes to the doctor the patient last saw (R6).
2. **The type.** It sets the length, the buffer kept after it, which doctors take it and whether a referral letter must be on file (R8). An injection needs a procedure session, not a consult session.
3. **The day.** "This week", "next week", weekday names, "tomorrow" and dates like "25 Dec" or "25/12" are read. "Next Fri" sent on a Wednesday can mean this Friday or the one after, so the reply offers both and asks (W3). Public holidays are closed (R5). A date outside the diary export is not offered, because its bookings are not known (R11).
4. **The slot.** It starts on the quarter hour (R1), starts and ends inside one of the doctor's sessions (R2), clears every booking and the buffer after it (R3, cancelled bookings do not count) and gives two hours' notice (R4).

At most three slots are offered, earliest first (R10).

The sample:

- **Wei Ling**, follow-up with Dr Teh after 5 this week: 3 slots on Thursday evening. The 6:15 pm slot is free because the booking that was there was cancelled. 5:30 pm and 7:00 pm are blocked by the 5-minute buffer after a new-patient consult.
- **Rizal**, first visit, any doctor, Saturday morning: 2 slots with Dr Teh. Dr Oei has no Saturday session and Dr Saffuan sees follow-ups only. 11:45 am is turned down because a 30-minute consult would end after the session closes at noon.
- **Devi**, joint injection: held. Her record shows no referral letter on file.
- **Hui Min**, "Dr Tan": not found. There is no Dr Tan at the clinic, and the page does not match it to the nearest name.
- **Jun**, "follow up" from a number with no record: offered new-patient consult slots, with the reason in the reply.
- **Farah**, "next Fri": asked which Friday, with slots for both.

Symptoms and body parts ("my knee") are not read. Clinical questions belong to the clinic team.

"Try your own message" checks a message of your own against the same tables, as if sent at the same time. "Fill in an example" asks for a review on Christmas Day.

## Where a model would go

Real messages come in several languages and in every patient's own shorthand. A model would read them and propose a doctor, a type, a day and a time. Here a small fixed vocabulary stands in for that step, and the words it read are underlined in the message.

The proposal would then go through the same checks, so a receptionist only approves slots that already point at a session, a type and a clear diary. The checks are the part that is tested: `node --test`.

## Limits

- The vocabulary is small and English only. Words it does not know are not read; a message with nothing readable gets a reply asking what the patient needs.
- One clinic, three doctors, three appointment types. No rooms, no equipment, no second branch.
- The roster repeats every week. Leave, locum cover and one-off session changes are not modelled.
- The diary is an export taken at 9:30 pm. A booking made after that is not seen. A real version would read live availability from the clinic's system and check again at the moment of booking.
- An offered slot is not held. Two patients offered the same time (Jun and Farah on Friday at 10:15 am in the sample) could both say yes. The real version would hold a slot for a short time or confirm on a first-come basis.
- "Starting before 10" means the appointment starts before 10, not that it ends by then.
- Referral rules are one yes or no per type. Insurer or panel rules are not modelled.
- Changes and cancellations are spotted and passed to the front desk. The page does not look up the booking being changed.
- Nothing is sent. "Approve reply" only marks the reply as approved on this page.

## Run the tests

```
node --test
```

Needs Node 20 or later. No dependencies. 33 tests cover the sample result, a cancelled booking, a request to cancel or change a booking, a bare time like "9am", a weekday named on that same weekday after its session, a day the doctor is not in, buffers on both sides of a slot, the session end, doctors who do not take a type, the referral rule (with and without a letter on file), an injection in a consult session, a doctor not on the list, a follow-up from a new number, "next Fri" and "next Tuesday" on a Wednesday, the last doctor seen, Christmas Day, a date past the export, dates that are not dates or have passed, two hours' notice, hours with no am or pm, times that cannot both hold, a message with nothing readable, two types in one message, the three-slot cap, that every offered slot clears every live booking and its buffer, and that every reference points at the exact text it claims.

## Open the page locally

```
python3 -m http.server 8798
```

Then open http://localhost:8798. The page makes no network calls beyond its own files.

## Design

The result comes first: how many requests get slots, then each request with its slots and the reply. Rows are split by hairlines, and an underline draws under the words and table cells each answer came from. Green marks what was allowed and the rows it was checked against, red what a rule turned down, amber what is unclear and asked about. Geist for the tool, Newsreader for the patient's words and the table rows, and one teal accent.

Fonts: Geist and Newsreader (SIL Open Font License), in `fonts/`.

## Provenance

Built on 18 Nov 2026 with AI coding agents, directed by Arnold Ikpemosi Adeyemi. The clinic (Wrenfield Orthopaedic Clinic), the doctors (Dr Corwin Teh, Dr Petrina Oei, Dr Imran Saffuan), the patients, the masked phone numbers, the roster and the diary are made up. Web searches for the clinic name and for each doctor's name on 18 Nov 2026 found no clinic or doctor by those names. Patients have first names only. The two public holidays in the table are from Singapore's gazetted 2026 list (Ministry of Manpower).

## Licence

MIT. See `LICENSE`.
