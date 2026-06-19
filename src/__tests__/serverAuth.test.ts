import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../../server.js';

describe('isAuthorized', () => {
  it('returns true when token matches secret', () => {
    expect(isAuthorized('my-secret', 'my-secret')).toBe(true);
  });

  it('returns false when token header is missing', () => {
    expect(isAuthorized(undefined, 'my-secret')).toBe(false);
  });

  it('returns false when token header is an empty string', () => {
    expect(isAuthorized('', 'my-secret')).toBe(false);
  });

  it('returns false when token does not match secret', () => {
    expect(isAuthorized('wrong-token', 'my-secret')).toBe(false);
  });

  it('returns false when INGEST_SECRET_TOKEN env var is not set', () => {
    expect(isAuthorized('any-token', undefined)).toBe(false);
  });

  it('returns false when both token and secret are undefined', () => {
    expect(isAuthorized(undefined, undefined)).toBe(false);
  });
});
