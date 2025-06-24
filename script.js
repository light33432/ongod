// --- Force logout for all users who have logged in before ---
localStorage.removeItem('gadgetToken');
localStorage.removeItem('gadgetLoggedIn');
localStorage.removeItem('gadgetLastNotif');

// --- API Endpoints ---
const API_BASE = "https://ongod-phone.onrender.com/api";
const ORDERS_API = `${API_BASE}/orders`;
const PRODUCTS_API = `${API_BASE}/products`;
const USERS_API = `${API_BASE}/users`;
const NOTIFICATIONS_API = `${API_BASE}/notifications`;

// --- Utility Functions ---
function escapeHtml(unsafe) {
  return String(unsafe).replace(/[&<"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function showNotification(message) {
  let notif = document.getElementById('custom-notification');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'custom-notification';
    notif.style.cssText = `
      position: fixed; bottom: 30px; right: 30px;
      background: #1a237e; color: #fff; padding: 16px 24px;
      border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      font-size: 1.1em; z-index: 99999; display: none;
    `;
    document.body.appendChild(notif);
  }
  notif.innerText = message;
  notif.style.display = 'block';
  setTimeout(() => notif.style.display = 'none', 3500);
}

function setNotificationDot(show) {
  const notifBtn = document.getElementById('notification-btn');
  let dot = notifBtn.querySelector('.notif-dot');
  if (show) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'notif-dot';
      notifBtn.appendChild(dot);
    }
    dot.style.display = 'block';
  } else if (dot) {
    dot.style.display = 'none';
  }
}

// --- Auth & Modal Logic ---
function showRegisterForm() {
  document.getElementById('register-form-modal').style.display = 'flex';
}
function closeRegisterForm() {
  document.getElementById('register-form-modal').style.display = 'none';
}
function showRegister() {
  document.getElementById('login-title').innerText = "Register";
  document.getElementById('login-btn').style.display = "none";
  document.getElementById('register-btn').style.display = "inline-block";
  document.getElementById('switch-to-register').style.display = "none";
  document.getElementById('switch-to-login').style.display = "inline-block";
  document.getElementById('login-error').innerText = "";
}
function showLogin() {
  document.getElementById('login-title').innerText = "Login";
  document.getElementById('login-btn').style.display = "inline-block";
  document.getElementById('register-btn').style.display = "none";
  document.getElementById('switch-to-register').style.display = "inline-block";
  document.getElementById('switch-to-login').style.display = "none";
  document.getElementById('login-error').innerText = "";
}

// --- Registration ---
async function register() {
  const email = document.getElementById('email') ? document.getElementById('email').value.trim() : '';
  const username = document.getElementById('reg-username') ? document.getElementById('reg-username').value.trim() : '';
  const phone = document.getElementById('reg-phone') ? document.getElementById('reg-phone').value.trim() : '';
  const password = document.getElementById('reg-password').value;
  const state = document.getElementById('reg-state').value;
  const area = document.getElementById('reg-area').value;
  const street = document.getElementById('reg-street').value;
  const address = document.getElementById('reg-address') ? document.getElementById('reg-address').value.trim() : '';
  if (!email || !username || !phone || !password || !state || !area || !street || !address) {
    document.getElementById('reg-error').innerText = "Please fill all fields.";
    return;
  }
  try {
    const res = await fetch(`${USERS_API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, phone, password, state, area, street, address })
    });
    const data = await res.json();
    if (res.ok) {
      // Show verification modal
      document.getElementById('register-form-modal').style.display = 'none';
      document.getElementById('verify-modal').style.display = 'flex';
      window._pendingReg = { email, password };
      document.getElementById('verify-error').innerText = "";
    } else {
      document.getElementById('reg-error').innerText = data.message || data.error || "Registration failed.";
    }
  } catch {
    document.getElementById('reg-error').innerText = "Registration failed.";
  }
}

// --- Verification Modal Logic ---
async function acceptVerification() {
  const code = document.getElementById('verify-code').value.trim();
  const { email, password } = window._pendingReg || {};
  if (!email || !password) {
    document.getElementById('verify-error').innerText = "Session expired. Please register again.";
    return;
  }
  if (!code) {
    document.getElementById('verify-error').innerText = "Enter the code sent to your email.";
    return;
  }
  try {
    const res = await fetch(`${USERS_API}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('verify-modal').style.display = 'none';
      showLogin();
      document.getElementById('login-error').innerText = "Verification successful! Please log in.";
    } else {
      document.getElementById('verify-error').innerText = data.error || "Verification failed.";
    }
  } catch {
    document.getElementById('verify-error').innerText = "Network error. Try again.";
  }
}

