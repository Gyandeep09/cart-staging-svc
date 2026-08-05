const pool = require("../config/db");

const listMyOrders = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, COUNT(oi.id) AS item_count
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
      [req.user.id],
    );
    res
      .status(200)
      .json({ status: "ok", count: result.rows.length, orders: result.rows });
  } catch (err) {
    console.error("[Cart-Checkout] List orders error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to retrieve orders." });
  }
};

const getOrderById = async (req, res) => {
  const { id } = req.params;
  try {
    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );
    if (orderResult.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Order not found." });
    }
    const itemsResult = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [id],
    );
    res.status(200).json({
      status: "ok",
      order: { ...orderResult.rows[0], items: itemsResult.rows },
    });
  } catch (err) {
    console.error("[Cart-Checkout] Get order error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to retrieve order." });
  }
};

const cancelOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );

    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Order not found." });
    }

    if (existing.rows[0].status !== "pending_payment") {
      return res.status(409).json({
        status: "error",
        message: `Cannot cancel an order with status "${existing.rows[0].status}".`,
      });
    }

    const result = await pool.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );

    res.status(200).json({ status: "ok", order: result.rows[0] });
  } catch (err) {
    console.error("[Cart-Checkout] Cancel order error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to cancel order." });
  }
};

const listAllOrders = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, COUNT(oi.id) AS item_count
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
    );
    res
      .status(200)
      .json({ status: "ok", count: result.rows.length, orders: result.rows });
  } catch (err) {
    console.error("[Cart-Checkout] Admin list orders error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to retrieve orders." });
  }
};

const getAnyOrderById = async (req, res) => {
  const { id } = req.params;
  try {
    const orderResult = await pool.query(`SELECT * FROM orders WHERE id = $1`, [
      id,
    ]);
    if (orderResult.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Order not found." });
    }
    const itemsResult = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [id],
    );
    res.status(200).json({
      status: "ok",
      order: { ...orderResult.rows[0], items: itemsResult.rows },
    });
  } catch (err) {
    console.error("[Cart-Checkout] Admin get order error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to retrieve order." });
  }
};

const markOrderPaid = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );
    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Order not found." });
    }
    if (existing.rows[0].status !== "pending_payment") {
      return res.status(409).json({
        status: "error",
        message: `Cannot mark as paid: order status is "${existing.rows[0].status}".`,
      });
    }
    const result = await pool.query(
      `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    res.status(200).json({ status: "ok", order: result.rows[0] });
  } catch (err) {
    console.error("[Cart-Checkout] Mark-paid error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to update order status." });
  }
};

const markOrderPaidAsAdmin = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(`SELECT * FROM orders WHERE id = $1`, [
      id,
    ]);
    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Order not found." });
    }
    if (existing.rows[0].status !== "pending_payment") {
      return res.status(409).json({
        status: "error",
        message: `Cannot mark as paid: order status is "${existing.rows[0].status}".`,
      });
    }
    const result = await pool.query(
      `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    res.status(200).json({ status: "ok", order: result.rows[0] });
  } catch (err) {
    console.error("[Cart-Checkout] Admin mark-paid error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to update order status." });
  }
};

const markOrderRefunded = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [id, req.user.id],
    );
    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Order not found." });
    }
    if (existing.rows[0].status !== "paid") {
      return res.status(409).json({
        status: "error",
        message: `Cannot mark as refunded: order status is "${existing.rows[0].status}".`,
      });
    }
    const result = await pool.query(
      `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    res.status(200).json({ status: "ok", order: result.rows[0] });
  } catch (err) {
    console.error("[Cart-Checkout] Mark-refunded error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to update order status." });
  }
};

module.exports = {
  listMyOrders,
  getOrderById,
  cancelOrder,
  listAllOrders,
  getAnyOrderById,
  markOrderPaid,
  markOrderPaidAsAdmin,
  markOrderRefunded,
};
