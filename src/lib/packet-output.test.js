/**
 * packet-output.test.js — printable-output completeness gate.
 *
 * Pre-flight validates the packet OBJECT; this gate validates the RENDERED
 * DOCUMENT. If a future template refactor drops a row, the downloaded packet
 * must fail loudly naming the field — never ship a half-filled document.
 *
 * Also pins the page-break structure on paper: every section heading lives
 * inside its <section> (no orphaned headers), and the signature block sits
 * inside the signatures section so its break-inside:avoid keeps it together.
 */
import { describe, it, expect } from 'vitest';
import { STEPS, createSession, checkEligibility } from './questionnaire.js';
import { getProvider, PRODUCT } from './payments/index.js';
import {
  PACKET_OUTPUT_FIELDS,
  PacketOutputError,
  PRINT_CSS,
  DEFAULT_PACKET_LABELS,
  assertPacketOutputComplete,
  buildPacket,
  packetToPrintableHtml,
  validatePacketOutput,
} from './packet.js';

/* ── Fixtures (mirrors packet-print-drill.test.js; kept local so this file stands alone) ── */

const FIXTURE_ANSWERS = Object.freeze({
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
});

function completeSession(answers = FIXTURE_ANSWERS) {
  const session = createSession();
  for (const step of STEPS) {
    const result = session.answer(answers[step.id]);
    expect(result.ok, `step ${step.id} accepts fixture value`).toBe(true);
  }
  expect(session.status).toBe('complete');
  expect(checkEligibility(session.answers).eligible).toBe(true);
  return session;
}

async function paidPacket() {
  const provider = getProvider();
  const receipt = await provider.createPayment(PRODUCT.amountCents, PRODUCT.currency, {
    productId: PRODUCT.id,
    cardLast4: '4242',
  });
  const session = completeSession();
  return buildPacket(provider, receipt, session.answers);
}

const clone = (packet) => JSON.parse(JSON.stringify(packet));

/** Delete a dotted path (e.g. 'parties.petitioner') from a cloned packet. */
function unset(packet, path) {
  const parts = path.split('.');
  let node = packet;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node = node[parts[i]];
    if (!node || typeof node !== 'object') return packet;
  }
  delete node[parts[parts.length - 1]];
  return packet;
}

/* ── A complete packet renders completely ───────────────────────── */

describe('output completeness gate: complete packet', () => {
  it('a complete packet validates with zero findings', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    expect(validatePacketOutput(html, packet)).toEqual([]);
    expect(assertPacketOutputComplete(html, packet)).toBe(true);
  });

  it('the render path self-guards: packetToPrintableHtml returns the validated document', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(packet.packetId);
  });

  it('every required field is pinned by PACKET_OUTPUT_FIELDS', () => {
    const fields = PACKET_OUTPUT_FIELDS.map((f) => f.field);
    for (const field of [
      'packetId',
      'generatedAt',
      'payment.receiptId',
      'payment.amountCents',
      'payment.cardLast4',
      'payment.paidAt',
      'payment.provider',
      'parties.petitioner',
      'parties.respondent',
      'marriage.date',
      'marriage.place',
      'stateName',
      'filing.county',
      'filing.court',
      'disclaimer',
    ]) {
      expect(fields, `PACKET_OUTPUT_FIELDS covers ${field}`).toContain(field);
    }
  });
});

/* ── An incomplete packet fails loudly, naming the field ────────── */

