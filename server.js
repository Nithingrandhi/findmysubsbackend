const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const path = require("path");
const session = require("express-session");

const app = express();

app.use(cors({
    origin: 'https://findmysubsfrontend.netlify.app/', // Match your frontend
    credentials: true
}));


app.use(express.json());
app.use(bodyParser.json());



app.use(session({
    secret: '2100030184',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: 'none', // Allow cross-site cookies
      secure: true      // Require HTTPS (your backend should use HTTPS)
    }

}));

const db = mysql.createConnection({
    host: "yamanote.proxy.rlwy.net",
    user: "root",
    password: "JUwBoVKMCtRJRbCYdQQCUjCoDyxjfCWv",
    database: "railway",
    port: 57354
});

db.connect(err => {
    if (err) throw err;
    console.log("Connected to MySQL");
});

// ✅ Signup route
app.post("/signup", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const checkEmail = "SELECT * FROM users WHERE email = ?";
    db.query(checkEmail, [email], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });

        if (results.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const insertUser = "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
        db.query(insertUser, [username, email, password], (err, result) => {
            if (err) return res.status(500).json({ message: "Database insert error" });

            res.status(200).json({ message: "Signup successful" });
        });
    });
});

// ✅ Login route
app.post("/login", (req, res) => {
    console.log("Login attempt received:", req.body);
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const query = "SELECT * FROM users WHERE email = ? AND password = ?";
    db.query(query, [email, password], (err, results) => {
        if (err) {
            console.error("Login DB error:", err);
            return res.status(500).json({ message: "Database error" });
        }

        if (results.length === 0) {
            console.log("Invalid credentials");
            return res.status(401).json({ message: "Invalid credentials" });
        }

        req.session.userId = results[0].id;
        console.log("User logged in with session userId:", req.session.userId);

        res.status(200).json({ message: "Login successful" });
    });
});

// ✅ Add Subscription (protected)
app.post("/subscriptions", (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        console.log("Unauthorized access to POST /subscriptions");
        return res.status(401).send("Unauthorized");
    }

    const { subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost } = req.body;

    if (!subscriptionname || !subscriptiondate || !subscriptionbillingcycle || !subscriptioncost) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const insertSubscription = `
        INSERT INTO subscription (subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost, user_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(insertSubscription, [subscriptionname, subscriptiondate, subscriptionbillingcycle, subscriptioncost, userId], (err, results) => {
        if (err) {
            console.error("Insert subscription DB error:", err);
            return res.status(500).json({ message: "Database error" });
        }

        res.status(200).json({ message: "Subscription added successfully" });
    });
});

// ✅ Get Subscriptions (protected)
app.get("/subscriptions", (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        console.log("Unauthorized access to GET /subscriptions");
        return res.status(401).send("Unauthorized");
    }

    console.log("Fetching subscriptions for user ID:", userId);

    const query = "SELECT * FROM subscription WHERE user_id = ?";
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("Error fetching subscriptions:", err);
            return res.status(500).send("Database error");
        }

        res.json(results);
    });
});

app.get("/renewals", (req, res) => {
  const { month, year } = req.query;
  const userId = req.session.userId;
  console.log("UserId:", userId, "month:", month, "year:", year);

  if (!userId) return res.status(401).send("Unauthorized");

  const query = `
    SELECT subscriptionname, subscriptiondate, subscriptionbillingcycle
    FROM subscription
    WHERE user_id = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).send("Database error");
    }

    const filteredRenewals = [];

    results.forEach(sub => {
      const startDate = new Date(sub.subscriptiondate);
      const monthsMatch = sub.subscriptionbillingcycle.match(/\d+/);
      const cycleMonths = monthsMatch ? parseInt(monthsMatch[0], 10) : 0;

      if (!cycleMonths) return; // skip if billing cycle is invalid

      // Simulate recurring renewals
      let currentRenewal = new Date(startDate);

      while (currentRenewal.getFullYear() <= year &&
             (currentRenewal.getMonth() + 1) <= month) {
        const rMonth = currentRenewal.getMonth() + 1;
        const rYear = currentRenewal.getFullYear();

        if (rMonth === parseInt(month) && rYear === parseInt(year)) {
          filteredRenewals.push({
            subscriptionname: sub.subscriptionname,
            renewalDate: currentRenewal.toISOString().split('T')[0],
            renewalMonth: rMonth,
            renewalYear: rYear
          });
          break; // No need to check further if matched
        }

        // Add billing cycle
        currentRenewal.setMonth(currentRenewal.getMonth() + cycleMonths);
      }
    });

    console.log("Filtered renewals:", filteredRenewals);
    res.json(filteredRenewals);
  });
});



// ✅ Start server
const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
