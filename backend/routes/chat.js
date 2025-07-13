import express from 'express';

const router = express.Router();

// Basic chat route
router.get('/', (req, res) => {
  res.json({ message: 'Chat API is working' });
});

// Add more chat routes here as needed
router.post('/message', (req, res) => {
  res.json({ message: 'Message endpoint' });
});

export default router;
