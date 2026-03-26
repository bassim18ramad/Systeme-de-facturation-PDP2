const express = require("express");
const cors = require("cors"); // Add cors
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); // Enable CORS
app.use(express.json());

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/api"));
app.use("/storage/v1", require("./routes/storage"));

app.get("/", (req, res) => {
  res.send("Supabase Local Mock Server is Running");
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Pour Vercel Serverless Functions
module.exports = app;
