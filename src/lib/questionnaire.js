/**
 * Questionnaire engine for the uncontested-divorce intake.
 *
 * Pure vanilla JS: no framework, no DOM, no dependencies. All UI strings live
 * in the `q.*` namespace of src/messages/{en,es}.json; this module only deals
 * in step ids, error keys, and eligibility reason codes so it stays fully
 * unit-testable in Node.
 *
 * Step flow (10 questions):
 *   state -> petitionerName -> respondentName -> county -> marriageDate ->
 *   marriagePlace -> residency -> uncontested -> minorChildren -> propertySplit
 *
 * Eligibility: the $30 uncontested path requires a Texas/Oklahoma filing,
 * 6+ months of in-state residency, a fully agreed (uncontested) split, no
 * minor children together, and agreement on property/debts. Anything else
 * yields `ineligible` with machine-readable reason codes.
 */

/* ── Hoisted constants ─────────────────────────────────────────────── */

export const QUESTIONNAIRE_VERSION = 1;

export const SUPPORTED_STATES = ['TX', 'OK'];

export const STATE_NAMES = { TX: 'Texas', OK: 'Oklahoma' };

export const STEP_KIND = {
  SELECT: 'select',
  TEXT: 'text',
  DATE: 'date',
  YESNO: 'yesno',
};

/** Machine-readable eligibility failure codes. */
export const REASONS = {
  NON_RESIDENT: 'NON_RESIDENT',
  NO_RESIDENCY_DURATION: 'NO_RESIDENCY_DURATION',
  CONTESTED: 'CONTESTED',
  MINOR_CHILDREN: 'MINOR_CHILDREN',
  PROPERTY_DISPUTE: 'PROPERTY_DISPUTE',
};

/** i18n keys for validation failures (resolved by the UI via $t). */
export const ERROR_KEYS = {
  REQUIRED: 'q.errors.required',
  INVALID_STATE: 'q.errors.invalid_state',
  INVALID_NAME: 'q.errors.invalid_name',
  INVALID_COUNTY: 'q.errors.invalid_county',
  INVALID_DATE: 'q.errors.invalid_date',
  FUTURE_DATE: 'q.errors.future_date',
  DATE_TOO_OLD: 'q.errors.date_too_old',
  INVALID_PLACE: 'q.errors.invalid_place',
  INVALID_YESNO: 'q.errors.invalid_yesno',
};

const MIN_NAME_LENGTH = 2;
const MAX_TEXT_LENGTH = 120;
const MIN_MARRIAGE_YEAR = 1900;
const ORGANIZER_CHECKLIST_VERSION = 1;

/* Name/county/place allow letters (any script), digits for places, and the
   punctuation real names use: spaces, hyphens, apostrophes (incl. curly ’),
   periods. */
