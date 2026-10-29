import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, ApiError, isDisposable, utmFromLocation, type LeadKind, type LeadPayload, type LeadResponse } from '@/lib/api';
import { Alert, Button, Field, Honeypot, Input } from './ui';

export const contactSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email').refine((e) => !isDisposable(e), 'Please use a real, non-disposable email'),
  phone: z.string().optional(),
  consent: z.boolean().refine((v) => v, 'Consent is required'),
  website: z.string().max(0).optional(),
});
export type ContactValues = z.infer<typeof contactSchema>;

export function useLeadMutation(kind: LeadKind, onSuccess?: (r: LeadResponse, payload: LeadPayload) => void) {
  return useMutation({
    mutationFn: async (payload: Omit<LeadPayload, 'kind' | 'website'> & { website?: string }) => {
      const body: LeadPayload = { kind, website: payload.website ?? '', utm: utmFromLocation(), ...payload } as LeadPayload;
      const res = await api.post<LeadResponse>('/leads', body);
      return { res, body };
    },
    onSuccess: (d) => onSuccess?.(d.res, d.body),
  });
}

export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T>, err: unknown): string {
  if (err instanceof ApiError) {
    for (const [k, v] of Object.entries(err.fields)) {
      const key = k.replace(/^(contact|property|answers)\./, '') as Path<T>;
      form.setError(key, { message: v });
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Shared contact block + consent + honeypot used by every intake form. */
export function ContactFields<T extends ContactValues>({ form, phoneRequired }: { form: UseFormReturn<T>; phoneRequired?: boolean }) {
  const f = form as unknown as UseFormReturn<ContactValues>;
  const e = f.formState.errors;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Full name" required error={e.fullName?.message}><Input autoComplete="name" {...f.register('fullName')} /></Field>
        <Field label="Email" required error={e.email?.message}><Input type="email" autoComplete="email" {...f.register('email')} /></Field>
        <Field label="Phone" required={phoneRequired} error={e.phone?.message}><Input type="tel" autoComplete="tel" placeholder="(757) 555-0100" {...f.register('phone')} /></Field>
      </div>
      <Honeypot register={(n) => f.register(n)} />
    </>
  );
}

export function ConsentRow<T extends ContactValues>({ form, text }: { form: UseFormReturn<T>; text: string }) {
  const f = form as unknown as UseFormReturn<ContactValues>;
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-stake" {...f.register('consent')} />
      <span>{text}{f.formState.errors.consent && <span className="block text-xs text-bad">{f.formState.errors.consent.message}</span>}</span>
    </label>
  );
}

export function SubmitRow({ loading, label, error, children }: { loading: boolean; label: string; error?: string | null; children?: ReactNode }) {
  return (
    <div className="space-y-3">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" loading={loading}>{label}</Button>{children}</div>
    </div>
  );
}

export { useForm, zodResolver, z };
