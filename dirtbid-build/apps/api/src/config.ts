export interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  webUrl: string;
  jwtSecret: string;
  cookieName: string;
  emailDriver: 'console' | 'resend' | 'ses';
  emailFrom: string;
  resendApiKey?: string;
  awsRegion?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  n8nWebhookUrl?: string;
  webhookSecret: string;
  s3Bucket?: string;
  localUploadDir: string;
  rateLimitMax: number;
  regridApiKey?: string;
  parcelTimeoutMs: number;
  parcelCacheTtlHours: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isTest = nodeEnv === 'test';
  const databaseUrl = (isTest ? env.DATABASE_URL_TEST : undefined) ?? env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/dirtbid';
  return {
    nodeEnv,
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    webUrl: env.WEB_URL ?? 'http://localhost:5173',
    jwtSecret: env.JWT_SECRET ?? 'dev-only-change-me-dev-only-change-me',
    cookieName: 'db_session',
    emailDriver: (env.EMAIL_DRIVER as Config['emailDriver']) ?? 'console',
    emailFrom: env.EMAIL_FROM ?? 'DirtBid Build <no-reply@dirtbid.local>',
    resendApiKey: env.RESEND_API_KEY,
    awsRegion: env.AWS_REGION,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
    n8nWebhookUrl: env.N8N_WEBHOOK_URL,
    webhookSecret: env.WEBHOOK_SECRET ?? 'dev-webhook-secret',
    s3Bucket: env.S3_BUCKET,
    localUploadDir: env.LOCAL_UPLOAD_DIR ?? './uploads',
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 300),
    regridApiKey: env.REGRID_API_KEY || undefined,
    parcelTimeoutMs: Number(env.PARCEL_TIMEOUT_MS ?? 12000),
    parcelCacheTtlHours: Number(env.PARCEL_CACHE_TTL_HOURS ?? 24),
    ...overrides,
  };
}
