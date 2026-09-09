import { describe, expect, it } from 'vitest';
import {
  STEPS,
  REASONS,
  ERROR_KEYS,
  SUPPORTED_STATES,
  getStep,
  validateAnswer,
  checkEligibility,
  buildOrganizer,
  createSession,
} from './questionnaire.js';

/** A fully passing answer set (Texas, uncontested, no kids, property split). */
function passingAnswers() {
  return {
    state: 'TX',
    petitionerName: 'Alex Rivera',
    respondentName: 'Jordan Rivera',
    county: 'Tulsa',
    marriageDate: '2015-06-20',
    marriagePlace: 'Dallas, Texas',
    residency: true,
    uncontested: true,
    minorChildren: false,
    propertySplit: true,
  };
}

/** Answer the whole session in order; returns the session. */
function runSession(answers) {
  const session = createSession();
  for (const step of STEPS) {
    const result = session.answer(answers[step.id]);
    expect(result.ok, `step ${step.id}`).toBe(true);
  }
  return session;
}

describe('step definitions', () => {
  it('exposes 8-10 ordered steps with ids, kinds, and question keys', () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(8);
    expect(STEPS.length).toBeLessThanOrEqual(10);
    for (const step of STEPS) {
      expect(step.id).toBeTruthy();
      expect(step.kind).toBeTruthy();
      expect(step.questionKey.startsWith('q.')).toBe(true);
    }
    expect(STEPS.map((s) => s.id)).toEqual([
      'state',
      'petitionerName',
      'respondentName',
      'county',
      'marriageDate',
      'marriagePlace',
      'residency',
      'uncontested',
      'minorChildren',
      'propertySplit',
    ]);
  });

  it('getStep returns undefined for unknown ids', () => {
    expect(getStep('nope')).toBeUndefined();
    expect(getStep('state').kind).toBe('select');
  });
});

describe('validateAnswer', () => {
  it('rejects unknown steps and blank values', () => {
    expect(validateAnswer('nope', 'x').ok).toBe(false);
    expect(validateAnswer('county', '').error).toBe(ERROR_KEYS.REQUIRED);
    expect(validateAnswer('county', '   ').error).toBe(ERROR_KEYS.REQUIRED);
    expect(validateAnswer('petitionerName', null).error).toBe(ERROR_KEYS.REQUIRED);
  });

  it('validates the filing state', () => {
    for (const state of SUPPORTED_STATES) {
      expect(validateAnswer('state', state)).toEqual({ ok: true, error: null });
    }
    expect(validateAnswer('state', 'CA').error).toBe(ERROR_KEYS.INVALID_STATE);
    expect(validateAnswer('state', 'tx').error).toBe(ERROR_KEYS.INVALID_STATE);
  });

  it('validates names (unicode letters, hyphens, apostrophes ok)', () => {
    expect(validateAnswer('petitionerName', 'María-José O\u2019Connor').ok).toBe(true);
    expect(validateAnswer('respondentName', 'Li Wei').ok).toBe(true);
    expect(validateAnswer('petitionerName', 'A').error).toBe(ERROR_KEYS.INVALID_NAME);
    expect(validateAnswer('petitionerName', 'John123').error).toBe(ERROR_KEYS.INVALID_NAME);
    expect(validateAnswer('petitionerName', 'x'.repeat(121)).error).toBe(ERROR_KEYS.INVALID_NAME);
  });

  it('validates county and marriage place', () => {
    expect(validateAnswer('county', 'Tulsa').ok).toBe(true);
    expect(validateAnswer('county', 'St. Louis').ok).toBe(true);
    expect(validateAnswer('county', 'X').error).toBe(ERROR_KEYS.INVALID_COUNTY);
    expect(validateAnswer('marriagePlace', 'Dallas, Texas').ok).toBe(true);
    expect(validateAnswer('marriagePlace', '??').error).toBe(ERROR_KEYS.INVALID_PLACE);
  });

  it('validates marriage dates strictly', () => {
    expect(validateAnswer('marriageDate', '2015-06-20')).toEqual({ ok: true, error: null });
    expect(validateAnswer('marriageDate', '2023-02-30').error).toBe(ERROR_KEYS.INVALID_DATE);
    expect(validateAnswer('marriageDate', '06/20/2015').error).toBe(ERROR_KEYS.INVALID_DATE);
    expect(validateAnswer('marriageDate', '1899-12-31').error).toBe(ERROR_KEYS.DATE_TOO_OLD);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);
    expect(validateAnswer('marriageDate', iso).error).toBe(ERROR_KEYS.FUTURE_DATE);
  });

  it('validates yes/no answers as strict booleans', () => {
    expect(validateAnswer('uncontested', true).ok).toBe(true);
    expect(validateAnswer('uncontested', false).ok).toBe(true);
    expect(validateAnswer('uncontested', 'yes').error).toBe(ERROR_KEYS.INVALID_YESNO);
    expect(validateAnswer('uncontested', 1).error).toBe(ERROR_KEYS.INVALID_YESNO);
    expect(validateAnswer('uncontested', undefined).error).toBe(ERROR_KEYS.INVALID_YESNO);
  });
});

