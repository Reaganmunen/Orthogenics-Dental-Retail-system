const express = require('express');
const router  = express.Router();

// ─── Import all route modules ────────────────────────────────
const authRoutes     = require('./authRoutes');
const supplierRoutes = require('./supplierRoutes');
const categoryRoutes = require('./categoryRoutes');
const productRoutes  = require('./productRoutes');
const stockRoutes    = require('./stockRoutes');
const customerRoutes = require('./customerRoutes');
const orderRoutes    = require('./orderRoutes');
const invoiceRoutes  = require('./invoiceRoutes');
const paymentRoutes  = require('./paymentRoutes');
const reportRoutes   = require('./reportRoutes');

// ─── Mount all routes under /api ─────────────────────────────
router.use('/auth',       authRoutes);
router.use('/suppliers',  supplierRoutes);
router.use('/categories', categoryRoutes);
router.use('/products',   productRoutes);
router.use('/stock',      stockRoutes);
router.use('/customers',  customerRoutes);
router.use('/orders',     orderRoutes);
router.use('/invoices',   invoiceRoutes);
router.use('/payments',   paymentRoutes);
router.use('/reports',    reportRoutes);

module.exports = router;