const pool = require("../config/db");
const { isValidCurrencyCode } = require("../utils/validators");

const addToCart = async (req, res) => {
  const user_id = req.user.id;
  const { entity_type, entity_id, item_name, unit_price, quantity, currency } =
    req.body;

  if (!entity_type || !entity_id || !item_name || unit_price === undefined) {
    return res.status(400).json({
      status: "error",
      message:
        "entity_type, entity_id, item_name, and unit_price are required.",
    });
  }

  if (unit_price < 0) {
    return res
      .status(400)
      .json({ status: "error", message: "unit_price cannot be negative." });
  }
  const qty = quantity || 1;
  if (qty <= 0) {
    return res
      .status(400)
      .json({ status: "error", message: "quantity must be greater than 0." });
  }
  const currencyCode = currency || "INR";
  if (!isValidCurrencyCode(currencyCode)) {
    return res.status(400).json({
      status: "error",
      message:
        "currency must be a valid 3-letter ISO 4217 code (e.g. INR, USD, EUR).",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO cart_items (user_id, entity_type, entity_id, item_name, unit_price, quantity, currency)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, entity_type, entity_id)
             DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()
             RETURNING *`,
      [
        user_id,
        entity_type,
        entity_id,
        item_name,
        unit_price,
        qty,
        currencyCode,
      ],
    );

    res.status(201).json({ status: "ok", item: result.rows[0] });
  } catch (err) {
    console.error("[Cart-Checkout] Add to cart error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to add item to cart." });
  }
};

const getMyCart = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM cart_items WHERE user_id = $1 ORDER BY added_at DESC`,
      [req.user.id],
    );

    const total = result.rows.reduce(
      (sum, item) => sum + Number(item.unit_price) * item.quantity,
      0,
    );

    const currencies = [...new Set(result.rows.map((item) => item.currency))];

    res.status(200).json({
      status: "ok",
      item_count: result.rows.length,
      total: total.toFixed(2),
      currencies,
      items: result.rows,
    });
  } catch (err) {
    console.error("[Cart-Checkout] Fetch cart error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to retrieve cart." });
  }
};

const updateCartItem = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (quantity === undefined || quantity <= 0) {
    return res.status(400).json({
      status: "error",
      message:
        "quantity is required and must be greater than 0. Use DELETE to remove an item.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE cart_items SET quantity = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
      [quantity, id, req.user.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          status: "error",
          message: "Cart item not found, or does not belong to you.",
        });
    }

    res.status(200).json({ status: "ok", item: result.rows[0] });
  } catch (err) {
    console.error("[Cart-Checkout] Update cart item error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to update cart item." });
  }
};

const removeCartItem = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          status: "error",
          message: "Cart item not found, or does not belong to you.",
        });
    }

    res.status(200).json({ status: "ok", message: "Item removed from cart." });
  } catch (err) {
    console.error("[Cart-Checkout] Remove cart item error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to remove cart item." });
  }
};

const checkout = async (req, res) => {
  const user_id = req.user.id;
  const paymentMethod = req.body.payment_method === "cod" ? "cod" : "online";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cartResult = await client.query(
      `SELECT * FROM cart_items WHERE user_id = $1`,
      [user_id],
    );

    if (cartResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ status: "error", message: "Cart is empty." });
    }

    const distinctCurrencies = [
      ...new Set(cartResult.rows.map((item) => item.currency)),
    ];
    if (distinctCurrencies.length > 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        status: "error",
        message: `Cart contains multiple currencies (${distinctCurrencies.join(", ")}). Checkout one currency at a time.`,
      });
    }
    const orderCurrency = distinctCurrencies[0];

    const total = cartResult.rows.reduce(
      (sum, item) => sum + Number(item.unit_price) * item.quantity,
      0,
    );

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, status, total, currency, payment_method) VALUES ($1, 'pending_payment', $2, $3, $4) RETURNING *`,
      [user_id, total.toFixed(2), orderCurrency, paymentMethod],
    );
    const order = orderResult.rows[0];

    for (const item of cartResult.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, entity_type, entity_id, item_name, unit_price, quantity, currency)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.entity_type,
          item.entity_id,
          item.item_name,
          item.unit_price,
          item.quantity,
          item.currency,
        ],
      );
    }

    await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [user_id]);

    await client.query("COMMIT");

    const itemsResult = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [order.id],
    );
    res
      .status(201)
      .json({ status: "ok", order: { ...order, items: itemsResult.rows } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Cart-Checkout] Checkout error:", err);
    res
      .status(500)
      .json({
        status: "error",
        message: "Checkout failed. No order was created.",
      });
  } finally {
    client.release();
  }
};

module.exports = {
  addToCart,
  getMyCart,
  updateCartItem,
  removeCartItem,
  checkout,
};
