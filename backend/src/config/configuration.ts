export default () => ({
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    url: process.env.DATABASE_URL,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // Apple Sign-in
  apple: {
    clientId: process.env.APPLE_CLIENT_ID, // Your app's bundle identifier
    teamId: process.env.APPLE_TEAM_ID,
    keyId: process.env.APPLE_KEY_ID,
    privateKey: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    redirectUri: process.env.APPLE_REDIRECT_URI,
  },

  // AWS S3
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucketName: process.env.S3_BUCKET_NAME || 'khabar-media',
    publicUrl: process.env.S3_PUBLIC_URL,
  },

  // APNs (Apple Push Notification service)
  apns: {
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    privateKey: process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    bundleId: process.env.APNS_BUNDLE_ID,
    production: process.env.NODE_ENV === 'production',
  },

  // Geospatial settings
  geo: {
    defaultSearchRadiusKm: parseFloat(process.env.DEFAULT_SEARCH_RADIUS_KM || '5'),
    maxSearchRadiusKm: parseFloat(process.env.MAX_SEARCH_RADIUS_KM || '50'),
  },

  // Media settings
  media: {
    maxImageSizeMb: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10', 10),
    maxVideoSizeMb: parseInt(process.env.MAX_VIDEO_SIZE_MB || '100', 10),
    maxVideoDurationSeconds: parseInt(process.env.MAX_VIDEO_DURATION_SECONDS || '60', 10),
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
  },

  // Incidents
  incidents: {
    expiryHours: parseInt(process.env.INCIDENT_EXPIRY_HOURS || '24', 10),
    verificationThreshold: parseInt(process.env.VERIFICATION_THRESHOLD || '3', 10),
  },

  // Reputation system points
  reputation: {
    incidentCreated: 5,
    incidentVerified: 20,
    incidentRejected: -10,
    upvoteReceived: 2,
    downvoteReceived: -1,
    verifyReceived: 5,
    commentUpvoted: 1,
    reportAccepted: -25,
    reportRejected: 5,
    banPenalty: -100,
  },

  // Rate limiting
  rateLimit: {
    incidentCreation: {
      ttl: 60000, // 1 minute
      limit: 3,
    },
  },
});
