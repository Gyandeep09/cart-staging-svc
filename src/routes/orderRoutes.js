const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/verifyToken');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
    listMyOrders, getOrderById, cancelOrder, listAllOrders, getAnyOrderById,
} = require('../controllers/orderController');

router.get('/', verifyToken, listMyOrders);
router.get('/admin/all', verifyToken, requireAdmin, listAllOrders);
router.get('/admin/:id', verifyToken, requireAdmin, getAnyOrderById);
router.get('/:id', verifyToken, getOrderById);
router.patch('/:id/cancel', verifyToken, cancelOrder);

module.exports = router;