const NAME_PATTERN = /^[\p{L}][\p{L} .'\-’]*$/u;
const PLACE_PATTERN = /^[\p{L}0-9][\p{L}0-9 .,'\-’]*$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/* ── Step definitions ──────────────────────────────────────────────── */

/**
 * Ordered step definitions. `questionKey` points at the `q.*` dictionary
 * entry the UI renders; the engine never touches locale strings itself.
 */
export const STEPS = [
  { id: 'state', kind: STEP_KIND.SELECT, questionKey: 'q.state.question', options: SUPPORTED_STATES },
  { id: 'petitionerName', kind: STEP_KIND.TEXT, questionKey: 'q.petitionerName.question' },
  { id: 'respondentName', kind: STEP_KIND.TEXT, questionKey: 'q.respondentName.question' },
  { id: 'county', kind: STEP_KIND.TEXT, questionKey: 'q.county.question' },
  { id: 'marriageDate', kind: STEP_KIND.DATE, questionKey: 'q.marriageDate.question' },
  { id: 'marriagePlace', kind: STEP_KIND.TEXT, questionKey: 'q.marriagePlace.question' },
  { id: 'residency', kind: STEP_KIND.YESNO, questionKey: 'q.residency.question' },
  { id: 'uncontested', kind: STEP_KIND.YESNO, questionKey: 'q.uncontested.question' },
  { id: 'minorChildren', kind: STEP_KIND.YESNO, questionKey: 'q.minorChildren.question' },
  { id: 'propertySplit', kind: STEP_KIND.YESNO, questionKey: 'q.propertySplit.question' },
];

/** Look up a step definition by id; returns undefined for unknown ids. */
export function getStep(stepId) {
  return STEPS.find((s) => s.id === stepId);
}

/* ── Validation ────────────────────────────────────────────────────── */

function fail(key) {
  return { ok: false, error: key };
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Validate a raw answer for one step.
 * @param {string} stepId
 * @param {*} value
 * @returns {{ ok: boolean, error: string|null }} `error` is a `q.errors.*` i18n key.
 */
export function validateAnswer(stepId, value) {
  const step = getStep(stepId);
  if (!step) return fail(ERROR_KEYS.REQUIRED);
  if (isBlank(value) && step.kind !== STEP_KIND.YESNO) return fail(ERROR_KEYS.REQUIRED);

  switch (step.kind) {
    case STEP_KIND.SELECT:
      if (!SUPPORTED_STATES.includes(value)) return fail(ERROR_KEYS.INVALID_STATE);
      return { ok: true, error: null };
    case STEP_KIND.YESNO:
      if (typeof value !== 'boolean') return fail(ERROR_KEYS.INVALID_YESNO);
      return { ok: true, error: null };
    case STEP_KIND.DATE:
      return validateDate(String(value).trim());
    case STEP_KIND.TEXT:
      return validateText(stepId, String(value).trim());
    default:
      return fail(ERROR_KEYS.REQUIRED);
  }
}

function validateText(stepId, text) {
  if (text.length < MIN_NAME_LENGTH || text.length > MAX_TEXT_LENGTH) {
    return fail(stepId === 'county' || stepId === 'marriagePlace' ? ERROR_KEYS.INVALID_COUNTY : ERROR_KEYS.INVALID_NAME);
  }
  const pattern = stepId === 'petitionerName' || stepId === 'respondentName' ? NAME_PATTERN : PLACE_PATTERN;
  if (!pattern.test(text)) {
    if (stepId === 'marriagePlace') return fail(ERROR_KEYS.INVALID_PLACE);
    if (stepId === 'county') return fail(ERROR_KEYS.INVALID_COUNTY);
    return fail(ERROR_KEYS.INVALID_NAME);
  }
  return { ok: true, error: null };
}

function validateDate(text) {
  const match = DATE_PATTERN.exec(text);
  if (!match) return fail(ERROR_KEYS.INVALID_DATE);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Round-trip check rejects impossible dates like 2023-02-30.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return fail(ERROR_KEYS.INVALID_DATE);
  }
  if (year < MIN_MARRIAGE_YEAR) return fail(ERROR_KEYS.DATE_TOO_OLD);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date > today) return fail(ERROR_KEYS.FUTURE_DATE);
  return { ok: true, error: null };
}

/* ── Eligibility ───────────────────────────────────────────────────── */

/**
 * Evaluate eligibility from a (possibly partial) answers object.
 * @param {Record<string, *>} answers
 * @returns {{ eligible: boolean, complete: boolean, reasons: string[] }}
 */
export function checkEligibility(answers = {}) {
  const a = answers || {};
  const reasons = [];

  if (a.state !== undefined && a.state !== null && a.state !== '') {
    if (!SUPPORTED_STATES.includes(a.state)) reasons.push(REASONS.NON_RESIDENT);
  }
  if (a.residency === false) reasons.push(REASONS.NO_RESIDENCY_DURATION);
  if (a.uncontested === false) reasons.push(REASONS.CONTESTED);
  if (a.minorChildren === true) reasons.push(REASONS.MINOR_CHILDREN);
  if (a.propertySplit === false) reasons.push(REASONS.PROPERTY_DISPUTE);

  const complete = STEPS.every((s) => a[s.id] !== undefined && a[s.id] !== null && String(a[s.id]).trim() !== '');

  return { eligible: reasons.length === 0 && complete, complete, reasons };
}

/* ── Filing organizer ──────────────────────────────────────────────── */

const CHECKLIST_TX = [
  { id: 'tx_petition', titleKey: 'q.checklist.tx_petition.title', detailKey: 'q.checklist.tx_petition.detail' },
  { id: 'tx_service', titleKey: 'q.checklist.tx_service.title', detailKey: 'q.checklist.tx_service.detail' },
  { id: 'tx_waiting', titleKey: 'q.checklist.tx_waiting.title', detailKey: 'q.checklist.tx_waiting.detail' },
  { id: 'tx_decree', titleKey: 'q.checklist.tx_decree.title', detailKey: 'q.checklist.tx_decree.detail' },
  { id: 'file_decree', titleKey: 'q.checklist.file_decree.title', detailKey: 'q.checklist.file_decree.detail' },
];

const CHECKLIST_OK = [
  { id: 'ok_petition', titleKey: 'q.checklist.ok_petition.title', detailKey: 'q.checklist.ok_petition.detail' },
  { id: 'ok_appearance', titleKey: 'q.checklist.ok_appearance.title', detailKey: 'q.checklist.ok_appearance.detail' },
  { id: 'ok_waiting', titleKey: 'q.checklist.ok_waiting.title', detailKey: 'q.checklist.ok_waiting.detail' },
  { id: 'ok_decree', titleKey: 'q.checklist.ok_decree.title', detailKey: 'q.checklist.ok_decree.detail' },
  { id: 'file_decree', titleKey: 'q.checklist.file_decree.title', detailKey: 'q.checklist.file_decree.detail' },
];

function resolveStrings(items, strings) {
  return items.map((item) => ({
    id: item.id,
    titleKey: item.titleKey,
    detailKey: item.detailKey,
    title: strings[item.titleKey] || item.titleKey,
    detail: strings[item.detailKey] || item.detailKey,
  }));
}

/**
 * Build the printable filing organizer from completed, eligible answers.
 *
 * @param {Record<string, *>} answers validated questionnaire answers
 * @param {Record<string, string>} [strings] optional flat `q.*` dictionary
 *   used to resolve checklist titles/details; falls back to the raw keys.
 * @returns {object} printable summary: parties, marriage, filing info,
 *   attestations, per-state checklist, and timestamps.
 * @throws {Error} with `code: 'QUESTIONNAIRE_INCOMPLETE'` when answers are
 *   not complete and eligible.
 */
export function buildOrganizer(answers, strings = {}) {
  const { eligible, complete, reasons } = checkEligibility(answers);
  if (!complete || !eligible) {
    const err = new Error('Cannot build organizer: questionnaire is not complete and eligible.');
    err.code = 'QUESTIONNAIRE_INCOMPLETE';
    err.reasons = reasons;
    throw err;
  }

  const a = answers;
  const checklistItems = a.state === 'OK' ? CHECKLIST_OK : CHECKLIST_TX;

  return {
    version: ORGANIZER_CHECKLIST_VERSION,
    generatedAt: new Date().toISOString(),
    state: a.state,
    stateName: STATE_NAMES[a.state],
    parties: {
      petitioner: a.petitionerName.trim(),
      respondent: a.respondentName.trim(),
    },
    marriage: {
      date: a.marriageDate,
      place: a.marriagePlace.trim(),
    },
    filing: {
      county: a.county.trim(),
      court: `${a.county.trim()} County District Court`,
    },
    attestations: {
      residency: a.residency,
      uncontested: a.uncontested,
      noMinorChildren: !a.minorChildren,
      propertySplit: a.propertySplit,
    },
    eligibility: { eligible: true, reasons: [] },
    checklist: resolveStrings(checklistItems, strings),
    disclaimerKey: 'q.organizer.disclaimer',
    disclaimer: strings['q.organizer.disclaimer'] || 'q.organizer.disclaimer',
  };
}

/* ── Session state machine ─────────────────────────────────────────── */

/**
 * Create a stateful questionnaire session. Steps cannot be skipped: answers
 * apply only to the current step, and invalid answers never advance.
 *
 * @returns session with `currentStep`, `answers`, `status`, `progress`,
 *   `answer(value)`, `back()`, `reset()`, and `snapshot()`.
 */
export function createSession() {
  let stepIndex = 0;
  let answers = {};

  const getStatus = () => {
    const { eligible, complete, reasons } = checkEligibility(answers);
    if (reasons.length > 0) return 'ineligible';
    if (complete && eligible) return 'complete';
    return 'incomplete';
  };

  const getProgress = () => {
    const answered = Object.keys(answers).length;
    return {
      current: Math.min(stepIndex + 1, STEPS.length),
      total: STEPS.length,
      answered,
      percent: Math.round((answered / STEPS.length) * 100),
    };
  };

  return {
    /** The step definition awaiting an answer. */
    get currentStep() {
      return STEPS[stepIndex];
    },

    /** Copy of answers collected so far. */
    get answers() {
      return { ...answers };
    },

    /** 'incomplete' | 'complete' | 'ineligible' */
    get status() {
      return getStatus();
    },

    get progress() {
      return getProgress();
    },

    /** Eligibility reasons derived from answers so far (empty when none). */
    get ineligibilityReasons() {
      return checkEligibility(answers).reasons;
    },

    /**
     * Answer the current step. Invalid values are rejected without advancing.
     * @returns {{ ok: boolean, error: string|null, done: boolean, status: string }}
     */
    answer(value) {
      const step = STEPS[stepIndex];
      const { ok, error } = validateAnswer(step.id, value);
      if (!ok) return { ok: false, error, done: false, status: getStatus() };

      const normalized = typeof value === 'string' ? value.trim() : value;
      answers = { ...answers, [step.id]: normalized };
      const done = stepIndex === STEPS.length - 1;
      if (!done) stepIndex += 1;
      return { ok: true, error: null, done, status: getStatus() };
    },

    /** Move back one step (never below the first). Answers are kept. */
    back() {
      stepIndex = Math.max(0, stepIndex - 1);
      return { step: STEPS[stepIndex], index: stepIndex };
    },

    /** Clear all answers and return to the first step. */
    reset() {
      stepIndex = 0;
      answers = {};
    },

    /** Serializable snapshot for persistence (e.g. localStorage). */
    snapshot() {
      return {
        version: QUESTIONNAIRE_VERSION,
        stepIndex,
        answers: { ...answers },
        status: getStatus(),
        progress: getProgress(),
      };
    },

    /**
     * Build the filing organizer. Only valid once the session is complete
     * and eligible; throws otherwise (see buildOrganizer).
     */
    buildOrganizer(strings) {
      return buildOrganizer(answers, strings);
    },
  };
}