function declineVerification() {
  document.getElementById('verify-modal').style.display = 'none';
  window._pendingReg = null;
  showLogin();
}

// --- Login ---
async function login() {
  const email = document.getElementById('login-email') ? document.getElementById('login-email').value.trim() : '';
  const password = document.getElementById('login-password').value;
  if (!email || !password) {
    document.getElementById('login-error').innerText = "Please enter your email and password.";
    return;
  }
  try {
    const res = await fetch(`${USERS_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('gadgetToken', data.token);
      localStorage.setItem('gadgetLoggedIn', data.username || email);
      localStorage.setItem('gadgetLastNotif', '');
      localStorage.setItem('careUsername', data.username || email); // For customer care chat
      document.getElementById('login-modal').style.display = "none";
      document.getElementById('main-content').style.display = "block";
      showNotification('Welcome back, ' + (data.username || email) + '!');
      loadProductsForUser();
      checkForNewNotifications();
    } else if (data.error && data.error.toLowerCase().includes("verify")) {
      // If not verified, show verification modal
      window._pendingReg = { email, password };
      document.getElementById('verify-modal').style.display = 'flex';
      document.getElementById('verify-error').innerText = "Please verify your email to continue.";
    } else {
      document.getElementById('login-error').innerText = data.message || data.error || "Invalid email or password.";
    }
  } catch {
    document.getElementById('login-error').innerText = "Login failed.";
  }
}

// --- Logout ---
function forceLogoutAndRequireLogin(message) {
  localStorage.removeItem('gadgetToken');
  localStorage.removeItem('gadgetLoggedIn');
  localStorage.removeItem('gadgetLastNotif');
  document.getElementById('main-content').style.display = "none";
  document.getElementById('login-modal').style.display = "flex";
  if (message) document.getElementById('login-error').innerText = message;
}

// --- Notifications ---
function showNotifications() {
  document.getElementById('notif-modal').style.display = 'flex';
  loadOrderNotificationsOnly();
  setNotificationDot(false);
  const username = localStorage.getItem('gadgetLoggedIn');
  if (username) localStorage.setItem('gadgetLastNotif', Date.now().toString());
}

async function checkForNewNotifications() {
  const username = localStorage.getItem('gadgetLoggedIn');
  const token = localStorage.getItem('gadgetToken');
  if (!username || !token) return setNotificationDot(false);
  try {
    const notifRes = await fetch(`${NOTIFICATIONS_API}?user=${encodeURIComponent(username)}`, {
      headers: { "Authorization": "Bearer " + token }
    });
    const notifs = await notifRes.json();
    let lastSeen = localStorage.getItem('gadgetLastNotif') || "0";
    let hasNew = false;
    for (let n of notifs) {
      if (n.date && new Date(n.date).getTime() > parseInt(lastSeen)) {
        hasNew = true;
        break;
      }
    }
    setNotificationDot(hasNew);
  } catch {
    setNotificationDot(false);
  }
}

// --- Show only order notifications in modal ---
async function loadOrderNotificationsOnly() {
  const notifMessages = document.getElementById('notif-messages');
  notifMessages.innerHTML = "Loading...";
  const username = localStorage.getItem('gadgetLoggedIn');
  const token = localStorage.getItem('gadgetToken');
  if (!username || !token) {
    notifMessages.innerHTML = "<div style='color:#888;'>Please log in to view your orders.</div>";
    return;
  }
  try {
    const notifRes = await fetch(`${NOTIFICATIONS_API}?user=${encodeURIComponent(username)}`, {
      headers: { "Authorization": "Bearer " + token }
    });
    const notifs = await notifRes.json();
    // Filter only notifications with type "order"
    const orderNotifs = notifs.filter(n => n.type === "order");
    let html = `<div style="font-weight:700;color:#3949ab;margin:8px 0;">Your Orders Sent to Admin:</div>`;
    if (orderNotifs.length) {
      orderNotifs.forEach(n => {
        html += `
          <div style="margin-bottom:10px;padding:8px 0;border-bottom:1px solid #e0e7ff;">
            <div>${escapeHtml(n.message || '')}</div>
            <div style="font-size:0.95em;color:#888;">${escapeHtml(n.date || '')}</div>
          </div>
        `;
      });
    } else {
      html += "<div style='color:#888;'>No order notifications yet.</div>";
    }
    notifMessages.innerHTML = html;
  } catch {
    notifMessages.innerHTML = "<div style='color:#e74c3c;'>Failed to load notifications.</div>";
  }
}

// --- Products ---
function loadProductsForUser() {
  fetchAndDisplayProducts();
}

async function fetchAndDisplayProducts() {
  try {
    const res = await fetch(PRODUCTS_API);
    const products = await res.json();
    const phones = products.filter(p => (p.category || '').toLowerCase() === 'phones');
    const laptops = products.filter(p => (p.category || '').toLowerCase() === 'laptops');
    const accessories = products.filter(p => (p.category || '').toLowerCase() === 'accessories');
    displayProducts('phones-list', phones);
    displayProducts('laptops-list', laptops);
    displayProducts('accessories-list', accessories);
  } catch {
    showNotification('Failed to load products.');
  }
}

function getProductImageUrl(image) {
  if (!image) return '';
  // If image is already a full URL, use it; otherwise, prepend backend path
  if (/^https?:\/\//i.test(image)) {
    return image;
  }
  return `https://ongod-phone.onrender.com/images/${escapeHtml(image)}`;
}

function displayProducts(containerId, products) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!products.length) {
    container.innerHTML = '<div style="color:#e74c3c;">No products found.</div>';
    return;
  }
  container.innerHTML = products.map(product => {
    const imageUrl = getProductImageUrl(product.image || '');
    return `
      <div class="Gadget-item">
        <img src="${imageUrl}" alt="${escapeHtml(product.name || '')}">
        <h2>${escapeHtml(product.name || '')}</h2>
        <p>₦${escapeHtml(product.price || '')}</p>
        <div class="button-group">
          <button onclick="showBuyModal('${escapeHtml(product.name || '')}', '${escapeHtml(product.price || '')}', '${imageUrl}')">Buy Now</button>
        </div>
      </div>
    `;
  }).join('');
}