describe('output completeness gate: incomplete packet', () => {
  it.each(PACKET_OUTPUT_FIELDS.map((f) => f.field))(
    'a packet missing "%s" fails with the field name',
    async (field) => {
      const packet = await paidPacket();
      const html = packetToPrintableHtml(packet);
      const tampered = unset(clone(packet), field);
      let thrown = null;
      try {
        assertPacketOutputComplete(html, tampered);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, `${field} must fail the output gate`).toBeInstanceOf(PacketOutputError);
      expect(thrown.code).toBe('PACKET_OUTPUT_INCOMPLETE');
      expect(
        thrown.findings.some((f) => f.field === field),
        `findings name the missing field "${field}"`
      ).toBe(true);
      expect(thrown.message).toContain(field);
    }
  );

  it('a missing attestation row fails naming attestations.<key>', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const tampered = clone(packet);
    tampered.attestations.residency = false;
    try {
      assertPacketOutputComplete(html, tampered);
      expect.unreachable('must throw on an unaffirmed attestation');
    } catch (err) {
      expect(err).toBeInstanceOf(PacketOutputError);
      expect(err.findings.some((f) => f.field === 'attestations.residency')).toBe(true);
      expect(err.message).toContain('attestations.residency');
    }
  });

  it('an empty checklist fails naming the checklist', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const tampered = clone(packet);
    tampered.checklist = [];
    try {
      assertPacketOutputComplete(html, tampered);
      expect.unreachable('must throw on an empty checklist');
    } catch (err) {
      expect(err).toBeInstanceOf(PacketOutputError);
      expect(err.findings.some((f) => f.field === 'checklist')).toBe(true);
      expect(err.message).toContain('checklist');
    }
  });

  it('a non-string document fails loudly', async () => {
    const packet = await paidPacket();
    expect(() => assertPacketOutputComplete(null, packet)).toThrowError(PacketOutputError);
  });
});

/* ── End-to-end: the render path itself catches what pre-flight cannot ── */

describe('packetToPrintableHtml end-to-end output gate', () => {
  // Pre-flight does not check marriage details — the output gate must.
  it('a packet missing marriage.place fails the render with the field name', async () => {
    const packet = await paidPacket();
    packet.marriage.place = '';
    try {
      packetToPrintableHtml(packet);
      expect.unreachable('must throw on a missing marriage place');
    } catch (err) {
      expect(err).toBeInstanceOf(PacketOutputError);
      expect(err.findings.some((f) => f.field === 'marriage.place')).toBe(true);
      expect(err.message).toContain('marriage.place');
    }
  });

  it('a packet missing the disclaimer fails the render with the field name', async () => {
    const packet = await paidPacket();
    packet.disclaimer = '   ';
    try {
      packetToPrintableHtml(packet);
      expect.unreachable('must throw on a missing disclaimer');
    } catch (err) {
      expect(err).toBeInstanceOf(PacketOutputError);
      expect(err.findings.some((f) => f.field === 'disclaimer')).toBe(true);
      expect(err.message).toContain('disclaimer');
    }
  });
});

/* ── Page-break structure: no orphaned headers, signatures stay together ── */

describe('printed page structure', () => {
  /** Count <h2> tags that are NOT nested inside an open <section>. */
  function orphanedHeaders(html) {
    const tokens = html.match(/<\/?section>|<h2>/g) || [];
    let depth = 0;
    let orphans = 0;
    for (const token of tokens) {
      if (token === '<section>') depth += 1;
      else if (token === '</section>') depth -= 1;
      else if (depth === 0) orphans += 1;
    }
    return orphans;
  }

  it('no orphaned section headers: every <h2> lives inside its <section>', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    expect(orphanedHeaders(html), 'all headings nested in sections').toBe(0);
  });

  it('every section has exactly one heading (heading + content paginate together)', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const sections = (html.match(/<section>/g) || []).length;
    const headers = (html.match(/<h2>/g) || []).length;
    expect(sections).toBeGreaterThan(0);
    expect(headers).toBe(sections);
  });

  it('the signature block sits inside the signatures section so it never splits', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const sigH2 = html.indexOf('<h2>Signatures</h2>');
    const signBlock = html.indexOf('<div class="sign">');
    const sectionClose = html.indexOf('</section>', sigH2);
    expect(sigH2, 'signatures heading renders').toBeGreaterThan(-1);
    expect(signBlock, 'signature block renders').toBeGreaterThan(sigH2);
    expect(sectionClose, 'signature block closes inside its section').toBeGreaterThan(signBlock);
  });

  it('both signature lines print inside the unsplittable block', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const signBlock = html.slice(html.indexOf('<div class="sign">'), html.indexOf('</section>', html.indexOf('<div class="sign">')));
    expect(signBlock).toContain('Petitioner signature');
    expect(signBlock).toContain('Respondent signature');
  });
});

