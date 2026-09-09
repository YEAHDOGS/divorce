# LEGAL.md — Verified facts, fee ledger, and copy-risk audit

**Scope:** Local-first Svelte app selling fixed-price ($30) DIY uncontested-divorce
paperwork for **Texas** and **Oklahoma**, no minor children. The product is **not a law
firm**, never files anything with a court, and never gives legal advice.

**House rules for this document (binding on every worker):**
- Never invent a statute, fee, waiting period, form name, or court procedure.
- Every fact below is either **VERIFIED** (traced to a real source accessed 2026-09-09,
  cited in §5) or **PLACEHOLDER** (Brandon must confirm — §4).
- Copy files (`copydeck.*.json`) state only VERIFIED facts, or say
  "check with your county clerk."

---

## 1. Texas — verified facts

All citations below refer to uncontested divorce with no minor children unless noted.

### 1.1 Residency — VERIFIED
Either the petitioner **or** the respondent must have been:
- a **domiciliary of Texas for the preceding 6 months**, AND
- a **resident of the county where the suit is filed for the preceding 90 days**.

Source: primary — Texas Family Code §6.301, on statutes.capitol.texas.gov
(§6.302 allows a nonresident spouse to file if the other spouse meets the 6-month
domicile rule).

### 1.2 Waiting period — VERIFIED
- **Minimum 60 days** from the date the divorce petition is filed before the divorce
  can be granted. Texas Family Code §6.702.
- Counting: day 1 is the day **after** filing; weekends and holidays count; if day 60
  lands on a weekend/holiday, use the next business day.
- Only two exceptions (both family-violence-related) waive it: spouse convicted of /
  received deferred adjudication for a family-violence crime against you or a household
  member; or an active protective / magistrate's emergency-protection order.
- Sources: TexasLawHelp ("Divorce in Texas" article; "I need a divorce. We do not
  have minor children" guide; Set A kit instructions).

### 1.3 Grounds — VERIFIED
- No-fault ground most people use: **insupportability** (marriage has become
  insupportable because of discord or conflict of personalities).
- Grounds listed at Tex. Fam. Code §§6.001–6.008.
- Source: TexasLawHelp "Divorce in Texas" article.

### 1.4 Forms / procedure (agreed divorce, no children) — VERIFIED
TexasLawHelp publishes a free kit — **Set A: Instructions & Forms for an Agreed
Divorce without Children**. Its documents:
1. **Original Petition for Divorce** — starts the case.
2. **Waiver of Service or Answer** — signed by the respondent; avoids formal service.
3. **Final Decree of Divorce** — signed by both spouses; the judge signs it to grant
   the divorce.
4. **Information on Suit Affecting the Family Relationship** (the "Austin form",
   VS-165) — printed front-and-back on one sheet.
5. **Sample Testimony for Divorce without Children** — a "prove-up script" the
   petitioner reads to the judge at the final hearing (separate versions for
   opposite-sex / same-sex marriages — Sets A and D).

Practical notes from TexasLawHelp:
- One spouse files the petition; the other signs the waiver/answer.
- After the 60 days, the **petitioner goes to court for a final hearing**; call the
  clerk's office to learn when/where the court hears uncontested cases.
- You cannot lie in court testimony — it's a crime.
- Fee waiver exists: **Statement of Inability to Afford Payment of Court Costs**.

> **Competitive note for Brandon:** TexasLawHelp already gives these forms away free.
> Our product's value is the guided walkthrough + organization, NOT the forms
> themselves. Never claim our forms are "the only way" or official.

### 1.5 Filing fees — VERIFIED (partial)
- The Texas Office of Court Administration's uniform civil-fee schedule totals
  **$350.00** for a new civil suit (Local Consolidated Civil Fee $213 + State
  Consolidated Civil Fee $137) — txcourts.gov, OCA schedule (2024).
- **Harris County (Houston) District Clerk fee schedule:** "Divorce no Children"
  **$350.00**; "Divorce with Children" $365.00. (hcdistrictclerk.com)
- Fees **vary by county** across Texas's 254 counties. Anything beyond Harris County
  is PLACEHOLDER until Brandon confirms target counties.

---

## 2. Oklahoma — verified facts

All citations refer to uncontested divorce with no minor children unless noted.
Sourced from Oklahoma attorneys' published guides (jpcannonlawfirm.com,
burrlawoffices.com, kanialaw.com, bedlamlaw.com, browngouldlaw.com, wirthlawoffice.com)
and official county/statute pages. Recommend a second pass against OSCN.net /
oklegislature.gov Title 43 before launch.

