const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/verifyToken');
const { addToCart, getMyCart, updateCartItem, removeCartItem, checkout } = require('../controllers/cartController');

router.post('/', verifyToken, addToCart);
router.get('/', verifyToken, getMyCart);
router.patch('/:id', verifyToken, updateCartItem);
router.delete('/:id', verifyToken, removeCartItem);
router.post('/checkout', verifyToken, checkout);

module.exports = router;