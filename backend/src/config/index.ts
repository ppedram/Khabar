import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config = {
  // Server
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3000),
  host: getEnv('HOST', '0.0.0.0'),
  apiPrefix: getEnv('API_PREFIX', '/v1'),
  isProduction: getEnv('NODE_ENV', 'development') === 'production',
  isDevelopment: getEnv('NODE_ENV', 'development') === 'development',

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Redis
  redisUrl: getEnv('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    accessExpiry: getEnv('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiry: getEnv('JWT_REFRESH_EXPIRY', '7d'),
  },

  // Twilio
  twilio: {
    accountSid: getEnv('TWILIO_ACCOUNT_SID', ''),
    authToken: getEnv('TWILIO_AUTH_TOKEN', ''),
    verifyServiceSid: getEnv('TWILIO_VERIFY_SERVICE_SID', ''),
  },

  // S3/MinIO
  s3: {
    endpoint: getEnv('S3_ENDPOINT', 'http://localhost:9000'),
    region: getEnv('S3_REGION', 'us-east-1'),
    accessKey: getEnv('S3_ACCESS_KEY', 'minioadmin'),
    secretKey: getEnv('S3_SECRET_KEY', 'minioadmin'),
    bucketName: getEnv('S3_BUCKET_NAME', 'khabar-media'),
    publicUrl: getEnv('S3_PUBLIC_URL', 'http://localhost:9000/khabar-media'),
  },

  // Firebase
  firebase: {
    projectId: getEnv('FIREBASE_PROJECT_ID', ''),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL', ''),
  },

  // Rate Limiting
  rateLimit: {
    max: getEnvNumber('RATE_LIMIT_MAX', 100),
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
  },

  // Security
  corsOrigins: getEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:8080').split(','),
  bcryptRounds: getEnvNumber('BCRYPT_ROUNDS', 12),

  // Logging
  logLevel: getEnv('LOG_LEVEL', 'info'),

  // Feature Flags
  features: {
    phoneVerification: getEnvBoolean('ENABLE_PHONE_VERIFICATION', true),
    pushNotifications: getEnvBoolean('ENABLE_PUSH_NOTIFICATIONS', true),
    requireModeration: getEnvBoolean('REQUIRE_MODERATION', true),
  },

  // Geolocation
  geo: {
    defaultSearchRadiusKm: getEnvNumber('DEFAULT_SEARCH_RADIUS_KM', 5),
    maxSearchRadiusKm: getEnvNumber('MAX_SEARCH_RADIUS_KM', 50),
  },

  // Media
  media: {
    maxImageSizeMb: getEnvNumber('MAX_IMAGE_SIZE_MB', 10),
    maxVideoSizeMb: getEnvNumber('MAX_VIDEO_SIZE_MB', 100),
    maxVideoDurationSeconds: getEnvNumber('MAX_VIDEO_DURATION_SECONDS', 60),
  },

  // Incidents
  incidents: {
    expiryHours: getEnvNumber('INCIDENT_EXPIRY_HOURS', 24),
  },
} as const;

export type Config = typeof config;