### 2.1 Residency — VERIFIED
- One spouse must have lived in **Oklahoma for at least 6 months** before filing,
  and in the **county of filing for at least 30 days**.
- Cited to Oklahoma Statutes **Title 43 §§ 102, 103** by multiple OK firms
  (e.g., jpcannonlawfirm.com).
- Military exception: being stationed in Oklahoma (e.g., Tinker AFB, Fort Sill)
  counts.

### 2.2 Waiting period — VERIFIED
- **No minor children: at least 10 days** from the filing date before the court can
  grant the divorce. Uncontested no-children divorces can complete in ~10 days.
- **With minor children: 90 days** from filing (a judge may waive it if both spouses
  sign a waiver — kaniaw.com notes this). This product does not serve cases with
  minor children, so the 90-day rule belongs only in the "who it's NOT for" copy.
- Sources: jpcannonlawfirm.com, kaniaw.com, bedlamlaw.com, burrlawoffices.com.

### 2.3 Grounds — VERIFIED
- Oklahoma has **12 statutory grounds** for divorce (Title 43 § 101); the no-fault
  equivalent most people use is **incompatibility**.
- Sources: browngouldlaw.com, jpcannonlawfirm.com.

### 2.4 Forms / procedure — VERIFIED (and important)
- **Oklahoma is a "non-form" state.** The Canadian County (OK) Court Clerk's official
  site states the clerk's office **does not provide divorce papers** (only the
  waiver and summons); papers "may be obtained through a legal service or an
  attorney."
- Practical filing list (Canadian County Clerk, official): one original + two copies
  of the required paperwork; summons issued by the clerk at filing; **Entry of
  Appearance / Waiver of Automatic Temporary Injunction must NOT be signed by the
  respondent until 24 hours AFTER the petition is filed.**
- Consequence for the product: **never call anything we generate an "Oklahoma court
  form."** The product prepares organized paperwork; the clerk and judge decide what
  they accept. "Verify with your county clerk" is load-bearing copy, not boilerplate.
- Fee-waiver concept exists: *in forma pauperis* provision referenced in 28 O.S.
  §152 (details PLACEHOLDER).

### 2.5 Filing fees — VERIFIED (partial)
- **Statutory flat fee: $183.00** for "actions for divorce" — 28 O.S. § 152,
  verified in the enrolled text of HB 2912 on oklegislature.gov (2021–22).
- **Actual county totals run higher** because counties add surcharges:
  - Canadian County Clerk (official site): **$255.89** for "Divorce without minor
    children" (+ $10 summons fee).
  - Wirth Law (Tulsa, attorney guide): typical filing fee **~$272.14** with summons.
- So: verified range $183 statutory → ~$256–272 observed at the county level.
  Fees **vary by county**; exact numbers for target counties are PLACEHOLDER.

---

## 3. Filing-fee ledger (what the user actually pays)

| Item | Verified | Notes |
|---|---|---|
| Our product price | **$30 fixed** (product decision) | Checkout not open yet — see §6 copy rules |
| TX court filing fee | $350 base (Harris County, no children; OCA schedule $213+$137) | Varies by county; confirm target counties |
| OK court filing fee | $183 statutory flat (28 O.S. §152); ~$256–272 observed (Canadian Co. $255.89; Tulsa ~$272.14) | Varies by county; confirm target counties |
| Service of process | Avoidable in agreed cases via signed waiver | Process server $50–100 if needed (attorney-sourced estimate) |
| Fee waivers | Exist in both states | TX: Statement of Inability to Afford Payment of Court Costs (verified via TexasLawHelp). OK: *in forma pauperis* (details PLACEHOLDER) |