describe('checkEligibility matrix', () => {
  const criteria = [
    { name: 'state', pass: 'TX', fail: 'CA', reason: REASONS.NON_RESIDENT },
    { name: 'residency', pass: true, fail: false, reason: REASONS.NO_RESIDENCY_DURATION },
    { name: 'uncontested', pass: true, fail: false, reason: REASONS.CONTESTED },
    { name: 'minorChildren', pass: false, fail: true, reason: REASONS.MINOR_CHILDREN },
    { name: 'propertySplit', pass: true, fail: false, reason: REASONS.PROPERTY_DISPUTE },
  ];

  it('is eligible only when every criterion passes (all 32 combos)', () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const answers = passingAnswers();
      const expectedReasons = [];
      criteria.forEach((c, i) => {
        const fails = (mask >> i) & 1;
        if (fails) {
          answers[c.name] = c.fail;
          expectedReasons.push(c.reason);
        }
      });
      const result = checkEligibility(answers);
      expect(result.complete).toBe(true);
      expect(result.eligible, `mask ${mask}`).toBe(mask === 0);
      expect(result.reasons.sort()).toEqual(expectedReasons.sort());
    }
  });

  it('reports incomplete when answers are missing, without false reasons', () => {
    const partial = { state: 'OK', petitionerName: 'Alex Rivera' };
    const result = checkEligibility(partial);
    expect(result.complete).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('flags single disqualifiers on partial answers', () => {
    expect(checkEligibility({ minorChildren: true }).reasons).toEqual([REASONS.MINOR_CHILDREN]);
    expect(checkEligibility({ uncontested: false }).reasons).toEqual([REASONS.CONTESTED]);
  });

  it('accepts Oklahoma as a supported filing state', () => {
    const answers = { ...passingAnswers(), state: 'OK', county: 'Oklahoma' };
    expect(checkEligibility(answers).eligible).toBe(true);
  });
});

describe('session step flow', () => {
  it('cannot skip steps: answer() only applies to the current step', () => {
    const session = createSession();
    expect(session.currentStep.id).toBe('state');
    // Try to sneak a later answer in early: it is validated as a state, not a name.
    const sneaky = session.answer('Alex Rivera');
    expect(sneaky.ok).toBe(false);
    expect(sneaky.error).toBe(ERROR_KEYS.INVALID_STATE);
    expect(session.currentStep.id).toBe('state');
    expect(session.answers).toEqual({});
  });

  it('invalid answers never advance the session', () => {
    const session = createSession();
    session.answer('TX');
    expect(session.currentStep.id).toBe('petitionerName');
    const bad = session.answer('A');
    expect(bad.ok).toBe(false);
    expect(session.currentStep.id).toBe('petitionerName');
    expect(session.progress.answered).toBe(1);
  });

  it('tracks progress and completes the full flow', () => {
    const session = createSession();
    expect(session.status).toBe('incomplete');
    expect(session.progress).toMatchObject({ current: 1, total: 10, answered: 0, percent: 0 });
    const done = runSession(passingAnswers());
    expect(done.status).toBe('complete');
    expect(done.progress).toMatchObject({ answered: 10, percent: 100 });
    expect(done.ineligibilityReasons).toEqual([]);
  });

  it('flags ineligible as soon as a disqualifying answer lands', () => {
    const session = createSession();
    const answers = passingAnswers();
    for (const step of STEPS) {
      const value = step.id === 'minorChildren' ? true : answers[step.id];
      session.answer(value);
    }
    expect(session.status).toBe('ineligible');
    expect(session.ineligibilityReasons).toEqual([REASONS.MINOR_CHILDREN]);
  });

  it('back() moves one step back, never below zero, and keeps answers', () => {
    const session = createSession();
    session.answer('TX');
    session.answer('Alex Rivera');
    expect(session.currentStep.id).toBe('respondentName');
    session.back();
    expect(session.currentStep.id).toBe('petitionerName');
    session.back();
    session.back();
    session.back();
    expect(session.currentStep.id).toBe('state');
    expect(session.answers.state).toBe('TX');
    // Re-answering the current step overwrites it.
    session.answer('OK');
    expect(session.answers.state).toBe('OK');
  });

  it('reset() clears everything', () => {
    const session = runSession(passingAnswers());
    session.reset();
    expect(session.status).toBe('incomplete');
    expect(session.answers).toEqual({});
    expect(session.currentStep.id).toBe('state');
  });

  it('snapshot() is serializable and restores the essentials', () => {
    const session = createSession();
    session.answer('TX');
    const snap = session.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.stepIndex).toBe(1);
    expect(snap.answers).toEqual({ state: 'TX' });
    expect(snap.status).toBe('incomplete');
  });
});

