/**
 * Unit tests for server/request-limits.mjs — the request-body size cap.
 *
 * The cap is the staging server's only defense against unbounded-POST
 * memory exhaustion: every byte over MAX_BODY_BYTES must throw
 * BodyTooLargeError and cut the socket, without ever returning a body.
 * No network, no secrets, no filesystem — pure stream behavior.
 */
import { describe, it, expect } from 'vitest';
import { MAX_BODY_BYTES, BodyTooLargeError, readRequestBody } from './request-limits.mjs';

/** Minimal async-iterable fake req; `destroy` is tracked for the fail-closed check. */
function fakeStream(chunks) {
  let destroyed = false;
  return {
    get destroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
    },
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { done: true }),
      };
    },
  };
}

describe('readRequestBody', () => {
  it('returns a small body unchanged', async () => {
    const req = fakeStream([Buffer.from('{"a":1}')]);
    await expect(readRequestBody(req)).resolves.toBe('{"a":1}');
    expect(req.destroyed).toBe(false);
  });

  it('assembles multi-chunk bodies', async () => {
    const req = fakeStream([Buffer.from('he'), Buffer.from('llo')]);
    await expect(readRequestBody(req)).resolves.toBe('hello');
  });

  it('treats an empty body as the empty string', async () => {
    await expect(readRequestBody(fakeStream([]))).resolves.toBe('');
  });

  it('accepts a body exactly at the cap', async () => {
    const req = fakeStream([Buffer.alloc(MAX_BODY_BYTES, 'x')]);
    const body = await readRequestBody(req);
    expect(body.length).toBe(MAX_BODY_BYTES);
    expect(req.destroyed).toBe(false);
  });

  it('rejects one byte over the cap with BodyTooLargeError and destroys the stream', async () => {
    const req = fakeStream([Buffer.alloc(MAX_BODY_BYTES + 1, 'x')]);
    const err = await readRequestBody(req).catch((e) => e);
    expect(err).toBeInstanceOf(BodyTooLargeError);
    expect(err.code).toBe('BODY_TOO_LARGE');
    expect(err.limitBytes).toBe(MAX_BODY_BYTES);
    expect(req.destroyed).toBe(true);
  });

  it('cuts the stream mid-flow when a later chunk crosses the cap', async () => {
    const req = fakeStream([Buffer.alloc(100, 'a'), Buffer.alloc(MAX_BODY_BYTES, 'b')]);
    await expect(readRequestBody(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(req.destroyed).toBe(true);
  });

  it('respects a custom maxBytes', async () => {
    const req = fakeStream([Buffer.alloc(11, 'z')]);
    await expect(readRequestBody(req, { maxBytes: 10 })).rejects.toThrow(BodyTooLargeError);
  });

  it('never returns a partial body on rejection', async () => {
    const req = fakeStream([Buffer.alloc(MAX_BODY_BYTES + 50, 'q')]);
    let settled = false;
    await readRequestBody(req).then(
      () => {
        settled = true;
      },
      () => {}
    );
    expect(settled).toBe(false);
  });
});