**Our $30 covers the paperwork preparation only. Court filing fees are separate and
are paid to the court, never to us.** This sentence (or its Spanish twin) must appear
near every price mention.

---

## 4. PLACEHOLDER ledger — Brandon must confirm

1. **Exact TX filing fees for the counties we will name in the app.** Verified only
   for Harris County ($350 no children). TX has 254 counties; we name no other
   number anywhere until confirmed.
2. **Exact OK filing fees for the counties we will name.** Verified: $183 statutory;
   $255.89 (Canadian County official); ~$272.14 (Tulsa attorney guide).
3. **$30 price presentation.** Product decision; checkout is NOT open. All pricing
   copy must say "checkout not open yet" or equivalent until it is.
4. **Whether we ship county-specific form packets or one per-state packet.** OK's
   non-form status makes this a real product risk.
5. **OK statute text verification against OSCN.net / oklegislature.gov Title 43**
   (residency §§102–103, waiting period, grounds §101). Current citations come from
   OK law-firm guides — good, but a primary-source pass is warranted pre-launch.
6. **Same-sex marriage handling in TX packets.** TexasLawHelp splits Set A
   (opposite-sex) / Set D (same-sex) testimony scripts. Product decision: ask, or
   generate both.
7. **Who appears in court.** TexasLawHelp: the petitioner attends the prove-up hearing
   in TX agreed divorces; the respondent typically signs the waiver and need not
   appear. README currently says "go together to the courthouse" — confirm the exact
   instruction per state before we hard-code it (see audit item R-6).
8. **Name-change requests, QDROs, and anything beyond the plain no-children split** —
   explicitly out of scope; the eligibility screen must screen these out.
9. **Refund policy for the $30** once checkout opens. No copy may imply a refund
   until the policy exists.

---

## 5. Sources (all accessed 2026-09-09)

**Texas**
- Texas Family Code §6.301 (residency) — primary:
  https://statutes.capitol.texas.gov/Docs/FA/htm/FA.6.htm
- TexasLawHelp, "Divorce in Texas" (residency §6.301, grounds §§6.001–6.008,
  60-day wait §6.702): https://texaslawhelp.org/article/divorce-in-texas
- TexasLawHelp, "I need a divorce. We do not have minor children" (Set A kit,
  60-day counting rules, prove-up, Austin form): 
  https://texaslawhelp.org/guide/i-need-a-divorce-we-do-not-have-minor-children
- TexasLawHelp, Set A kit page: https://texaslawhelp.org/form/kit-agreed-divorce-instructions-forms-set-a
- OCA uniform civil fee schedule (2024, $350 total: $213 local + $137 state):
  https://txcourts.gov/media/1457713/dc-civ-suits-actions-2024-final.pdf
- Harris County District Clerk civil/family fee schedule ("Divorce no Children
  $350.00"): https://hcdistrictclerk.com/Common/civil/pdf/Fee_Schedule_Civil_And_Family.pdf

**Oklahoma**
- 28 O.S. §152, $183.00 flat fee for divorce actions (HB 2912 enrolled text):
  https://oklegislature.gov/cf_pdf/2021-22%20ENR/hB/HB2912%20ENR.PDF
- Canadian County Court Clerk, official divorce page (non-form state, $255.89
  divorce without children, waiver timing rule):
  https://www.canadiancounty.org/1070/Divorce
- Uncontested-divorce process, 10-day / 90-day waits, residency 6 mo / 30 days,
  Title 43 §§102, 103: https://jpcannonlawfirm.com/2023/01/what-is-the-process-for-uncontested-divorce-in-oklahoma/
- 12 grounds incl. incompatibility: https://www.browngouldlaw.com/oklahoma-divorce-basics/
- 10-day wait, 90-day child wait (waivable by joint waiver):
  https://www.kanialaw.com/tulsa-law-info/getting-divorced-in-oklahoma
- Typical Tulsa filing cost ~$272.14:
  https://www.wirthlawoffice.com/tulsa-attorney-blog/2021/05/how-much-does-a-divorce-cost

---

## 6. Risky-strings audit — existing copy that overpromises

I did **not** edit any of these files (new-files-only rule). The coordinator should
apply the fixes when merging the copydeck. Every quote below is verbatim.

### src/messages/en.json

**R-1. `app.tagline` — "An uncontested divorce in Texas or Oklahoma for $30."**
- Risk: reads as "buy now, get divorced for $30." Checkout does not exist, and $30
  never covered court fees.
- Fix: "Uncontested-divorce paperwork for Texas & Oklahoma. $30 fixed price — court
  fees separate." + honest checkout status nearby.

**R-2. `app.intro` — "Answer a few simple questions and get printable court forms."**
- Risk: "court forms" implies official forms. In Oklahoma (a non-form state) there
  is no such thing; even in Texas, acceptance is the clerk's call.
- Fix: "Answer a few simple questions and get printable paperwork organized for
  filing." Never promise acceptance.

**R-3. `app.features.private_desc` — "…only order history is ever stored."**
- Risk: asserts an order system exists. It doesn't yet.
- Fix: drop the clause until checkout ships, or write: "No accounts, no uploads.
  Everything is prepared locally in your browser." (Recommended replacement is in
  copydeck: `privacy.honest`.)

