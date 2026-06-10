/**
 * seed_data.js
 * Seeds realistic data into every table of the dental retail management system.
 *
 * Usage:
 *   node seed_data.js
 *
 * WARNING: This will TRUNCATE all tables before inserting. Dev use only.
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host:     'localhost',
  port:     5433,
  database: 'dental_db',
  user:     'postgres',
  password: 'Reagan@2005',
});

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('🌱 Starting seed...\n');

    // ── 0. CLEAN ────────────────────────────────────────────────────
    await client.query(`
      TRUNCATE TABLE
        audit_logs, payments, invoices, order_items, orders,
        stock_adjustments, stock_batches, products, customers,
        categories, suppliers, users
      RESTART IDENTITY CASCADE
    `);
    await client.query(`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE invoice_number_seq RESTART WITH 1`);
    console.log('🗑️  Cleared all tables');

    // ── 1. USERS ────────────────────────────────────────────────────
    const adminHash = await bcrypt.hash('Admin@1234', 10);
    const staffHash = await bcrypt.hash('Staff@1234', 10);

    const usersRes = await client.query(`
      INSERT INTO users (name, email, password_hash, role) VALUES
        ('Admin Test',    'admin@dental.test',  $1, 'ADMIN'),
        ('Reagan Ndungu', 'reagan@dental.test', $1, 'ADMIN'),
        ('Jane Muthoni',  'jane@dental.test',   $2, 'STAFF'),
        ('Brian Ochieng', 'brian@dental.test',  $2, 'STAFF'),
        ('Aisha Kamau',   'aisha@dental.test',  $2, 'STAFF')
      RETURNING id, name, role
    `, [adminHash, staffHash]);
    console.log(`✅  Users          — ${usersRes.rowCount} rows`);

    const [adminId, reaganId, janeId, brianId] = usersRes.rows.map(r => r.id);

    // ── 2. SUPPLIERS ────────────────────────────────────────────────
    const suppliersRes = await client.query(`
      INSERT INTO suppliers (name, contact_name, phone, email, address, notes) VALUES
        ('Dentsply Sirona Kenya', 'Peter Kariuki',  '+254711000001', 'peter@dentsply.co.ke',  'Industrial Area, Nairobi', 'Main equipment supplier'),
        ('3M East Africa',        'Grace Wanjiru',  '+254722000002', 'grace@3m.co.ke',         'Westlands, Nairobi',       'Composites and adhesives'),
        ('Ivoclar Vivadent KE',   'Samuel Otieno',  '+254733000003', 'samuel@ivoclar.co.ke',  'Upper Hill, Nairobi',      'Ceramics and prosthetics'),
        ('SafeDent Supplies',     'Mary Njoki',     '+254744000004', 'mary@safedent.co.ke',   'Mombasa Road, Nairobi',    'PPE and disposables'),
        ('ProDent Distributors',  'Alex Mutua',     '+254755000005', 'alex@prodent.co.ke',    'Ngong Road, Nairobi',      'General dental instruments')
      RETURNING id, name
    `);
    console.log(`✅  Suppliers      — ${suppliersRes.rowCount} rows`);

    const [dentsplyId, mmId, ivoclarId, safedentId, prodentId] = suppliersRes.rows.map(r => r.id);

    // ── 3. CATEGORIES ───────────────────────────────────────────────
    const catsRes = await client.query(`
      INSERT INTO categories (name) VALUES
        ('Materials'), ('Instruments'), ('Equipment'),
        ('PPE'), ('Consumables'), ('Other')
      RETURNING id, name
    `);
    console.log(`✅  Categories     — ${catsRes.rowCount} rows`);

    const catMap = {};
    catsRes.rows.forEach(r => { catMap[r.name] = r.id; });

    const matId  = catMap['Materials'];
    const insId  = catMap['Instruments'];
    const eqpId  = catMap['Equipment'];
    const ppeId  = catMap['PPE'];
    const conId  = catMap['Consumables'];

    // ── 4. PRODUCTS (pure template literals — no $n params) ─────────
    const pr = await client.query(`
      INSERT INTO products
        (name, brand, sku, unit_of_measure, buying_price, min_selling_price,
         current_stock, reorder_point, tracks_expiry, supplier_id, category_id)
      VALUES
        ('Composite Resin A2',           '3M Filtek',          'MAT-001', 'syringe',  1200.00,  1800.00,  40, 10, TRUE,  ${mmId},       ${matId}),
        ('Composite Resin A3',           '3M Filtek',          'MAT-002', 'syringe',  1200.00,  1800.00,  35, 10, TRUE,  ${mmId},       ${matId}),
        ('Glass Ionomer Cement',         'GC Fuji',            'MAT-003', 'pack',      850.00,  1300.00,  25,  8, TRUE,  ${ivoclarId},  ${matId}),
        ('Dental Bonding Agent',         'Scotchbond 3M',      'MAT-004', 'bottle',    950.00,  1500.00,  30,  8, TRUE,  ${mmId},       ${matId}),
        ('Alginate Impression Material', 'Cavex',              'MAT-005', 'kg',        600.00,   950.00,  20,  5, TRUE,  ${prodentId},  ${matId}),
        ('Mouth Mirror Front Surface',   'Hu-Friedy',          'INS-001', 'piece',     180.00,   300.00, 100, 20, FALSE, ${prodentId},  ${insId}),
        ('Dental Explorer',              'Hu-Friedy',          'INS-002', 'piece',     200.00,   350.00,  80, 20, FALSE, ${prodentId},  ${insId}),
        ('College Tweezers',             'Hu-Friedy',          'INS-003', 'piece',     220.00,   380.00,  60, 15, FALSE, ${prodentId},  ${insId}),
        ('Excavator Set 5pc',            'ProDent',            'INS-004', 'set',       750.00,  1200.00,  30, 10, FALSE, ${prodentId},  ${insId}),
        ('Amalgam Plugger',              'Dentsply',           'INS-005', 'piece',     350.00,   600.00,  45, 10, FALSE, ${dentsplyId}, ${insId}),
        ('Dental X-Ray Unit',            'Dentsply Heliodent', 'EQP-001', 'unit',   85000.00, 120000.00,  3,  1, FALSE, ${dentsplyId}, ${eqpId}),
        ('Ultrasonic Scaler',            'EMS Piezon',         'EQP-002', 'unit',   18000.00,  28000.00,  5,  2, FALSE, ${dentsplyId}, ${eqpId}),
        ('Curing Light LED',             'Woodpecker',         'EQP-003', 'unit',    6500.00,  10000.00,  8,  2, FALSE, ${dentsplyId}, ${eqpId}),
        ('Disposable Gloves M 100pk',    'Medicom',            'PPE-001', 'box',       450.00,   700.00, 120, 30, FALSE, ${safedentId}, ${ppeId}),
        ('Disposable Gloves L 100pk',    'Medicom',            'PPE-002', 'box',       450.00,   700.00,  90, 30, FALSE, ${safedentId}, ${ppeId}),
        ('Surgical Masks 50pk',          'SafeDent',           'PPE-003', 'pack',      300.00,   500.00, 200, 50, FALSE, ${safedentId}, ${ppeId}),
        ('Face Shield',                  'SafeDent',           'PPE-004', 'piece',     250.00,   420.00,  60, 15, FALSE, ${safedentId}, ${ppeId}),
        ('Suction Tips 100pk',           'SafeDent',           'CON-001', 'pack',      380.00,   600.00, 150, 30, FALSE, ${safedentId}, ${conId}),
        ('Cotton Rolls 500pk',           'Dentsply',           'CON-002', 'pack',      250.00,   400.00, 100, 25, FALSE, ${dentsplyId}, ${conId}),
        ('Articulating Paper Booklet',   'Bausch',             'CON-003', 'booklet',   150.00,   280.00,  80, 20, FALSE, ${prodentId},  ${conId})
      RETURNING id, name
    `);
    console.log(`✅  Products       — ${pr.rowCount} rows`);

    const p = {};
    pr.rows.forEach(r => { p[r.name] = r.id; });

    // ── 5. STOCK BATCHES ────────────────────────────────────────────
    await client.query(`
      INSERT INTO stock_batches (product_id, quantity, expiry_date, received_at, delivery_note) VALUES
        (${p['Composite Resin A2']},            50, '2027-06-01', NOW() - INTERVAL '30 days', 'DN-2026-001'),
        (${p['Composite Resin A3']},            40, '2027-06-01', NOW() - INTERVAL '30 days', 'DN-2026-001'),
        (${p['Glass Ionomer Cement']},          30, '2026-12-31', NOW() - INTERVAL '20 days', 'DN-2026-002'),
        (${p['Dental Bonding Agent']},          35, '2027-03-15', NOW() - INTERVAL '25 days', 'DN-2026-003'),
        (${p['Alginate Impression Material']},  25, '2026-11-30', NOW() - INTERVAL '15 days', 'DN-2026-004'),
        (${p['Mouth Mirror Front Surface']},   120, NULL,         NOW() - INTERVAL '45 days', 'DN-2026-005'),
        (${p['Dental Explorer']},              100, NULL,         NOW() - INTERVAL '45 days', 'DN-2026-005'),
        (${p['College Tweezers']},              80, NULL,         NOW() - INTERVAL '45 days', 'DN-2026-005'),
        (${p['Disposable Gloves M 100pk']},    150, NULL,         NOW() - INTERVAL '10 days', 'DN-2026-006'),
        (${p['Disposable Gloves L 100pk']},    110, NULL,         NOW() - INTERVAL '10 days', 'DN-2026-006'),
        (${p['Surgical Masks 50pk']},          250, NULL,         NOW() - INTERVAL '10 days', 'DN-2026-006'),
        (${p['Suction Tips 100pk']},           180, NULL,         NOW() - INTERVAL '5 days',  'DN-2026-007'),
        (${p['Cotton Rolls 500pk']},           120, NULL,         NOW() - INTERVAL '5 days',  'DN-2026-007'),
        (${p['Curing Light LED']},              10, NULL,         NOW() - INTERVAL '60 days', 'DN-2026-008'),
        (${p['Ultrasonic Scaler']},              6, NULL,         NOW() - INTERVAL '60 days', 'DN-2026-008')
    `);
    console.log(`✅  Stock Batches  — 15 rows`);

    // ── 6. STOCK ADJUSTMENTS ────────────────────────────────────────
    await client.query(`
      INSERT INTO stock_adjustments (product_id, quantity, reason, notes) VALUES
        (${p['Composite Resin A2']},          -2, 'DAMAGED',           'Dropped during unpacking'),
        (${p['Glass Ionomer Cement']},         -1, 'EXPIRED',           'Old batch found during audit'),
        (${p['Mouth Mirror Front Surface']},   -5, 'SAMPLE_GIVEN',      'Samples given to Smile Dental Clinic'),
        (${p['Surgical Masks 50pk']},          -3, 'COUNT_CORRECTION',  'Physical count mismatch'),
        (${p['Dental Bonding Agent']},         -1, 'LOST',              'Could not locate after stock check')
    `);
    console.log(`✅  Stock Adj.     — 5 rows`);

    // ── 7. CUSTOMERS ────────────────────────────────────────────────
    const custRes = await client.query(`
      INSERT INTO customers (name, type, contact_person, phone, email, address, credit_limit, payment_term_days, notes)
      VALUES
        ('Smile Dental Clinic',   'CLINIC',  'Dr. Faith Oloo',    '+254700111001', 'faith@smiledental.co.ke', 'Westlands, Nairobi',  50000.00, 30, 'Long-term clinic client'),
        ('Nairobi Dental Centre', 'CLINIC',  'Dr. James Mwangi',  '+254700111002', 'james@nairobidc.co.ke',   'CBD, Nairobi',        80000.00, 30, 'High volume orders'),
        ('Karen Dental Studio',   'CLINIC',  'Dr. Susan Waweru',  '+254700111003', 'susan@karendental.co.ke', 'Karen, Nairobi',      40000.00, 14, 'Prefers email invoices'),
        ('KU Dental School',      'STUDENT', 'Prof. David Kamau', '+254700111004', 'dental@ku.ac.ke',         'Kahawa, Nairobi',     20000.00,  7, 'University bulk orders'),
        ('UoN Dental Hospital',   'STUDENT', 'Dr. Anne Njeri',    '+254700111005', 'dental@uon.ac.ke',        'Parklands, Nairobi',  30000.00,  7, 'Teaching hospital'),
        ('Walk-In Customer',      'WALK_IN', NULL,                NULL,            NULL,                      NULL,                  NULL,      0, 'Generic walk-in account')
      RETURNING id, name
    `);
    console.log(`✅  Customers      — ${custRes.rowCount} rows`);

    const c = {};
    custRes.rows.forEach(r => { c[r.name] = r.id; });

    // ── Helper: get next order / invoice number ──────────────────────
    const nextOrd = async () => (await client.query(`SELECT next_order_number() AS n`)).rows[0].n;
    const nextInv = async () => (await client.query(`SELECT next_invoice_number() AS n`)).rows[0].n;

    // ── 8a. Order 1 — Smile Dental, CONFIRMED, fully PAID (M-Pesa) ──
    const o1num = await nextOrd();
    const o1 = await client.query(
      `INSERT INTO orders (order_number, status, customer_id, created_by, created_at)
       VALUES ($1, 'CONFIRMED', $2, $3, NOW() - INTERVAL '25 days') RETURNING id`,
      [o1num, c['Smile Dental Clinic'], reaganId]
    );
    const o1id = o1.rows[0].id;

    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, min_selling_price, selling_price) VALUES
        (${o1id}, ${p['Composite Resin A2']},         5, 1200.00, 1800.00, 2000.00),
        (${o1id}, ${p['Dental Bonding Agent']},        3,  950.00, 1500.00, 1700.00),
        (${o1id}, ${p['Mouth Mirror Front Surface']}, 10,  180.00,  300.00,  350.00)
    `);

    const i1num = await nextInv();
    const i1 = await client.query(
      `INSERT INTO invoices (invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, amount_paid, due_date, issued_at, order_id)
       VALUES ($1, 'PAID', 19500.00, 16.00, 3120.00, 22620.00, 22620.00, NOW() - INTERVAL '10 days', NOW() - INTERVAL '25 days', $2) RETURNING id`,
      [i1num, o1id]
    );
    await client.query(
      `INSERT INTO payments (invoice_id, amount, method, reference, notes, confirmed_at, recorded_by)
       VALUES ($1, 22620.00, 'MPESA', 'QJ82KL9P3X', 'M-Pesa received from Dr. Faith Oloo', NOW() - INTERVAL '24 days', $2)`,
      [i1.rows[0].id, janeId]
    );

    // ── 8b. Order 2 — Nairobi Dental, CONFIRMED, PARTIAL (bank) ─────
    const o2num = await nextOrd();
    const o2 = await client.query(
      `INSERT INTO orders (order_number, status, customer_id, created_by, created_at)
       VALUES ($1, 'CONFIRMED', $2, $3, NOW() - INTERVAL '15 days') RETURNING id`,
      [o2num, c['Nairobi Dental Centre'], brianId]
    );
    const o2id = o2.rows[0].id;

    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, min_selling_price, selling_price) VALUES
        (${o2id}, ${p['Ultrasonic Scaler']},    2, 18000.00, 28000.00, 32000.00),
        (${o2id}, ${p['Suction Tips 100pk']},  10,   380.00,   600.00,   700.00),
        (${o2id}, ${p['Cotton Rolls 500pk']},   5,   250.00,   400.00,   450.00)
    `);

    const i2num = await nextInv();
    const i2 = await client.query(
      `INSERT INTO invoices (invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, amount_paid, due_date, issued_at, order_id)
       VALUES ($1, 'PARTIAL', 73250.00, 16.00, 11720.00, 84970.00, 30000.00, NOW() + INTERVAL '15 days', NOW() - INTERVAL '15 days', $2) RETURNING id`,
      [i2num, o2id]
    );
    await client.query(
      `INSERT INTO payments (invoice_id, amount, method, reference, notes, confirmed_at, recorded_by)
       VALUES ($1, 30000.00, 'BANK_TRANSFER', 'TRF-KCB-20260525', 'Partial bank transfer, balance pending', NOW() - INTERVAL '14 days', $2)`,
      [i2.rows[0].id, brianId]
    );

    // ── 8c. Order 3 — KU Dental, PENDING quote ───────────────────────
    const o3num = await nextOrd();
    const o3 = await client.query(
      `INSERT INTO orders (order_number, status, is_quote, customer_id, created_by, notes, created_at)
       VALUES ($1, 'PENDING', TRUE, $2, $3, 'Quote requested for semester stock', NOW() - INTERVAL '3 days') RETURNING id`,
      [o3num, c['KU Dental School'], reaganId]
    );
    const o3id = o3.rows[0].id;

    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, min_selling_price, selling_price) VALUES
        (${o3id}, ${p['Disposable Gloves M 100pk']},    20, 450.00, 700.00, 750.00),
        (${o3id}, ${p['Surgical Masks 50pk']},          15, 300.00, 500.00, 550.00),
        (${o3id}, ${p['Articulating Paper Booklet']},   30, 150.00, 280.00, 300.00),
        (${o3id}, ${p['Cotton Rolls 500pk']},           10, 250.00, 400.00, 420.00)
    `);

    // ── 8d. Order 4 — Walk-in, CONFIRMED, cash payment ───────────────
    const o4num = await nextOrd();
    const o4 = await client.query(
      `INSERT INTO orders (order_number, status, customer_id, created_by, notes, created_at)
       VALUES ($1, 'CONFIRMED', $2, $3, 'Walk-in cash sale', NOW() - INTERVAL '7 days') RETURNING id`,
      [o4num, c['Walk-In Customer'], janeId]
    );
    const o4id = o4.rows[0].id;

    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, min_selling_price, selling_price) VALUES
        (${o4id}, ${p['Face Shield']},                 2, 250.00, 420.00, 500.00),
        (${o4id}, ${p['Disposable Gloves L 100pk']},   1, 450.00, 700.00, 750.00)
    `);

    const i4num = await nextInv();
    const i4 = await client.query(
      `INSERT INTO invoices (invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, amount_paid, due_date, issued_at, order_id)
       VALUES ($1, 'PAID', 1750.00, 0, 0, 1750.00, 1750.00, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', $2) RETURNING id`,
      [i4num, o4id]
    );
    await client.query(
      `INSERT INTO payments (invoice_id, amount, method, reference, notes, confirmed_at, recorded_by)
       VALUES ($1, 1750.00, 'CASH', NULL, 'Cash received at counter', NOW() - INTERVAL '7 days', $2)`,
      [i4.rows[0].id, janeId]
    );

    // ── 8e. Order 5 — Karen Dental, DISPATCHED, OVERDUE invoice ──────
    const o5num = await nextOrd();
    const o5 = await client.query(
      `INSERT INTO orders (order_number, status, customer_id, created_by, created_at)
       VALUES ($1, 'DISPATCHED', $2, $3, NOW() - INTERVAL '20 days') RETURNING id`,
      [o5num, c['Karen Dental Studio'], brianId]
    );
    const o5id = o5.rows[0].id;

    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, buying_price, min_selling_price, selling_price) VALUES
        (${o5id}, ${p['Curing Light LED']},   1, 6500.00, 10000.00, 12000.00),
        (${o5id}, ${p['Excavator Set 5pc']},  2,  750.00,  1200.00,  1400.00)
    `);

    const i5num = await nextInv();
    await client.query(
      `INSERT INTO invoices (invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, amount_paid, due_date, issued_at, order_id)
       VALUES ($1, 'OVERDUE', 14800.00, 16.00, 2368.00, 17168.00, 0.00, NOW() - INTERVAL '6 days', NOW() - INTERVAL '20 days', $2)`,
      [i5num, o5id]
    );

    console.log(`✅  Orders         — 5 rows`);
    console.log(`✅  Order Items     — 17 rows`);
    console.log(`✅  Invoices        — 5 rows`);
    console.log(`✅  Payments        — 4 rows`);

    // ── 9. AUDIT LOGS ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO audit_logs (table_name, record_id, action, changed_by, new_values) VALUES
        ('products',  ${p['Composite Resin A2']},   'CREATE', ${reaganId}, '{"name":"Composite Resin A2","buying_price":1200}'),
        ('customers', ${c['Smile Dental Clinic']},  'CREATE', ${reaganId}, '{"name":"Smile Dental Clinic","type":"CLINIC"}'),
        ('orders',    ${o1id},                      'UPDATE', ${janeId},   '{"status":"CONFIRMED"}'),
        ('orders',    ${o5id},                      'UPDATE', ${brianId},  '{"status":"DISPATCHED"}'),
        ('invoices',  ${i2.rows[0].id},             'UPDATE', ${brianId},  '{"status":"PARTIAL","amount_paid":30000}')
    `);
    console.log(`✅  Audit Logs     — 5 rows`);

    await client.query('COMMIT');

    console.log('\n🎉  Seed complete!\n');
    console.log('─────────────────────────────────────────────────────');
    console.log('  Login credentials');
    console.log('  ADMIN  →  admin@dental.test   /  Admin@1234');
    console.log('  ADMIN  →  reagan@dental.test  /  Admin@1234');
    console.log('  STAFF  →  jane@dental.test    /  Staff@1234');
    console.log('  STAFF  →  brian@dental.test   /  Staff@1234');
    console.log('─────────────────────────────────────────────────────');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌  Seed failed — rolled back.\n', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
