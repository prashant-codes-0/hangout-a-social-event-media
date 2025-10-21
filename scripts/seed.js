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
    await db.collection('users').insertOne({
      name: 'Sponsor User',
      email: 'sponsor@hangout.com',
      passwordHash: sponsorPassword,
      role: 'sponsor',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Database seeded successfully!');
    console.log('Admin user: admin@hangout.com / admin123');
    console.log('Sponsor user: sponsor@hangout.com / sponsor123');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await client.close();
  }
}

seed();