**R-4. `meta.description` — "…for Texas and Oklahoma courthouses for $30."**
- Risk: same as R-1; SEO snippet is the first thing a court clerk or regulator sees.
- Fix: "Prepare uncontested, no-children divorce paperwork for Texas and Oklahoma.
  $30 fixed price for the paperwork; court filing fees are separate and paid to the
  court."

**R-5. Missing entirely: no not-a-law-firm disclaimer, no "not legal advice" notice,
no eligibility gate, no verify-with-clerk instruction.**
- Fix: merge copydeck keys (`disclaimer.*`, `eligibility.*`, `not_for.*`,
  `verify_clerk`) into the live dictionaries before any public deploy.

### src/messages/es.json
Same five issues, translated (R-1…R-5 apply 1:1 — "por $30", "formularios
imprimibles para el tribunal", "solo se guarda el historial de pedidos").

### README.md (repo root — informational, but it leaks into marketing if quoted)

**R-6. "you print them out and go together to the courthouse"**
- Risk: in Texas agreed divorces, typically only the petitioner appears for the
  prove-up; the respondent signs the waiver. "Go together" overstates it and may be
  wrong per county.
- Fix: "you print the packet, sign where indicated, and file at the courthouse —
  check your county clerk's instructions for who must appear."

**R-7. "get printable forms valid in all Oklahoma and Texas courthouses"**
- Risk: the strongest overpromise in the repo. No private company can certify
  validity in "all" courthouses; Oklahoma is a non-form state.
- Fix: "get a printable paperwork packet organized for Texas or Oklahoma filing —
  always verify against your county clerk's current requirements before filing."

**R-8. Roadmap: "Payment for the $30 order (transaction history is the only thing
DOGS stores)"**
- Internal, fine — but keep this framing OUT of public copy until checkout opens
  (see R-3).

### Phrases that must never ship
- ❌ "filed with the court for you" / "we file" — we never file anything.
- ❌ "guaranteed" / "valid in all courthouses" / "court-approved forms."
- ❌ "legal advice" as something we provide; "attorney" as something we are.
- ❌ Any fee number not in §3's ledger.
- ❌ "featured applicant"-style endorsement language (standing rule).
- ❌ The user's personal name on commits or in copy (standing rule).

---

## 7. Copy placement guidance (for the coordinator)

- **Disclaimer (short)** — persistent footer on every screen.
- **Disclaimer (long) + not-legal-advice** — shown once before the questionnaire
  starts, with an explicit acknowledge checkbox.
- **Eligibility questions** — first screen; any "no" routes to the "not for you"
  panel + attorney referral line.
- **Print banner** — top of every printed page: "This is an organizer/worksheet,
  not a court form — verify with your county clerk."
- **Pricing line** — adjacent to every $30 mention: "Court filing fees are separate
  and paid to the court. Checkout isn't open yet."

All canonical strings live in `src/messages/copydeck.en.json` /
`src/messages/copydeck.es.json` (same key sets, per `dictionaries.test.js`
conventions) for merge into the live dictionaries.
