const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static images from the "images" folder
app.use('/images', express.static('images'));

const SECRET = process.env.SECRET || 'ongod_secret_key';
const PORT = process.env.PORT || 3000;

// In-memory data (replace with DB in production)
let users = [];
let products = [
  { id: 1, name: "iPhone 11", price: 900000, category: "phones", image: "iphone11.jpg" },
  { id: 2, name: "HP Pavilion", price: 650000, category: "laptops", image: "hplaptop.jpg" },
  { id: 3, name: "Mouse", price: 120000, category: "accessories", image: "mouse.jpg" }
];
let orders = [];
let notifications = [];
let customerCareMessages = [];
let pendingVerifications = {};

// --- EMAIL SETUP (use your real SMTP credentials in production) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'ayomideoluniyi49@gmail.com',
    pass: process.env.GMAIL_PASS || 'yukwpidvyujgpmsv'
  }
});

// --- API ROUTES ---

// Get all products
app.get('/api/products', (req, res) => {
  res.json(products);
});

// Add a new product (for admin/dev)
app.post('/api/products/add', (req, res) => {
  const { name, price, category, image } = req.body;
  if (!name || !price || !category || !image) return res.status(400).json({ error: 'Missing product fields' });
  const id = products.length ? products[products.length - 1].id + 1 : 1;
  products.push({ id, name, price, category, image });
  res.json({ success: true, product: { id, name, price, category, image } });
});

// Update product price
app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { price } = req.body;
  const product = products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (typeof price !== 'number' || price < 0) return res.status(400).json({ error: 'Invalid price' });
  product.price = price;
  res.json({ success: true, product });
});

// Get all notifications (for admin panel and user)
app.get('/api/notifications', (req, res) => {
  const user = req.query.user;
  if (user) {
    // Return only notifications for this user (by username or email)
    const userNotifs = notifications.filter(n =>
      n.username === user || n.user === user || n.email === user
    );
    return res.json(userNotifs);
  }
  res.json(notifications);
});

// Post a new notification
app.post('/api/notifications', (req, res) => {
  const notif = req.body;
  notifications.push(notif);
  res.json({ success: true });
});

// Get all orders
app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// Get all orders for a user
app.get('/api/orders/user/:username', (req, res) => {
  const username = req.params.username;
  const userOrders = orders.filter(o => o.username === username);
  res.json(userOrders);
});

// Place a new order
app.post('/api/orders', (req, res) => {
  const { username, product, price, status, base_price, payment_method, order_type, address, image, date } = req.body;
  if (!username || !product || !price) return res.status(400).json({ error: 'Missing order fields' });
  const id = orders.length ? orders[orders.length - 1].id + 1 : 1;
  orders.push({
    id, username, product, price, status: status || 'pending',
    base_price, payment_method, order_type, address, image, date
  });
  res.json({ success: true, id });
});

// Update order status
app.put('/api/orders/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = status;
  res.json({ success: true, order });
});

// Get all users
app.get('/api/users', (req, res) => {
  res.json(users.map(u => {
    const { password, ...rest } = u;
    return rest;
  }));
});

// Check if username or email exists
app.get('/api/users/check', (req, res) => {
  const { username, email } = req.query;
  const exists = users.some(u => u.username === username || u.email === email);
  res.json({ exists });
});

// --- EMAIL VERIFICATION REGISTRATION FLOW ---

// Step 1: Register - send code to email and phone (simulate phone with response)
app.post('/api/users/register', async (req, res) => {
  const { username, password, state, area, street, email, phone, address } = req.body;
  if (!username || !password || !email || !phone) return res.status(400).json({ error: 'Missing required fields' });
  if (users.find(u => u.username === username || u.email === email)) return res.status(409).json({ error: 'User exists' });

  // Generate code and store pending registration
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
  pendingVerifications[email] = {
    code,
    userData: { username, password, state, area, street, email, phone, address },
    expires
  };

  // Send code to email
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER || 'ayomideoluniyi49@gmail.com',
      to: email,
      subject: 'ONGOD PHONE GADGET - Email Verification Code',
      html: `<h2>ONGOD PHONE GADGET</h2>
        <p>Your verification code is: <b>${code}</b></p>
        <p>Please enter this code to complete your registration.</p>
        <p>If you did not request this, ignore this email.</p>`
    });
  } catch (e) {
    console.error('Email send error:', e); // Log the error for debugging
    return res.status(500).json({ error: 'Failed to send verification email.' });
  }

  // Simulate SMS by returning code in response (for real SMS, integrate with SMS API)
  res.json({
    success: true,
    message: 'Verification code sent to your email. Please check your email and enter the code to complete registration.',
    phoneMessage: `Verification code sent to phone: ${phone} (code: ${code})`
  });
});