// --- Search ---
async function searchGadgets() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  if (!searchTerm.trim()) {
    loadProductsForUser();
    return;
  }
  try {
    const res = await fetch(`${PRODUCTS_API}?search=${encodeURIComponent(searchTerm)}`);
    const products = await res.json();
    const phones = products.filter(p => (p.category || '').toLowerCase() === 'phones');
    const laptops = products.filter(p => (p.category || '').toLowerCase() === 'laptops');
    const accessories = products.filter(p => (p.category || '').toLowerCase() === 'accessories');
    displayProducts('phones-list', phones);
    displayProducts('laptops-list', laptops);
    displayProducts('accessories-list', accessories);
    if (products.length === 0) {
      showNotification('No products found matching your search.');
    }
  } catch {
    showNotification('Failed to search products.');
  }
}

// --- Buy Modal ---
function showBuyModal(productName, productPrice, productImage) {
  const modalContent = document.getElementById('modal-content');
  let basePrice = parseFloat(productPrice);
  let deliveryTotal = Math.round(basePrice * 2);
  let pickupTotal = Math.round(basePrice * 1.3);
  modalContent.innerHTML = `
    <button class="close-btn" onclick="document.getElementById('modal-bg').style.display='none'">&times;</button>
    <img src="${escapeHtml(productImage)}" alt="${escapeHtml(productName)}">
    <h2>${escapeHtml(productName)}</h2>
    <div id="price-info">
      <p>Price: ₦<span id="price-value">${deliveryTotal}</span></p>
    </div>
    <form id="orderForm">
      <div style="margin: 15px 0;">
        <label style="display: block; margin-bottom: 10px;">
          <input type="radio" name="order-type" value="delivery" checked> Delivery
        </label>
        <label style="display: block;">
          <input type="radio" name="order-type" value="pickup"> Pickup
        </label>
      </div>
      <div id="payment-method-container" style="margin: 15px 0;">
        <select id="payment-method" style="width: 100%; padding: 8px; border-radius: 5px;">
          <option value="">Select Payment Method</option>
          <option value="Cash on Delivery">Cash on Delivery</option>
          <option value="Bank Transfer">Bank Transfer</option>
        </select>
      </div>
      <div id="auto-map-container" style="margin: 15px 0;"></div>
      <button type="submit" style="width: 100%;">Confirm Order</button>
    </form>
  `;
  document.getElementById('modal-bg').style.display = 'flex';
  setTimeout(showUserMapInBuyModal, 0);
  const orderTypeInputs = document.querySelectorAll('input[name="order-type"]');
  const paymentMethodContainer = document.getElementById('payment-method-container');
  const priceValue = document.getElementById('price-value');
  orderTypeInputs.forEach(input => {
    input.addEventListener('change', function() {
      showUserMapInBuyModal();
      if (this.value === 'pickup') {
        paymentMethodContainer.style.display = 'none';
        priceValue.textContent = pickupTotal;
      } else {
        paymentMethodContainer.style.display = 'block';
        priceValue.textContent = deliveryTotal;
      }
    });
  });
  document.getElementById('orderForm').onsubmit = function(event) {
    submitOrder(event, productName, productPrice, productImage);
  };
}

