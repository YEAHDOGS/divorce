/**
 * staging-demo-answers.test.js — the staging packet fixture stays valid.
 *
 * The download-packet button in the staging receipt view builds the
 * packet from STAGING_DEMO_ANSWERS. If this fixture ever drifts into
 * incomplete/ineligible, buildPacket throws QUESTIONNAIRE_INCOMPLETE and
 * the staging flow breaks — so pin the fixture's eligibility here.
 */
import { describe, it, expect } from 'vitest';
import { checkEligibility } from './questionnaire.js';
import { STAGING_DEMO_ANSWERS, assertDemoAnswersValid } from './staging-demo-answers.js';

describe('staging-demo-answers', () => {
  it('is complete and eligible for the uncontested path', () => {
    const { complete, eligible, reasons } = checkEligibility(STAGING_DEMO_ANSWERS);
    expect(reasons).toEqual([]);
    expect(complete).toBe(true);
    expect(eligible).toBe(true);
  });

  it('assertDemoAnswersValid passes on the shipped fixture', () => {
    expect(assertDemoAnswersValid()).toBe(true);
  });

  it('uses obviously-fake names so test packets are never confused with real ones', () => {
    expect(STAGING_DEMO_ANSWERS.petitionerName).toMatch(/sample/i);
    expect(STAGING_DEMO_ANSWERS.respondentName).toMatch(/sample/i);
  });

  it('is frozen so staging code cannot mutate the fixture in place', () => {
    expect(Object.isFrozen(STAGING_DEMO_ANSWERS)).toBe(true);
  });
});
