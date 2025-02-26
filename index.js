
const express = require('express');
const path = require('path');
const Database = require("@replit/database");
const app = express();

// Initialize Replit DB with proper error handling
if (!process.env.REPLIT_DB_URL) {
  console.error('REPLIT_DB_URL environment variable is not defined');
}
const db = new Database(process.env.REPLIT_DB_URL);
const LEADERBOARD_KEY = "global_leaderboard";

// Initialize database if needed
async function initializeDB() {
  try {
    let leaderboard = await db.get(LEADERBOARD_KEY);
    if (!leaderboard) {
      await db.set(LEADERBOARD_KEY, []);
      console.log('Initialized empty leaderboard');
    }
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Run initialization
initializeDB();

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// Serve game
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'game.html'));
});

// Get leaderboard
app.get('/leaderboard', async (req, res) => {
  try {
    let leaderboard = await db.get(LEADERBOARD_KEY);
    if (!leaderboard || !Array.isArray(leaderboard)) {
      leaderboard = [];
      await db.set(LEADERBOARD_KEY, leaderboard);
    }
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Update leaderboard
app.post('/leaderboard', async (req, res) => {
  try {
    if (!req.body || typeof req.body.name !== 'string' || typeof req.body.score !== 'number') {
      return res.status(400).json({ error: 'Invalid input data format' });
    }

    const { name, score } = req.body;
    if (name.trim() === '' || score < 0) {
      return res.status(400).json({ error: 'Invalid name or score value' });
    }

    // Get current leaderboard with retries
    let attempts = 3;
    let leaderboard;
    
    while (attempts > 0) {
      try {
        leaderboard = await db.get(LEADERBOARD_KEY);
        break;
      } catch (error) {
        attempts--;
        if (attempts === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!Array.isArray(leaderboard)) leaderboard = [];

    // Find existing player's highest score
    const existingPlayerIndex = leaderboard.findIndex(entry => entry.name === name.trim());
    
    if (existingPlayerIndex !== -1) {
      // Only update if new score is higher
      if (score > leaderboard[existingPlayerIndex].score) {
        leaderboard[existingPlayerIndex] = { name: name.trim(), score, timestamp: Date.now() };
      }
    } else {
      // Add new player
      leaderboard.push({ name: name.trim(), score, timestamp: Date.now() });
    }

    // Sort by score (highest first) and keep top 10
    leaderboard.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
    leaderboard = leaderboard.slice(0, 10);

    // Save updated leaderboard with retries
    attempts = 3;
    while (attempts > 0) {
      try {
        await db.set(LEADERBOARD_KEY, leaderboard);
        break;
      } catch (error) {
        attempts--;
        if (attempts === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