/* ── Cover page + page numbers + section order (printable packet) ─── */

describe('cover page and page numbers', () => {
  /** Sections in the document order the cover contents list promises. */
  const SECTION_TITLES = [
    DEFAULT_PACKET_LABELS.paymentTitle,
    DEFAULT_PACKET_LABELS.partiesTitle,
    DEFAULT_PACKET_LABELS.marriageTitle,
    DEFAULT_PACKET_LABELS.filingTitle,
    DEFAULT_PACKET_LABELS.attestationsTitle,
    DEFAULT_PACKET_LABELS.checklistTitle,
    DEFAULT_PACKET_LABELS.signaturesTitle,
  ];

  it('the packet opens with a cover section carrying the title block', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const firstSection = html.indexOf('<section>');
    const coverDiv = html.indexOf('<div class="cover">');
    expect(firstSection, 'document starts with a section').toBeGreaterThan(-1);
    expect(coverDiv, 'cover block exists').toBeGreaterThan(firstSection);
    const cover = html.slice(firstSection, html.indexOf('</section>', firstSection));
    expect(cover).toContain(DEFAULT_PACKET_LABELS.documentTitle);
    expect(cover).toContain('Alex Rivera');
    expect(cover).toContain('Jordan Rivera');
    expect(cover).toContain(packet.packetId);
    expect(cover).toContain(packet.generatedAt);
  });

  it('the cover lists every section title, in document order', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const firstSection = html.indexOf('<section>');
    const cover = html.slice(firstSection, html.indexOf('</section>', firstSection));
    expect(cover).toContain(`<h2>${DEFAULT_PACKET_LABELS.coverContentsLabel}</h2>`);
    let cursor = 0;
    for (const title of SECTION_TITLES) {
      const at = cover.indexOf(`<li>${title}</li>`, cursor);
      expect(at, `cover lists "${title}" in order`).toBeGreaterThan(-1);
      cursor = at;
    }
  });

  it('body sections render in the same order the cover promises', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    let cursor = 0;
    for (const title of SECTION_TITLES) {
      const at = html.indexOf(`<h2>${title}</h2>`, cursor);
      expect(at, `"${title}" renders in document order`).toBeGreaterThan(-1);
      cursor = at;
    }
  });

  it('every printed page carries a "Page X of Y" footer', () => {
    expect(PRINT_CSS, 'page-number margin box').toContain('@bottom-center');
    expect(PRINT_CSS, 'page counter').toContain('counter(page)');
    expect(PRINT_CSS, 'total-pages counter').toContain('counter(pages)');
  });

  it('the cover breaks onto its own page', () => {
    expect(PRINT_CSS, 'cover break rule').toMatch(/\.cover\s*\{[^}]*break-after:\s*page/);
  });

  it('no section is empty: every section carries content beyond its heading', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    const bodies = [...html.matchAll(/<section>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
    expect(bodies.length, 'sections render').toBeGreaterThan(0);
    for (const body of bodies) {
      const withoutHeading = body.replace(/<h1>[\s\S]*?<\/h1>/, '').replace(/<h2>[\s\S]*?<\/h2>/, '');
      const text = withoutHeading.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      expect(text.length, 'section carries content').toBeGreaterThan(20);
    }
  });

  it('the render self-guard still validates the document after the cover change', async () => {
    const packet = await paidPacket();
    const html = packetToPrintableHtml(packet);
    expect(validatePacketOutput(html, packet)).toEqual([]);
    expect(assertPacketOutputComplete(html, packet)).toBe(true);
  });
});
