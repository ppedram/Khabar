import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  {
    name: 'Theft',
    slug: 'theft',
    description: 'Robbery, burglary, pickpocketing, and other theft-related incidents',
    icon: 'shield-alert',
    color: '#DC2626',
    severityLevel: 4,
  },
  {
    name: 'Suspicious Activity',
    slug: 'suspicious-activity',
    description: 'Suspicious persons, vehicles, or behavior',
    icon: 'eye',
    color: '#F59E0B',
    severityLevel: 2,
  },
  {
    name: 'Fire',
    slug: 'fire',
    description: 'Building fires, wildfires, smoke sightings',
    icon: 'flame',
    color: '#EF4444',
    severityLevel: 5,
  },
  {
    name: 'Accident',
    slug: 'accident',
    description: 'Vehicle accidents, pedestrian incidents, collisions',
    icon: 'car',
    color: '#F97316',
    severityLevel: 4,
  },
  {
    name: 'Medical Emergency',
    slug: 'medical-emergency',
    description: 'Medical emergencies requiring immediate attention',
    icon: 'heart-pulse',
    color: '#EC4899',
    severityLevel: 5,
  },
  {
    name: 'Assault',
    slug: 'assault',
    description: 'Physical altercations, fights, violent incidents',
    icon: 'alert-triangle',
    color: '#B91C1C',
    severityLevel: 5,
  },
  {
    name: 'Vandalism',
    slug: 'vandalism',
    description: 'Property damage, graffiti, destruction',
    icon: 'paintbrush',
    color: '#8B5CF6',
    severityLevel: 2,
  },
  {
    name: 'Noise Complaint',
    slug: 'noise-complaint',
    description: 'Excessive noise, disturbances, loud parties',
    icon: 'volume-2',
    color: '#6366F1',
    severityLevel: 1,
  },
  {
    name: 'Missing Person',
    slug: 'missing-person',
    description: 'Missing persons, lost children, elderly',
    icon: 'user-search',
    color: '#0EA5E9',
    severityLevel: 5,
  },
  {
    name: 'Hazard',
    slug: 'hazard',
    description: 'Road hazards, dangerous conditions, infrastructure issues',
    icon: 'alert-octagon',
    color: '#FBBF24',
    severityLevel: 3,
  },
  {
    name: 'Animal',
    slug: 'animal',
    description: 'Stray animals, aggressive animals, wildlife sightings',
    icon: 'dog',
    color: '#10B981',
    severityLevel: 2,
  },
  {
    name: 'Other',
    slug: 'other',
    description: 'Other incidents not covered by above categories',
    icon: 'info',
    color: '#6B7280',
    severityLevel: 1,
  },
];

async function main() {
  console.log('Seeding database...');

  // Seed categories
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
    console.log(`Created/updated category: ${category.name}`);
  }

  // Create a test admin user (for development only)
  if (process.env.NODE_ENV === 'development') {
    const adminUser = await prisma.user.upsert({
      where: { phoneNumber: '+1234567890' },
      update: {},
      create: {
        phoneNumber: '+1234567890',
        phoneVerified: true,
        username: 'admin',
        displayName: 'System Admin',
        role: 'ADMIN',
        reputationScore: 100,
      },
    });
    console.log(`Created admin user: ${adminUser.username}`);

    // Create settings for admin
    await prisma.userSettings.upsert({
      where: { userId: adminUser.id },
      update: {},
      create: {
        userId: adminUser.id,
        notificationRadiusKm: 10,
        notificationsEnabled: true,
      },
    });
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
