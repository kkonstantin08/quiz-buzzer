import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.hostUser.findUnique({
      where: { email },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
    
    // Check subscription status
    const hasActiveSubscription = user.subscription && 
      user.subscription.status === 'active' && 
      user.subscription.currentPeriodEnd > new Date();

    return res.json({
      token,
      hasActiveSubscription: !!hasActiveSubscription,
      email: user.email,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    
    const user = await prisma.hostUser.findUnique({
      where: { id: decoded.userId },
      include: { subscription: true },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const hasActiveSubscription = user.subscription && 
      user.subscription.status === 'active' && 
      user.subscription.currentPeriodEnd > new Date();
      
    return res.json({
      hasActiveSubscription: !!hasActiveSubscription,
      email: user.email,
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await prisma.hostUser.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.hostUser.create({
      data: {
        email,
        passwordHash,
      },
    });

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    return res.json({
      token,
      hasActiveSubscription: false,
      email: user.email,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
