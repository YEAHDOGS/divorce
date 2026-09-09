/**
 * staging-demo-answers.js — TEST-MODE-ONLY questionnaire fixture.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  STAGING / DEMO ONLY. These are not real people: every name here is
 *  deliberately fake ("Sample" parties). The fixture exists so the
 *  staging frontend can run the full $30 test flow — checkout → paid
 *  receipt → printable packet — BEFORE the real questionnaire UI ships.
 *  When intake answers reach the frontend, this fixture goes away and
 *  the real answers flow through buildPacket instead.
 * ═══════════════════════════════════════════════════════════════════
 *
 * The answers describe a clean uncontested path: Texas filing, 6+ month
 * residency, fully agreed split, no minor children — so checkEligibility
 * returns { complete: true, eligible: true, reasons: [] }.
 */

import { checkEligibility } from './questionnaire.js';

/** The fake, complete, eligible intake answers the staging flow uses. */
export const STAGING_DEMO_ANSWERS = Object.freeze({
  state: 'TX',
  petitionerName: 'Jane Sample',
  respondentName: 'John Sample',
  county: 'Tulsa',
  marriageDate: '2015-06-15',
  marriagePlace: 'Tulsa, Oklahoma',
  residency: true,
  uncontested: true,
  minorChildren: false,
  propertySplit: true,
});

/**
 * Fail loudly if the fixture ever drifts into incomplete/ineligible —
 * the staging download button calls buildPacket, which throws
 * QUESTIONNAIRE_INCOMPLETE on bad answers. Loud here beats cryptic there.
 *
 * @returns {true} when the fixture is complete and eligible
 * @throws {Error} when it is not
 */
export function assertDemoAnswersValid() {
  const { complete, eligible, reasons } = checkEligibility(STAGING_DEMO_ANSWERS);
  if (!complete || !eligible) {
    throw new Error(
      `staging-demo-answers: fixture is ${complete ? 'complete' : 'incomplete'}/` +
        `${eligible ? 'eligible' : 'ineligible'} — reasons: ${reasons.join(', ')}`
    );
  }
  return true;
}
