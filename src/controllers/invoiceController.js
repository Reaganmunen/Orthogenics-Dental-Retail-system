const InvoiceModel   = require('../models/invoiceModel');
const OrderItemModel = require('../models/orderItemModel');
const {PaymentModel}   = require('../models/paymentModel');

const InvoiceController = {

  // GET /api/invoices?status=&search=
  async getAll(req, res, next) {
    try {
      const { status, search } = req.query;
      const invoices = await InvoiceModel.findAll({ status, search });
      res.json({ success: true, data: invoices });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/invoices/overdue
  async getOverdue(req, res, next) {
    try {
      const invoices = await InvoiceModel.listOverdue();
      res.json({ success: true, data: invoices });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/invoices/:id
  async getOne(req, res, next) {
    try {
      const invoice = await InvoiceModel.findById(req.params.id);
      if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

      // Attach line items and payment history
      const items    = await OrderItemModel.findByOrder(invoice.order_id);
      const payments = await PaymentModel.findByInvoice(invoice.id);

      // Ensure customer_name is properly set (fallback to 'Walk-in Customer')
      const customerName = invoice.customer_name || 'Walk-in Customer';

      res.json({ 
        success: true, 
        data: { 
          ...invoice, 
          customer_name: customerName,
          items, 
          payments 
        } 
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/invoices/by-order/:order_id
  async getByOrder(req, res, next) {
    try {
      const invoice = await InvoiceModel.findByOrder(req.params.order_id);
      if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found for this order' });
      
      // Ensure customer_name is properly set
      const customerName = invoice.customer_name || 'Walk-in Customer';
      
      res.json({ 
        success: true, 
        data: { 
          ...invoice, 
          customer_name: customerName 
        } 
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/invoices/run-overdue-sweep
  // Marks all past-due unpaid/partial invoices as OVERDUE
  async runOverdueSweep(req, res, next) {
    try {
      const updated = await InvoiceModel.markOverdue();
      res.json({ success: true, message: `${updated.length} invoice(s) marked as overdue`, data: updated });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = InvoiceController;