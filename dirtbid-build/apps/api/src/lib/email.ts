import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';

export interface EmailMessage { to: string; subject: string; text: string; html?: string; template: string; userId?: string }
export interface EmailDriver { send(msg: EmailMessage, from: string): Promise<void> }

export const consoleDriver = (log: (s: string) => void = (s) => console.log(s)): EmailDriver => ({
  async send(msg, from) { log(`[email:console] from=${from} to=${msg.to} subject="${msg.subject}"\n${msg.text}`); },
});

export const resendDriver = (apiKey: string, fetchImpl: typeof fetch = fetch): EmailDriver => ({
  async send(msg, from) {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  },
});

/** SES v2 via SigV4 is heavy to hand-roll; load the AWS SDK lazily so it stays an optional dependency. */
export const sesDriver = (region: string): EmailDriver => ({
  async send(msg, from) {
    const mod: any = await import('@aws-sdk/client-sesv2' as string).catch(() => null);
    if (!mod) throw new Error('EMAIL_DRIVER=ses requires @aws-sdk/client-sesv2 to be installed');
    const client = new mod.SESv2Client({ region });
    await client.send(new mod.SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [msg.to] },
      Content: { Simple: { Subject: { Data: msg.subject }, Body: { Text: { Data: msg.text }, ...(msg.html ? { Html: { Data: msg.html } } : {}) } } },
    }));
  },
});

export function createEmailDriver(cfg: Config, log?: (s: string) => void): EmailDriver {
  if (cfg.emailDriver === 'resend' && cfg.resendApiKey) return resendDriver(cfg.resendApiKey);
  if (cfg.emailDriver === 'ses' && cfg.awsRegion) return sesDriver(cfg.awsRegion);
  return consoleDriver(log);
}

export class Mailer {
  constructor(private readonly driver: EmailDriver, private readonly from: string, private readonly db: Db) {}
  async send(msg: EmailMessage): Promise<void> {
    let status = 'sent';
    try {
      await this.driver.send(msg, this.from);
    } catch (e) {
      status = 'failed:' + (e as Error).message.slice(0, 200);
    }
    await this.db.insert(schema.notifications).values({ email: msg.to, userId: msg.userId, template: msg.template, subject: msg.subject, body: msg.text, status });
  }
}
