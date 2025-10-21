// Simple seed script for development
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hangout';

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();

    // Clear existing data
    await db.collection('users').deleteMany({});
    await db.collection('hangouts').deleteMany({});
    await db.collection('joinrequests').deleteMany({});

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await db.collection('users').insertOne({
      name: 'Admin User',
      email: 'admin@hangout.com',
      passwordHash: adminPassword,
      role: 'admin',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create sponsor user
    const sponsorPassword = await bcrypt.hash('sponsor123', 10);
    const sponsorUser = await db.collection('users').insertOne({
      name: 'Sponsor User',
      email: 'sponsor@hangout.com',
      passwordHash: sponsorPassword,
      role: 'sponsor',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create admin user record
    const adminUser = await db.collection('users').findOne({ email: 'admin@hangout.com' });

    // Create sample hangouts
    const sampleHangouts = [
      {
        title: 'Networking Night',
        purpose: 'Professional networking',
        place: 'Downtown Hotel',
        time: new Date('2024-12-25T19:00:00Z'),
        sponsored: false,
        attendees: [adminUser._id], // Creator automatically joins
        blasts: 2,
        blastedBy: [],
        capacity: 20,
        isPublic: true,
        createdBy: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Tech Meetup',
        purpose: 'Technology discussion',
        place: 'Tech Hub',
        time: new Date('2024-12-26T18:00:00Z'),
        sponsored: true,
        sponsorId: sponsorUser.insertedId,
        attendees: [sponsorUser.insertedId], // Creator automatically joins
        blasts: 1,
        blastedBy: [],
        capacity: 15,
        isPublic: true,
        createdBy: sponsorUser.insertedId,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Coffee Chat',
        purpose: 'Casual conversation',
        place: 'Local Coffee Shop',
        time: new Date('2024-12-27T10:00:00Z'),
        sponsored: false,
        attendees: [adminUser._id], // Creator automatically joins
        blasts: 0,
        blastedBy: [],
        capacity: 8,
        isPublic: true,
        createdBy: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Private Team Meeting',
        purpose: 'Internal team discussion',
        place: 'Office Conference Room',
        time: new Date('2024-12-28T14:00:00Z'),
        sponsored: false,
        attendees: [adminUser._id], // Creator automatically joins
        blasts: 0,
        blastedBy: [],
        capacity: 5,
        isPublic: false, // This won't show in public listings
        createdBy: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    await db.collection('hangouts').insertMany(sampleHangouts);

    console.log('Database seeded successfully!');
    console.log('Admin user: admin@hangout.com / admin123');
    console.log('Sponsor user: sponsor@hangout.com / sponsor123');
    console.log('Sample hangouts created: 4 (3 public, 1 private)');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await client.close();
  }
}

seed();