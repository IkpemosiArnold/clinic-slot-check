// Sample data. Everything here is made up: the clinic, the doctors, the patients,
// the phone numbers (masked) and the diary. The public holidays are Singapore's
// gazetted 2026 dates.

export const CLINIC = "Wrenfield Orthopaedic Clinic";

// When the six messages are read: Wednesday evening, after the clinic has closed for the day.
export const SENT_AT = "2026-11-18T21:40";

export const tables = {
  // Appointment types: length, the buffer kept after it, who takes it, and the rules attached.
  types: `code,name,minutes,buffer_after,doctors,needs_referral,session_kind
NEW,New-patient consult,30,5,Teh;Oei,no,consult
FU,Follow-up review,15,0,Teh;Oei;Saffuan,no,consult
INJ,Joint injection,30,10,Oei,yes,procedure`,

  doctors: `short,name
Teh,Dr Corwin Teh
Oei,Dr Petrina Oei
Saffuan,Dr Imran Saffuan`,

  // The weekly roster. A session is a block of time a doctor sees patients in.
  roster: `session,doctor,day,start,end,kind
S1,Teh,Mon,09:00,13:00,consult
S2,Teh,Thu,17:00,20:00,consult
S3,Teh,Sat,09:00,12:00,consult
S4,Oei,Tue,08:30,12:30,procedure
S5,Oei,Wed,14:00,17:30,consult
S6,Oei,Fri,09:00,13:00,consult
S7,Saffuan,Fri,17:30,20:00,consult`,

  // The diary, as a clinic system exports it.
  export: `exported,2026-11-18 21:30
from,2026-11-19
to,2026-11-28`,

  appts: `id,date,start,end,doctor,type,status
B-2201,2026-11-19,17:00,17:30,Teh,NEW,Booked
B-2202,2026-11-19,17:45,18:00,Teh,FU,Booked
B-2203,2026-11-19,18:00,18:15,Teh,FU,Booked
B-2204,2026-11-19,18:15,18:30,Teh,FU,Cancelled
B-2205,2026-11-19,18:30,19:00,Teh,NEW,Booked
B-2206,2026-11-19,19:15,19:30,Teh,FU,Booked
B-2207,2026-11-20,09:00,09:30,Oei,NEW,Booked
B-2208,2026-11-20,09:45,10:00,Oei,FU,Booked
B-2209,2026-11-20,10:00,10:15,Oei,FU,Booked
B-2210,2026-11-20,11:00,11:30,Oei,NEW,Booked
B-2211,2026-11-20,17:30,17:45,Saffuan,FU,Booked
B-2212,2026-11-21,09:00,09:15,Teh,FU,Booked
B-2213,2026-11-21,09:15,09:30,Teh,FU,Booked
B-2214,2026-11-21,09:30,10:00,Teh,NEW,Booked
B-2215,2026-11-21,10:15,10:30,Teh,FU,Booked
B-2216,2026-11-21,10:30,10:45,Teh,FU,Booked
B-2217,2026-11-21,11:00,11:15,Teh,FU,Booked
B-2218,2026-11-23,09:00,09:30,Teh,NEW,Booked
B-2219,2026-11-23,09:30,09:45,Teh,FU,Booked
B-2220,2026-11-23,10:00,10:15,Teh,FU,Booked
B-2221,2026-11-24,08:30,09:00,Oei,INJ,Booked
B-2222,2026-11-24,09:15,09:45,Oei,INJ,Booked
B-2223,2026-11-24,10:30,11:00,Oei,INJ,Booked
B-2224,2026-11-25,14:00,14:30,Oei,NEW,Booked
B-2225,2026-11-26,17:00,17:15,Teh,FU,Booked
B-2226,2026-11-27,09:00,09:30,Oei,NEW,Booked
B-2227,2026-11-27,10:00,10:15,Oei,FU,Booked
B-2228,2026-11-28,09:00,09:30,Teh,NEW,Booked`,

  patients: `phone,first_name,last_visit,last_doctor,referral_letter
+65 9••• 2141,Wei Ling,2026-10-22,Teh,no
+65 8••• 7730,Devi,2026-11-03,Oei,no
+65 9••• 5068,Hui Min,2026-09-30,Teh,no
+65 8••• 3392,Farah,2026-10-30,Oei,no
+65 9••• 6604,Arif,2026-11-10,Oei,yes`,

  holidays: `date,name
2026-11-09,Deepavali (observed)
2026-12-25,Christmas Day`,

  rules: `R1 Slots start on the quarter hour.
R2 An appointment starts and ends inside one of the doctor's sessions, of the kind its type needs.
R3 It may not overlap a booking or the buffer after one. Cancelled bookings do not count. A buffer may run past the end of a session.
R4 At least 2 hours' notice.
R5 No bookings on a public holiday.
R6 A follow-up is with the doctor the patient last saw.
R7 A number with no visit on record books a new-patient consult.
R8 A type that needs a referral is booked only when the record shows a referral letter on file.
R9 No type named: a patient on record gets a follow-up, a new number a new-patient consult.
R10 Offer at most 3 slots, earliest first. If the day is unclear, up to 3 for each reading, and ask.
R11 No slot is offered on a date the diary export does not cover.`,

  reading: `W1 "after 5", "before 10": hours 1 to 7 read as pm, 8 to 12 as am or noon.
W2 Morning is a start from 08:00 to before 12:00, afternoon 12:00 to before 17:00, evening from 17:00.
W3 "next Fri" sent while Friday is still ahead this week can mean either Friday. The reply asks.
W4 "this week" runs from the message to Sunday. "next week" is the Monday to Sunday after.
W5 No day named: the 7 days after the message.
W6 Words about symptoms or body parts are not read. Clinical questions go to the team.`,
};

// Six WhatsApp messages that came in after hours.
export const messages = [
  { id: "m1", from: "+65 9••• 2141", name: "Wei Ling", at: "2026-11-18T21:12", text: "Hi, can I see Dr Teh after 5 for my follow up? This week can" },
  { id: "m2", from: "+65 9••• 8810", name: "Rizal", at: "2026-11-18T21:19", text: "Hello, first time here. My GP gave me a referral letter for my knee. Any doctor, Saturday morning?" },
  { id: "m3", from: "+65 8••• 7730", name: "Devi", at: "2026-11-18T21:24", text: "Can I book the knee injection with Dr Oei next Tuesday morning?" },
  { id: "m4", from: "+65 9••• 5068", name: "Hui Min", at: "2026-11-18T21:30", text: "Dr Tan pls, any time Monday" },
  { id: "m5", from: "+65 8••• 1256", name: "Jun", at: "2026-11-18T21:33", text: "Hi I need a follow up with Dr Oei, Friday morning" },
  { id: "m6", from: "+65 8••• 3392", name: "Farah", at: "2026-11-18T21:38", text: "Can I come next Fri for my review? Morning better" },
];

export const pasteExample = {
  text: "Can I see Dr Oei on 25 Dec morning for my review",
  from: "+65 8••• 3392",
};
