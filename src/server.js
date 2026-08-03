const express = require("express");
const cors = require("cors");
require("dotenv").config();
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");

const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5005;

app.use(express.json());
app.use(cors());

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.status(200).json({
      status: "ok",
      service: "cart-checkout-engine",
      db_time: result.rows[0].now,
    });
  } catch (err) {
    console.error("[Cart-Checkout] Health check DB error:", err);
    res.status(500).json({
      status: "error",
      service: "cart-checkout-engine",
      message: "Database unreachable",
    });
  }
});

app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);

app.listen(PORT, () => {
  console.log(`[Cart-Checkout] Server running on port ${PORT}`);
});
