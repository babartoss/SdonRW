const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const moment = require('moment-timezone');
require('dotenv').config();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS results (
        lottery_date DATE PRIMARY KEY,
        winning_numbers TEXT NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bets (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(42) NOT NULL,
        numbers TEXT NOT NULL,
        amount_per_position DECIMAL(10,2) NOT NULL,
        tx_hash VARCHAR(66) NOT NULL,
        lottery_date DATE NOT NULL,
        placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('Tables created or already exist');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

function getLotteryDate() {
  const now = moment().tz('Asia/Ho_Chi_Minh');
  const hour = now.hour();
  if (hour < 14) {
    return now.format('YYYY-MM-DD');
  } else if (hour >= 20) {
    return now.add(1, 'day').format('YYYY-MM-DD');
  } else {
    return null;
  }
}

app.post('/bets', async (req, res) => {
  const lotteryDate = getLotteryDate();
  if (!lotteryDate) {
    return res.status(403).json({ error: 'Betting is closed' });
  }
  const { walletAddress, numbers, amountPerPosition, txHash } = req.body;
  if (!walletAddress || !numbers || !amountPerPosition || !txHash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO bets (wallet_address, numbers, amount_per_position, tx_hash, lottery_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [walletAddress, numbers, amountPerPosition, txHash, lotteryDate]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/results', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }
  try {
    const result = await pool.query('SELECT winning_numbers FROM results WHERE lottery_date = $1', [date]);
    if (result.rows.length > 0) {
      res.json({ winningNumbers: result.rows[0].winning_numbers });
    } else {
      res.status(404).json({ error: 'Results not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/results', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { date, winningNumbers } = req.body;
  if (!date || !winningNumbers) {
    return res.status(400).json({ error: 'Date and winning numbers are required' });
  }
  try {
    await pool.query('INSERT INTO results (lottery_date, winning_numbers) VALUES ($1, $2) ON CONFLICT (lottery_date) DO UPDATE SET winning_numbers = $2', [date, winningNumbers]);
    res.status(201).json({ message: 'Results updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/winners', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }
  try {
    const result = await pool.query('SELECT winning_numbers FROM results WHERE lottery_date = $1', [date]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Results not found' });
    }
    const winningNumbers = result.rows[0].winning_numbers.split(',');
    const bets = await pool.query('SELECT wallet_address, numbers, amount_per_position FROM bets WHERE lottery_date = $1', [date]);
    const winners = [];
    for (const bet of bets.rows) {
      const chosenNumbers = bet.numbers.split(',');
      const matches = chosenNumbers.filter(num => winningNumbers.includes(num));
      if (matches.length > 0) {
        const payout = matches.length * 60 * parseFloat(bet.amount_per_position);
        winners.push({ walletAddress: bet.wallet_address, payout });
      }
    }
    res.json(winners);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/stats', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }
  try {
    const totalBetsResult = await pool.query(
      'SELECT SUM(ARRAY_LENGTH(string_to_array(numbers, \',\'), 1) * amount_per_position) as total FROM bets WHERE lottery_date = $1',
      [date]
    );
    const totalBets = totalBetsResult.rows[0].total || 0;
    const ticketsSoldResult = await pool.query('SELECT COUNT(*) as count FROM bets WHERE lottery_date = $1', [date]);
    const ticketsSold = parseInt(ticketsSoldResult.rows[0].count);
    res.json({ totalBets, ticketsSold });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/recent-winners', async (req, res) => {
  try {
    const recentDates = await pool.query('SELECT DISTINCT lottery_date FROM results ORDER BY lottery_date DESC LIMIT 3');
    const winners = [];
    for (const row of recentDates.rows) {
      const date = row.lottery_date;
      const result = await pool.query('SELECT winning_numbers FROM results WHERE lottery_date = $1', [date]);
      if (result.rows.length > 0) {
        const winningNumbers = result.rows[0].winning_numbers.split(',');
        const bets = await pool.query('SELECT wallet_address, numbers, amount_per_position FROM bets WHERE lottery_date = $1', [date]);
        for (const bet of bets.rows) {
          const chosenNumbers = bet.numbers.split(',');
          const matches = chosenNumbers.filter(num => winningNumbers.includes(num));
          if (matches.length > 0) {
            const payout = matches.length * 60 * parseFloat(bet.amount_per_position);
            winners.push({ date, walletAddress: bet.wallet_address, payout });
          }
        }
      }
    }
    winners.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentWinners = winners.slice(0, 10);
    res.json(recentWinners);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

createTables().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});