// --- Map: Get address from backend and show map ---
async function showUserMapInBuyModal() {
  const username = localStorage.getItem('gadgetLoggedIn');
  const token = localStorage.getItem('gadgetToken');
  const container = document.getElementById('auto-map-container');
  if (!username || !token) {
    if (container) container.innerHTML = "<div style='color:#e74c3c;'>Please log in to see your delivery location.</div>";
    return;
  }
  try {
    // Fetch address from backend
    const res = await fetch(`${USERS_API}/${encodeURIComponent(username)}/address`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
      if (container) container.innerHTML = "<div style='color:#e74c3c;'>User not found. Please register or log in again.</div>";
      return;
    }
    const data = await res.json();
    const address = data.address;
    container.innerHTML = `
      <div style="margin:10px 0 5px 0;color:#3949ab;font-weight:700;">Delivery/Pickup Location</div>
      <div style="width:100%;height:220px;border-radius:10px;overflow:hidden;margin-bottom:10px;">
        <iframe
          width="100%"
          height="100%"
          style="border:0"
          loading="lazy"
          allowfullscreen
          referrerpolicy="no-referrer-when-downgrade"
          src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed">
        </iframe>
      </div>
      <div style="color:#3949ab;font-weight:700;">${address}</div>
    `;
  } catch {
    if (container) container.innerHTML = "<div style='color:#e74c3c;'>Could not load user info.</div>";
  }
}

// --- Order Submission ---
async function submitOrder(event, productName, productPrice, productImage) {
  event.preventDefault();
  const username = localStorage.getItem('gadgetLoggedIn');
  const token = localStorage.getItem('gadgetToken');
  if (!username || !token) {
    showNotification('Please login first.');
    return;
  }
  let basePrice = parseFloat(productPrice);
  let total = basePrice;
  let paymentMethod = '';
  let showBankDetails = false;
  const orderType = document.querySelector('input[name="order-type"]:checked').value;
  if (orderType === 'pickup') {
    total = Math.round(basePrice * 1.3);
    paymentMethod = 'Bank Transfer Only';
    showBankDetails = true;
  } else {
    total = Math.round(basePrice * 2);
    const selectedMethod = document.getElementById('payment-method').value;
    if (!selectedMethod) {
      alert('Please select a payment method.');
      return;
    }
    paymentMethod = selectedMethod;
    if (selectedMethod === "Bank Transfer") showBankDetails = true;
  }
  let address = '';
  try {
    // Fetch address from backend for order
    const res = await fetch(`${USERS_API}/${encodeURIComponent(username)}/address`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (res.ok) {
      const data = await res.json();
      address = data.address;
    }
  } catch {}
  document.getElementById('modal-bg').style.display = 'none';
  showNotification('Order placed successfully!');
  setNotificationDot(true);
  if (showBankDetails) {
    setTimeout(() => {
      alert("Please transfer the total amount to:\nAccount Name: ONGOD GADGETS\nAccount Number: 1234567890\nBank: Zenith Bank");
    }, 500);
  }
  try {
    await fetch(ORDERS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        username,
        product: productName,
        price: total,
        base_price: basePrice,
        payment_method: paymentMethod,
        order_type: orderType,
        address,
        image: productImage,
        status: "pending",
        date: new Date().toLocaleString()
      })
    });
    await fetch(NOTIFICATIONS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        type: "order",
        username: username,
        message: `New order from ${username}: ${productName} - ₦${total} (${orderType}, ${paymentMethod})\nAddress: ${address}`,
        date: new Date().toLocaleString()
      })
    });
    loadOrderNotificationsOnly();
    setNotificationDot(true);
  } catch {
    showNotification('Order sent, but failed to notify admin.');
  }
}

// --- Page Load ---
document.addEventListener('DOMContentLoaded', function() {
  const loggedIn = localStorage.getItem('gadgetLoggedIn');
  if (loggedIn) {
    document.getElementById('login-modal').style.display = "none";
    document.getElementById('main-content').style.display = "block";
    loadProductsForUser();
    loadOrderNotificationsOnly();
    checkForNewNotifications();
  }
  document.getElementById('search-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchGadgets();
  });
  setInterval(() => {
    if (localStorage.getItem('gadgetLoggedIn')) {
      loadOrderNotificationsOnly();
      checkForNewNotifications();
    }
  }, 60000);
  if (loggedIn) loadProductsForUser();
});