// Resend verification code
app.post('/api/users/resend-code', async (req, res) => {
  const { email } = req.body;
  const pending = pendingVerifications[email];
  if (!pending) return res.status(400).json({ error: 'No pending registration for this email.' });

  // Generate new code and update expiry
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 15 * 60 * 1000;
  pending.code = code;
  pending.expires = expires;

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER || 'ayomideoluniyi49@gmail.com',
      to: email,
      subject: 'ONGOD PHONE GADGET - Email Verification Code (Resent)',
      html: `<h2>ONGOD PHONE GADGET</h2>
        <p>Your new verification code is: <b>${code}</b></p>
        <p>Please enter this code to complete your registration.</p>
        <p>If you did not request this, ignore this email.</p>`
    });
  } catch (e) {
    console.error('Resend email error:', e); // Log the error for debugging
    return res.status(500).json({ error: 'Failed to resend verification email.' });
  }

  res.json({
    success: true,
    message: 'Verification code resent to your email.'
  });
});

// Step 2: Verify code and complete registration
app.post('/api/users/verify', async (req, res) => {
  const { email, code } = req.body;
  const pending = pendingVerifications[email];
  if (!pending) return res.status(400).json({ error: 'No pending registration for this email.' });
  if (pending.expires < Date.now()) {
    delete pendingVerifications[email];
    return res.status(400).json({ error: 'Verification code expired. Please register again.' });
  }
  if (pending.code !== code) return res.status(400).json({ error: 'Invalid verification code.' });

  // Complete registration
  const { username, password, state, area, street, phone, address } = pending.userData;
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash, state, area, street, email, phone, address });
  delete pendingVerifications[email];
  res.json({ success: true, message: 'Registration complete. You can now log in.' });
});

// --- LOGIN ENDPOINT ---
app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid email or password.' });
  // Create JWT token
  const token = jwt.sign({ username: user.username, email: user.email }, SECRET, { expiresIn: '7d' });
  res.json({
    token,
    username: user.username,
    email: user.email,
    state: user.state,
    area: user.area,
    street: user.street
  });
});

// Get user info (for address and map)
app.get('/api/users/:username', (req, res) => {
  const username = req.params.username;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...userInfo } = user;
  res.json(userInfo);
});

// Get full address for a user (for map)
app.get('/api/users/:username/address', (req, res) => {
  const username = req.params.username;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Use address if present, else build from street/area/state
  const address = user.address || `${user.street}, ${user.area}, ${user.state}, Nigeria`;
  res.json({ address });
});

// Delete all users
app.delete('/api/users', (req, res) => {
  users = [];
  res.json({ message: 'All users deleted.' });
});

// Delete a user by username
app.delete('/api/users/:username/delete', (req, res) => {
  const username = req.params.username;
  users = users.filter(u => u.username !== username);
  res.json({ message: `User ${username} deleted.` });
});

// Get customer care messages for a user
app.get('/api/customer-care/user/:username', (req, res) => {
  const username = req.params.username;
  const msgs = customerCareMessages.filter(m => m.username === username);
  res.json(msgs);
});

// Post a new customer care message (from user)
app.post('/api/customer-care', (req, res) => {
  const { text, username, email } = req.body;
  if (!text || !username || !email) return res.status(400).json({ error: 'Missing text, username, or email' });
  const userExists = users.find(u => u.username === username);
  if (!userExists) return res.status(403).json({ error: 'You must be registered and logged in to use customer care.' });
  customerCareMessages.push({
    from: 'user',
    text,
    date: new Date(),
    username,
    email
  });
  res.json({ success: true });
});

// Get all customer care messages (for admin panel)
app.get('/api/customer-care', (req, res) => {
  res.json(customerCareMessages);
});

// Admin sends a reply to a user
app.post('/api/customer-care/reply', (req, res) => {
  const { text, username } = req.body;
  if (!text || !username) return res.status(400).json({ error: 'Missing text or username' });
  const lastMsg = customerCareMessages.slice().reverse().find(m => m.username === username && m.email);
  const email = lastMsg ? lastMsg.email : '';
  customerCareMessages.push({
    from: 'admin',
    text,
    date: new Date(),
    username,
    email
  });
  res.json({ success: true });
});

// --- EXTRA: Delete all orders, notifications, and customer care messages (admin utility) ---
app.delete('/api/admin/clear-all', (req, res) => {
  users = [];
  orders = [];
  notifications = [];
  customerCareMessages = [];
  res.json({ message: 'All users, orders, notifications, and customer care messages deleted.' });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    console.log('Public URL: https://' + process.env.RENDER_EXTERNAL_HOSTNAME);
  }
});

// --- EXTRA: Utility endpoint to add a test user quickly (for development only) ---
app.post('/api/dev-add-user', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ error: 'Missing username, password, or email' });
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'User exists' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash, email });
  res.json({ success: true, user: { username, email } });
});

// --- 404 Handler for unknown routes ---
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});