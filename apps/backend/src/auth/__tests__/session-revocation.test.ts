import { prisma } from '../../prisma';
import bcrypt from 'bcrypt';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from '../index';

// Create a small express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

describe('Session Revocation & Auth', () => {
  let testUserId: string;
  const testEmail = 'sessiontest@example.com';
  const testPassword = 'password123';

  beforeAll(async () => {
    // Clean up
    await prisma.session.deleteMany();
    await prisma.hostUser.deleteMany({ where: { email: testEmail } });

    // Create user
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await prisma.hostUser.create({
      data: {
        email: testEmail,
        passwordHash,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.hostUser.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  it('should create a session on login', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    
    // Extract cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Verify session in DB
    const sessions = await prisma.session.findMany({ where: { userId: testUserId } });
    expect(sessions.length).toBe(1);
    expect(sessions[0].revokedAt).toBeNull();
  });

  it('should allow access to protected route with valid session', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    
    const cookies = loginRes.headers['set-cookie'];
    
    const meRes = await request(app)
      .get('/auth/me')
      .set('Cookie', cookies);
      
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(testEmail);
  });

  it('should reject access after logout (session revoked)', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    
    const cookies = loginRes.headers['set-cookie'];
    
    // Logout
    await request(app)
      .post('/auth/logout')
      .set('Cookie', cookies);
      
    // Try to access protected route with the old token
    const meRes = await request(app)
      .get('/auth/me')
      .set('Cookie', cookies); // Send the old cookie again
      
    expect(meRes.status).toBe(401);
    expect(meRes.body.error).toBe('Session revoked');
  });

  it('should support multiple active sessions and only revoke the one being logged out', async () => {
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
      
    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
      
    const cookies1 = login1.headers['set-cookie'];
    const cookies2 = login2.headers['set-cookie'];
    
    // Logout from session 1
    await request(app)
      .post('/auth/logout')
      .set('Cookie', cookies1);
      
    // Session 1 is dead
    const meRes1 = await request(app)
      .get('/auth/me')
      .set('Cookie', cookies1);
    expect(meRes1.status).toBe(401);
    
    // Session 2 is alive
    const meRes2 = await request(app)
      .get('/auth/me')
      .set('Cookie', cookies2);
    expect(meRes2.status).toBe(200);
  });
});