describe('buildOrganizer', () => {
  it('throws when answers are incomplete or ineligible', () => {
    expect(() => buildOrganizer({})).toThrow(/not complete and eligible/);
    const bad = { ...passingAnswers(), uncontested: false };
    try {
      buildOrganizer(bad);
      expect.unreachable();
    } catch (err) {
      expect(err.code).toBe('QUESTIONNAIRE_INCOMPLETE');
      expect(err.reasons).toEqual([REASONS.CONTESTED]);
    }
  });

  it('produces the full printable summary shape for Texas', () => {
    const org = buildOrganizer(passingAnswers());
    expect(org.version).toBe(1);
    expect(new Date(org.generatedAt).toString()).not.toBe('Invalid Date');
    expect(org.state).toBe('TX');
    expect(org.stateName).toBe('Texas');
    expect(org.parties).toEqual({ petitioner: 'Alex Rivera', respondent: 'Jordan Rivera' });
    expect(org.marriage).toEqual({ date: '2015-06-20', place: 'Dallas, Texas' });
    expect(org.filing).toEqual({ county: 'Tulsa', court: 'Tulsa County District Court' });
    expect(org.attestations).toEqual({
      residency: true,
      uncontested: true,
      noMinorChildren: true,
      propertySplit: true,
    });
    expect(org.eligibility).toEqual({ eligible: true, reasons: [] });
    expect(org.checklist).toHaveLength(5);
    for (const item of org.checklist) {
      expect(item.id).toBeTruthy();
      expect(item.titleKey.startsWith('q.checklist.')).toBe(true);
      expect(item.detailKey.startsWith('q.checklist.')).toBe(true);
      expect(item.title).toBeTruthy();
      expect(item.detail).toBeTruthy();
    }
    // Texas checklist includes the 60-day waiting period and the TX decree.
    const ids = org.checklist.map((i) => i.id);
    expect(ids).toContain('tx_waiting');
    expect(ids).toContain('tx_decree');
    expect(org.disclaimerKey).toBe('q.organizer.disclaimer');
  });

  it('produces the Oklahoma checklist for OK filings', () => {
    const org = buildOrganizer({ ...passingAnswers(), state: 'OK', county: 'Oklahoma' });
    const ids = org.checklist.map((i) => i.id);
    expect(ids).toContain('ok_petition');
    expect(ids).toContain('ok_appearance');
    expect(ids).toContain('ok_decree');
    expect(ids).not.toContain('tx_waiting');
    expect(org.filing.court).toBe('Oklahoma County District Court');
  });

  it('resolves checklist strings from a provided dictionary', () => {
    const strings = {
      'q.checklist.tx_petition.title': 'TÍTULO',
      'q.checklist.tx_petition.detail': 'DETALLE',
      'q.organizer.disclaimer': 'AVISO',
    };
    const org = buildOrganizer(passingAnswers(), strings);
    const petition = org.checklist.find((i) => i.id === 'tx_petition');
    expect(petition.title).toBe('TÍTULO');
    expect(petition.detail).toBe('DETALLE');
    expect(org.disclaimer).toBe('AVISO');
    // Untranslated items fall back to their keys.
    const waiting = org.checklist.find((i) => i.id === 'tx_waiting');
    expect(waiting.title).toBe('q.checklist.tx_waiting.title');
  });

  it('is reachable from a completed session', () => {
    const session = runSession(passingAnswers());
    const org = session.buildOrganizer();
    expect(org.parties.petitioner).toBe('Alex Rivera');
  });
});
