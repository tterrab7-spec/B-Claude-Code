import { describe, expect, it } from 'vitest';
import { isDisposable, ApiError } from '@/lib/api';
describe('api helpers', () => {
  it('flags disposable emails', () => { expect(isDisposable('a@mailinator.com')).toBe(true); expect(isDisposable('a@canterburydev.com')).toBe(false); });
  it('ApiError carries code and fields', () => { const e = new ApiError('validation', 'bad', { 'contact.email': 'nope' }, 400); expect(e.fields['contact.email']).toBe('nope'); expect(e.status).toBe(400); });
});
