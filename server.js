const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const session = require("express-session");

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: "https://findmysubscrption.netlify.app",
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());
app.use(bodyParser.json());

app.use(
  session({
    secret: "2100030184",
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "none",
      secure: true,
    },
  })
);

const db = mysql
  .createPool({
    host: "yamanote.proxy.rlwy.net",
    user: "root",
    password: "JUwBoVKMCtRJRbCYdQQCUjCoDyxjfCWv",
    database: "railway",
    port: 57354,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
  .promise();

app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (results.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }
    await db.query("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [
      username,
      email,
      password,
    ]);
    res.status(200).json({ message: "Signup successful" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const [results] = await db.query("SELECT * FROM users WHERE email = ? AND password = ?", [
      email,
      password,
    ]);
    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    req.session.userId = results[0].id;
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ message: "Session save failed" });
      }
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.status(200).json({ message: "Login successful" });
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.post("/subscriptions", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send("Unauthorized");

  const { subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost } = req.body;
  if (!subscriptionname || !subscriptiondate || !subscriptionbillingcycle || !subscriptioncost) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    await db.query(
      `INSERT INTO subscription (subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost, user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost, userId]
    );
    res.status(200).json({ message: "Subscription added successfully" });
  } catch (err) {
    console.error("Subscription insert error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.post("/split-subscription", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send("Unauthorized");

  const {
    subscriptionname,
    subscriptiondate,
    subscriptionbillingcycle,
    subscriptioncost,
    numpeople,
  } = req.body;

  if (!subscriptionname || !subscriptiondate || !subscriptionbillingcycle || !subscriptioncost || !numpeople) {
    return res.status(400).json({ message: "All fields are required for split subscription" });
  }

  const costPerPerson = (subscriptioncost / numpeople).toFixed(2);
  const fullName = `${subscriptionname} (Split with ${numpeople})`;

  try {
    await db.query(
      `INSERT INTO subscription (subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost, user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [fullName, subscriptiondate, subscriptionbillingcycle, subscriptioncost, userId]
    );
    res.status(200).json({ message: "Split subscription added successfully", costPerPerson });
  } catch (err) {
    console.error("Split subscription error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.get("/subscriptions", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send("Unauthorized");

  try {
    const [results] = await db.query("SELECT * FROM subscription WHERE user_id = ?", [userId]);
    res.json(results);
  } catch (err) {
    console.error("Fetch subscriptions error:", err);
    res.status(500).send("Database error");
  }
});

app.get("/renewals", async (req, res) => {
  const { month, year } = req.query;
  const userId = req.session.userId;
  if (!userId) return res.status(401).send("Unauthorized");

  try {
    const [results] = await db.query(
      `SELECT subscriptionname, subscriptiondate, subscriptionbillingcycle FROM subscription WHERE user_id = ?`,
      [userId]
    );

    const filteredRenewals = [];

    results.forEach((sub) => {
      const startDate = new Date(sub.subscriptiondate);
      const monthsMatch = sub.subscriptionbillingcycle.match(/\d+/);
      const cycleMonths = monthsMatch ? parseInt(monthsMatch[0], 10) : 0;

      if (!cycleMonths) return;

      let currentRenewal = new Date(startDate);
      while (
        currentRenewal.getFullYear() <= year &&
        currentRenewal.getMonth() + 1 <= month
      ) {
        const rMonth = currentRenewal.getMonth() + 1;
        const rYear = currentRenewal.getFullYear();

        if (rMonth === parseInt(month) && rYear === parseInt(year)) {
          filteredRenewals.push({
            subscriptionname: sub.subscriptionname,
            renewalDate: currentRenewal.toISOString().split("T")[0],
            renewalMonth: rMonth,
            renewalYear: rYear,
          });
          break;
        }
        currentRenewal.setMonth(currentRenewal.getMonth() + cycleMonths);
      }
    });

    res.json(filteredRenewals);
  } catch (err) {
    console.error("Renewals fetch error:", err);
    res.status(500).send("Database error");
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});