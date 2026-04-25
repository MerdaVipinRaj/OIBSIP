const { useEffect, useState } = React;

const SIZE_PRICES = {
  Small: 169,
  Medium: 229,
  Large: 299,
};

const ORDER_STATUSES = ['Received', 'In the Kitchen', 'Sent for Delivery', 'Delivered'];

const DEFAULT_BUILDER_OPTIONS = {
  base: ['Classic', 'Thin Crust', 'Whole Wheat', 'Cheese Burst', 'Pan Crust'],
  sauce: [
    'Tomato Blaze',
    'Garlic Cream',
    'Pesto Burst',
    'Smoky Arrabbiata',
    'Roasted Pepper Sauce',
  ],
  cheese: ['Mozzarella', 'Cheddar', 'Parmesan', 'Feta', 'Burrata'],
  veggies: [
    'Basil',
    'Onion',
    'Corn',
    'Olives',
    'Mushroom',
    'Bell Pepper',
    'Jalapeno',
    'Spinach',
  ],
  meats: ['Pepperoni', 'Chicken Sausage', 'Smoked Chicken', 'Bacon'],
};

const DEFAULT_BUILDER = {
  name: 'House Special',
  size: 'Medium',
  base: 'Classic',
  sauce: 'Tomato Blaze',
  cheese: 'Mozzarella',
  veggies: ['Basil', 'Olives'],
  meats: [],
};

const EMPTY_DELIVERY = {
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'India',
  notes: '',
};

const EMPTY_LOGIN = {
  email: '',
  password: '',
};

const EMPTY_REGISTER = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  address: '',
  inviteCode: '',
};

const EMPTY_VERIFY = {
  email: '',
  code: '',
};

const EMPTY_FORGOT = {
  email: '',
};

const EMPTY_RESET = {
  email: '',
  code: '',
  newPassword: '',
  confirmPassword: '',
};

const EMPTY_INVENTORY_ITEM = {
  category: 'base',
  item: '',
  quantity: 0,
  price: 0,
  threshold: 5,
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return 'Just now';
  }
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function buildCustomPrice(builder) {
  return (
    SIZE_PRICES[builder.size] +
    builder.veggies.length * 18 +
    builder.meats.length * 24 +
    36
  );
}

function calculateCartSummary(cart) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const salesTax = Math.round(subtotal * 0.05);
  const deliveryCharges = subtotal >= 600 ? 0 : 49;
  return {
    subtotal,
    salesTax,
    deliveryCharges,
    total: subtotal + salesTax + deliveryCharges,
    itemCount: cart.reduce((sum, item) => sum + Number(item.quantity), 0),
  };
}

function statusClassName(status) {
  return `status-pill status-${String(status || '')
    .toLowerCase()
    .replace(/\s+/g, '-')}`;
}

function groupInventoryRows(inventory) {
  return [
    { label: 'Bases', key: 'bases' },
    { label: 'Sauces', key: 'sauces' },
    { label: 'Cheeses', key: 'cheeses' },
    { label: 'Veggies', key: 'veggies' },
    { label: 'Meats', key: 'meats' },
  ].map((entry) => ({
    ...entry,
    items: (inventory && inventory[entry.key]) || [],
  }));
}

function getPageFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get('page') === 'account' ? 'account' : 'home';
}

function buildPageUrl(page, hash = '') {
  const basePath = window.location.pathname || '/';
  return page === 'account' ? `${basePath}?page=account${hash}` : `${basePath}${hash}`;
}

function App() {
  const [config, setConfig] = useState({
    appName: 'Pizza Delivery',
    razorpayEnabled: false,
    razorpayKeyId: '',
    emailMode: 'log',
  });
  const [pizzas, setPizzas] = useState([]);
  const [builderOptions, setBuilderOptions] = useState(DEFAULT_BUILDER_OPTIONS);
  const [filter, setFilter] = useState('All');
  const [builder, setBuilder] = useState(DEFAULT_BUILDER);
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('pizza-delivery-cart');
      return saved ? JSON.parse(saved) : [];
    } catch (_error) {
      return [];
    }
  });
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem('pizza-delivery-session');
      return saved ? JSON.parse(saved) : null;
    } catch (_error) {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [pageNotice, setPageNotice] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [success, setSuccess] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [authView, setAuthView] = useState({
    role: 'user',
    mode: 'login',
  });
  const [loginForm, setLoginForm] = useState(EMPTY_LOGIN);
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER);
  const [verifyForm, setVerifyForm] = useState(EMPTY_VERIFY);
  const [forgotForm, setForgotForm] = useState(EMPTY_FORGOT);
  const [resetForm, setResetForm] = useState(EMPTY_RESET);
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY);
  const [myOrders, setMyOrders] = useState([]);
  const [adminData, setAdminData] = useState({
    stats: null,
    orders: [],
    users: [],
    admins: [],
    inventory: {
      bases: [],
      sauces: [],
      cheeses: [],
      veggies: [],
      meats: [],
    },
  });
  const [inventoryDrafts, setInventoryDrafts] = useState({});
  const [newInventoryItem, setNewInventoryItem] = useState(EMPTY_INVENTORY_ITEM);
  const [submitting, setSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(getPageFromLocation);

  const featuredPizzas = pizzas.filter((pizza) => pizza.isFeatured).slice(0, 3);
  const visiblePizzas =
    filter === 'All' ? pizzas : pizzas.filter((pizza) => pizza.category === filter);
  const cartSummary = calculateCartSummary(cart);
  const customPrice = buildCustomPrice(builder);
  const inventoryGroups = groupInventoryRows(adminData.inventory);
  const isAccountPage = currentPage === 'account';
  const homeHref = buildPageUrl('home');
  const accountHref = buildPageUrl('account', '#account');

  useEffect(() => {
    document.title = isAccountPage ? 'Pizza Delivery | Account Center' : 'Pizza Delivery';
  }, [isAccountPage]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    localStorage.setItem('pizza-delivery-cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (session) {
      localStorage.setItem('pizza-delivery-session', JSON.stringify(session));
    } else {
      localStorage.removeItem('pizza-delivery-session');
    }
  }, [session]);

  useEffect(() => {
    loadPublicData();
  }, []);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    refreshSession();

    if (session.role === 'user') {
      loadUserOrders();
      const timer = setInterval(loadUserOrders, 15000);
      return () => clearInterval(timer);
    }

    if (session.role === 'admin') {
      loadAdminDashboard();
      const timer = setInterval(loadAdminDashboard, 15000);
      return () => clearInterval(timer);
    }

    return undefined;
  }, [session && session.token, session && session.role]);

  useEffect(() => {
    if (session && session.role === 'user') {
      setDelivery((current) => ({
        ...current,
        phone: current.phone || session.phoneNumber || '',
        address: current.address || session.address || '',
      }));
    }
  }, [session]);

  async function apiFetch(endpoint, options = {}) {
    const response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong.');
    }

    return data;
  }

  async function loadPublicData() {
    try {
      setLoading(true);
      const [configData, pizzaData, builderData] = await Promise.all([
        apiFetch('/api/config'),
        apiFetch('/api/pizzas'),
        apiFetch('/api/builder-options'),
      ]);

      setConfig(configData);
      setPizzas(Array.isArray(pizzaData) ? pizzaData : []);
      setBuilderOptions({
        base: builderData.base || DEFAULT_BUILDER_OPTIONS.base,
        sauce: builderData.sauce || DEFAULT_BUILDER_OPTIONS.sauce,
        cheese: builderData.cheese || DEFAULT_BUILDER_OPTIONS.cheese,
        veggies: builderData.veggies || DEFAULT_BUILDER_OPTIONS.veggies,
        meats: builderData.meats || DEFAULT_BUILDER_OPTIONS.meats,
      });
      setBuilder((current) => ({
        ...current,
        base: builderData.base && builderData.base[0] ? current.base : DEFAULT_BUILDER.base,
      }));
    } catch (error) {
      setPageNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSession() {
    if (!session) {
      return;
    }

    try {
      const data = await apiFetch('/api/auth/me', { token: session.token });
      setSession((current) => ({
        ...current,
        ...data.account,
      }));
    } catch (_error) {
      setSession(null);
      setPageNotice('Your session expired. Please log in again.');
    }
  }

  async function loadUserOrders() {
    if (!session || session.role !== 'user') {
      return;
    }

    try {
      const orders = await apiFetch('/api/orders/my', {
        token: session.token,
      });
      setMyOrders(Array.isArray(orders) ? orders : []);
    } catch (error) {
      setPageNotice(error.message);
    }
  }

  async function loadAdminDashboard() {
    if (!session || session.role !== 'admin') {
      return;
    }

    try {
      setAdminLoading(true);
      const dashboard = await apiFetch('/api/admin/dashboard', {
        token: session.token,
      });

      setAdminData(dashboard);
      const drafts = {};
      groupInventoryRows(dashboard.inventory).forEach((group) => {
        group.items.forEach((item) => {
          drafts[item._id] = {
            item: item.item,
            quantity: item.quantity,
            price: item.price,
            threshold: item.threshold,
          };
        });
      });
      setInventoryDrafts(drafts);
    } catch (error) {
      setAdminNotice(error.message);
    } finally {
      setAdminLoading(false);
    }
  }

  function setRole(role) {
    setAuthNotice('');
    setAuthView((current) => ({
      role,
      mode: current.mode,
    }));
  }

  function setMode(mode) {
    setAuthNotice('');
    setAuthView((current) => ({
      role: current.role,
      mode,
    }));
  }

  function updateLoginField(field, value) {
    setLoginForm((current) => ({ ...current, [field]: value }));
  }

  function updateRegisterField(field, value) {
    setRegisterForm((current) => ({ ...current, [field]: value }));
  }

  function updateVerifyField(field, value) {
    setVerifyForm((current) => ({ ...current, [field]: value }));
  }

  function updateForgotField(field, value) {
    setForgotForm((current) => ({ ...current, [field]: value }));
  }

  function updateResetField(field, value) {
    setResetForm((current) => ({ ...current, [field]: value }));
  }

  function logout() {
    setSession(null);
    setAuthNotice('You have been logged out.');
    setPageNotice('');
    setAdminNotice('');
  }

  function buildRolePath() {
    return authView.role === 'admin' ? '/api/admin' : '/api/users';
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthNotice('');

    try {
      const basePath = buildRolePath();
      let response;

      if (authView.mode === 'login') {
        response = await apiFetch(`${basePath}/login`, {
          method: 'POST',
          body: loginForm,
        });
        setSession(response);
        setVerifyForm({ email: response.email, code: '' });
        setDelivery((current) => ({
          ...current,
          phone: response.phoneNumber || current.phone,
          address: response.address || current.address,
        }));
        setAuthNotice(response.message);
      }

      if (authView.mode === 'register') {
        response = await apiFetch(`${basePath}/register`, {
          method: 'POST',
          body: registerForm,
        });
        setSession(response);
        setVerifyForm({ email: response.email, code: '' });
        setLoginForm({ email: response.email, password: '' });
        setAuthNotice(
          `${response.message}${response.devCode ? ` Test code: ${response.devCode}` : ''}`
        );
        setMode('verify');
      }

      if (authView.mode === 'verify') {
        response = await apiFetch(`${basePath}/verify`, {
          method: 'POST',
          body: verifyForm,
        });
        setSession(response);
        setAuthNotice(response.message);
      }

      if (authView.mode === 'forgot') {
        response = await apiFetch(`${basePath}/forgot-password`, {
          method: 'POST',
          body: forgotForm,
        });
        setResetForm((current) => ({
          ...current,
          email: forgotForm.email,
        }));
        setAuthNotice(
          `${response.message}${response.devCode ? ` Test code: ${response.devCode}` : ''}`
        );
        setMode('reset');
      }

      if (authView.mode === 'reset') {
        response = await apiFetch(`${basePath}/reset-password`, {
          method: 'POST',
          body: resetForm,
        });
        setSession(response);
        setAuthNotice(response.message);
        setMode('login');
      }
    } catch (error) {
      setAuthNotice(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  function scrollToSection(hash) {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const target = document.getElementById(hash.replace('#', ''));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function navigateToPage(page, hash = '') {
    window.history.pushState({}, '', buildPageUrl(page, hash));
    setCurrentPage(page);
    window.setTimeout(() => scrollToSection(hash), 60);
  }

  function handlePageLink(event, page, hash = '') {
    event.preventDefault();
    navigateToPage(page, hash);
  }

  function canOrder() {
    if (!session) {
      setPageNotice('Login as a user account to add pizzas and place orders.');
      setAuthView({ role: 'user', mode: 'login' });
      navigateToPage('account', '#account');
      return false;
    }

    if (session.role !== 'user') {
      setPageNotice('Switch to a user account to place an order.');
      navigateToPage('account', '#account');
      return false;
    }

    if (!session.isVerified) {
      setPageNotice('Verify your email before placing an order.');
      setAuthView({ role: 'user', mode: 'verify' });
      setVerifyForm((current) => ({
        ...current,
        email: session.email,
      }));
      navigateToPage('account', '#account');
      return false;
    }

    return true;
  }

  function addToCart(item) {
    setSuccess(null);
    setPageNotice('');
    setCart((currentCart) => {
      const matchIndex = currentCart.findIndex(
        (cartItem) =>
          cartItem.slug === item.slug &&
          cartItem.name === item.name &&
          cartItem.size === item.size &&
          JSON.stringify(cartItem.recipe || {}) === JSON.stringify(item.recipe || {})
      );

      if (matchIndex === -1) {
        return [...currentCart, { ...item, quantity: 1 }];
      }

      return currentCart.map((cartItem, index) =>
        index === matchIndex
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      );
    });
  }

  function addMenuPizza(pizza) {
    if (!canOrder()) {
      return;
    }

    addToCart({
      id: pizza.slug,
      slug: pizza.slug,
      name: pizza.name,
      size: 'Medium',
      price: pizza.price,
      recipe: pizza.recipe,
      isCustom: false,
    });
  }

  function changeQuantity(index, delta) {
    setCart((currentCart) =>
      currentCart
        .map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, quantity: Math.max(0, Number(item.quantity) + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
    setSuccess(null);
  }

  function removeFromCart(index) {
    setCart((currentCart) => currentCart.filter((_, itemIndex) => itemIndex !== index));
    setSuccess(null);
  }

  function toggleBuilderValue(type, value) {
    setBuilder((current) => {
      const currentValues = current[type];
      const exists = currentValues.includes(value);
      return {
        ...current,
        [type]: exists
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  }

  function addCustomPizza() {
    if (!canOrder()) {
      return;
    }

    addToCart({
      id: `custom-${Date.now()}`,
      slug: '',
      name: builder.name.trim() || 'House Special',
      size: builder.size,
      price: customPrice,
      recipe: {
        base: builder.base,
        sauce: builder.sauce,
        cheese: builder.cheese,
        veggies: builder.veggies,
        meats: builder.meats,
      },
      isCustom: true,
    });
  }

  function updateDeliveryField(field, value) {
    setDelivery((current) => ({ ...current, [field]: value }));
  }

  function buildOrderItemsPayload() {
    return cart.map((item) =>
      item.slug
        ? {
            slug: item.slug,
            size: item.size,
            quantity: item.quantity,
          }
        : {
            id: item.id,
            name: item.name,
            size: item.size,
            quantity: item.quantity,
            recipe: item.recipe,
          }
    );
  }

  function buildOrderPayload(payment) {
    return {
      items: buildOrderItemsPayload(),
      deliveryAddress: {
        phone: delivery.phone,
        address: delivery.address,
        city: delivery.city,
        postalCode: delivery.postalCode,
        country: delivery.country,
      },
      notes: delivery.notes,
      payment,
    };
  }

  async function finalizeOrder(payment) {
    const response = await apiFetch('/api/orders', {
      method: 'POST',
      token: session.token,
      body: buildOrderPayload(payment),
    });

    setSuccess({
      orderId: response.order._id,
      total: response.summary.total,
      paymentStatus: response.order.payment.status,
    });
    setCart([]);
    setPageNotice(response.message);
    await loadUserOrders();
    if (session.role === 'admin') {
      await loadAdminDashboard();
    }
  }

  async function handleCheckout(event) {
    event.preventDefault();

    if (!canOrder()) {
      return;
    }

    if (cart.length === 0) {
      setPageNotice('Your cart is empty.');
      return;
    }

    if (
      !delivery.phone ||
      !delivery.address ||
      !delivery.city ||
      !delivery.postalCode ||
      !delivery.country
    ) {
      setPageNotice('Complete all delivery fields before checkout.');
      return;
    }

    setSubmitting(true);
    setPageNotice('');
    setSuccess(null);

    try {
      if (paymentMethod === 'razorpay') {
        if (!config.razorpayEnabled || !window.Razorpay) {
          throw new Error('Razorpay is not configured on this server yet.');
        }

        const checkout = await apiFetch('/api/orders/checkout', {
          method: 'POST',
          token: session.token,
          body: {
            items: buildOrderItemsPayload(),
          },
        });

        const razorpay = new window.Razorpay({
          key: checkout.keyId,
          amount: checkout.amount,
          currency: checkout.currency,
          name: config.appName,
          description: 'Pizza Order Payment',
          order_id: checkout.orderId,
          prefill: {
            name: session.name,
            email: session.email,
            contact: delivery.phone,
          },
          theme: {
            color: '#a2261d',
          },
          handler: async (response) => {
            try {
              await finalizeOrder({
                method: 'razorpay',
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
            } catch (error) {
              setPageNotice(error.message);
            } finally {
              setSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              setSubmitting(false);
            },
          },
        });

        razorpay.open();
        return;
      }

      await finalizeOrder({
        method: 'cod',
      });
    } catch (error) {
      setPageNotice(error.message);
    } finally {
      if (paymentMethod !== 'razorpay') {
        setSubmitting(false);
      }
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      setAdminNotice('');
      await apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        token: session.token,
        body: { status },
      });
      await loadAdminDashboard();
    } catch (error) {
      setAdminNotice(error.message);
    }
  }

  function updateInventoryDraft(id, field, value) {
    setInventoryDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  async function saveInventoryDraft(id) {
    try {
      setAdminNotice('');
      await apiFetch(`/api/admin/inventory/${id}`, {
        method: 'PUT',
        token: session.token,
        body: inventoryDrafts[id],
      });
      await loadAdminDashboard();
    } catch (error) {
      setAdminNotice(error.message);
    }
  }

  async function createInventoryItem(event) {
    event.preventDefault();
    try {
      setAdminNotice('');
      await apiFetch('/api/admin/inventory', {
        method: 'POST',
        token: session.token,
        body: newInventoryItem,
      });
      setNewInventoryItem(EMPTY_INVENTORY_ITEM);
      await loadAdminDashboard();
    } catch (error) {
      setAdminNotice(error.message);
    }
  }

  async function toggleApproval(account) {
    try {
      setAdminNotice('');
      await apiFetch(`/api/admin/accounts/${account._id}`, {
        method: 'PUT',
        token: session.token,
        body: { isApproved: !account.isApproved },
      });
      await loadAdminDashboard();
    } catch (error) {
      setAdminNotice(error.message);
    }
  }

  const userDeliveredCount = myOrders.filter((order) => order.status === 'Delivered').length;
  const userOpenCount = myOrders.filter((order) => order.status !== 'Delivered').length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">FR</div>
          <div className="brand-copy">
            <strong>Pizza Delivery</strong>
            <span>Pizza delivery application</span>
          </div>
        </div>
        <nav className="nav-links">
          <a href={homeHref} onClick={(event) => handlePageLink(event, 'home')}>
            Home
          </a>
          {!isAccountPage ? (
            <>
              <a href="#featured">Featured</a>
              <a href="#menu">Menu</a>
              <a href="#builder">Custom Pizza</a>
              <a href="#checkout">Checkout</a>
            </>
          ) : (
            <a href={accountHref} onClick={(event) => handlePageLink(event, 'account', '#account')}>
              Dashboard
            </a>
          )}
          <a
            href={accountHref}
            onClick={(event) => handlePageLink(event, 'account', '#account')}
          >
            Account
          </a>
        </nav>
      </header>

      {isAccountPage ? (
        <section className="section account-page-intro fade-up">
          <div className="account-page-panel">
            <div className="account-page-copy">
              <p className="poster-kicker account-kicker">Pizza Delivery</p>
              <h1 className="account-page-title">Account Center</h1>
              <p className="section-subtitle">
                Keep user and admin access, email verification, password recovery, live order
                tracking, and stock controls together on one dedicated page.
              </p>
              <div className="hero-actions">
                <a
                  className="button button-primary"
                  href={homeHref}
                  onClick={(event) => handlePageLink(event, 'home')}
                >
                  Back to Storefront
                </a>
                <a
                  className="button button-secondary account-page-button"
                  href={accountHref}
                  onClick={(event) => handlePageLink(event, 'account', '#account')}
                >
                  Open Dashboard
                </a>
              </div>
            </div>

            <div className="dashboard-metrics account-page-metrics">
              <div className="metric-card">
                <strong>{pizzas.length}</strong>
                <span>available pizza varieties</span>
              </div>
              <div className="metric-card">
                <strong>{session ? session.role : 'guest'}</strong>
                <span>current access mode</span>
              </div>
              <div className="metric-card">
                <strong>{config.razorpayEnabled ? 'On' : 'Off'}</strong>
                <span>Razorpay test checkout</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="hero-shell fade-up">
          <div className="poster-panel">
            <div>
              <p className="poster-kicker">Pizza Delivery</p>
              <h1>PIZZA DELIVERY APPLICATION</h1>
              <p className="poster-copy">
                Freshly baked classics, custom creations, and a cleaner ordering flow built
                to feel more like a real pizzeria storefront.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#menu">
                  Explore Menu
                </a>
                <a
                  className="button button-secondary"
                  href={accountHref}
                  onClick={(event) => handlePageLink(event, 'account', '#account')}
                >
                  Open Account Center
                </a>
              </div>
            </div>

            <div>
              <div className="stats-grid">
                <div className="stat-card">
                  <strong>{pizzas.length || 6}</strong>
                  <span>oven favorites</span>
                </div>
                <div className="stat-card">
                  <strong>{cartSummary.itemCount}</strong>
                  <span>items in cart</span>
                </div>
                <div className="stat-card">
                  <strong>{formatCurrency(cartSummary.total || 249)}</strong>
                  <span>current total</span>
                </div>
              </div>

              <div className="poster-photo-card">
                <img
                  src="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80"
                  alt="Freshly baked pizza"
                />
                <div>
                  <h3 className="poster-card-title">House Favorite</h3>
                  <p className="poster-card-copy">
                    Thin crust, bright tomato sauce, bubbling mozzarella, and basil straight
                    from the oven.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="showcase-panel">
            <span className="showcase-badge">Today&apos;s kitchen board</span>
            <h2>Made fresh and ready to order.</h2>
            <p className="showcase-copy">
              User and admin logins, verification, password reset, inventory control, order
              tracking, and Razorpay test checkout now live inside the same storefront.
            </p>

            <div className="showcase-image-wrap">
              <img
                src="https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?auto=format&fit=crop&w=1200&q=80"
                alt="Cheese pizza served hot"
              />
            </div>

            <div className="showcase-feature-grid">
              <article className="showcase-feature-card">
                <h3>Customer Flow</h3>
                <p>
                  Register, verify your email, place orders, and watch status updates in the
                  dashboard.
                </p>
              </article>
              <article className="showcase-feature-card">
                <h3>Admin Control</h3>
                <p>
                  Track orders, edit stock, approve accounts, and keep inventory healthy from one
                  panel.
                </p>
              </article>
            </div>
          </div>
        </section>
      )}

      {isAccountPage ? (
        <section className="section account-section account-page-shell" id="account">
        <div className="section-heading">
          <div>
            <h2 className="section-title">Account Center</h2>
            <p className="section-subtitle">
              Sign in as a user or admin, verify accounts, recover passwords, and access your dashboard.
            </p>
          </div>
        </div>

        {pageNotice ? <div className="status-banner light-banner">{pageNotice}</div> : null}

        <div className="account-layout">
          <div className="auth-card">
            <div className="segment-group">
              <button
                className={`segment-button ${authView.role === 'user' ? 'active' : ''}`}
                onClick={() => setRole('user')}
                type="button"
              >
                User
              </button>
              <button
                className={`segment-button ${authView.role === 'admin' ? 'active' : ''}`}
                onClick={() => setRole('admin')}
                type="button"
              >
                Admin
              </button>
            </div>

            <div className="segment-group compact">
              {['login', 'register', 'verify', 'forgot', 'reset'].map((mode) => (
                <button
                  key={mode}
                  className={`segment-button ${authView.mode === mode ? 'active' : ''}`}
                  onClick={() => setMode(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>

            {session && session.role === authView.role ? (
              <div className="session-card">
                <div className="session-heading">
                  <div>
                    <h3>{session.name}</h3>
                    <p>{session.email}</p>
                  </div>
                  <button className="button button-secondary invert" onClick={logout} type="button">
                    Logout
                  </button>
                </div>

                <div className="badge-row">
                  <span className="mini-badge">{session.role}</span>
                  <span className="mini-badge">
                    {session.isVerified ? 'verified' : 'verification pending'}
                  </span>
                  {session.role === 'admin' ? (
                    <span className="mini-badge">
                      {session.isApproved ? 'approved' : 'approval pending'}
                    </span>
                  ) : null}
                </div>

                {!session.isVerified ? (
                  <div className="status-banner">
                    Verify your email to unlock ordering and protected features.
                  </div>
                ) : null}

                <p className="auth-helper">
                  {config.emailMode === 'log'
                    ? 'Email is running in local log mode. Test codes are shown in API responses.'
                    : 'Email is configured through SMTP and verification codes are sent to inboxes.'}
                </p>
              </div>
            ) : null}

            {(!session || session.role !== authView.role || authView.mode !== 'login') ? (
              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {authView.mode === 'login' ? (
                  <>
                    <label className="form-field">
                      <span className="field-label">Email</span>
                      <input
                        className="field-input"
                        value={loginForm.email}
                        onChange={(event) => updateLoginField('email', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Password</span>
                      <input
                        className="field-input"
                        type="password"
                        value={loginForm.password}
                        onChange={(event) => updateLoginField('password', event.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {authView.mode === 'register' ? (
                  <>
                    <label className="form-field">
                      <span className="field-label">Name</span>
                      <input
                        className="field-input"
                        value={registerForm.name}
                        onChange={(event) => updateRegisterField('name', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Email</span>
                      <input
                        className="field-input"
                        value={registerForm.email}
                        onChange={(event) => updateRegisterField('email', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Password</span>
                      <input
                        className="field-input"
                        type="password"
                        value={registerForm.password}
                        onChange={(event) => updateRegisterField('password', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Confirm Password</span>
                      <input
                        className="field-input"
                        type="password"
                        value={registerForm.confirmPassword}
                        onChange={(event) =>
                          updateRegisterField('confirmPassword', event.target.value)
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Phone</span>
                      <input
                        className="field-input"
                        value={registerForm.phoneNumber}
                        onChange={(event) =>
                          updateRegisterField('phoneNumber', event.target.value)
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Address</span>
                      <input
                        className="field-input"
                        value={registerForm.address}
                        onChange={(event) => updateRegisterField('address', event.target.value)}
                      />
                    </label>
                    {authView.role === 'admin' ? (
                      <label className="form-field">
                        <span className="field-label">Admin Invite Code</span>
                        <input
                          className="field-input"
                          value={registerForm.inviteCode}
                          onChange={(event) =>
                            updateRegisterField('inviteCode', event.target.value)
                          }
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}

                {authView.mode === 'verify' ? (
                  <>
                    <label className="form-field">
                      <span className="field-label">Email</span>
                      <input
                        className="field-input"
                        value={verifyForm.email}
                        onChange={(event) => updateVerifyField('email', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Verification Code</span>
                      <input
                        className="field-input"
                        value={verifyForm.code}
                        onChange={(event) => updateVerifyField('code', event.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {authView.mode === 'forgot' ? (
                  <label className="form-field">
                    <span className="field-label">Email</span>
                    <input
                      className="field-input"
                      value={forgotForm.email}
                      onChange={(event) => updateForgotField('email', event.target.value)}
                    />
                  </label>
                ) : null}

                {authView.mode === 'reset' ? (
                  <>
                    <label className="form-field">
                      <span className="field-label">Email</span>
                      <input
                        className="field-input"
                        value={resetForm.email}
                        onChange={(event) => updateResetField('email', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Reset Code</span>
                      <input
                        className="field-input"
                        value={resetForm.code}
                        onChange={(event) => updateResetField('code', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">New Password</span>
                      <input
                        className="field-input"
                        type="password"
                        value={resetForm.newPassword}
                        onChange={(event) => updateResetField('newPassword', event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="field-label">Confirm Password</span>
                      <input
                        className="field-input"
                        type="password"
                        value={resetForm.confirmPassword}
                        onChange={(event) =>
                          updateResetField('confirmPassword', event.target.value)
                        }
                      />
                    </label>
                  </>
                ) : null}

                {authNotice ? <div className="status-banner">{authNotice}</div> : null}

                <button className="button button-accent wide" disabled={authSubmitting} type="submit">
                  {authSubmitting ? 'Submitting...' : `Submit ${authView.mode}`}
                </button>
              </form>
            ) : null}
          </div>

          <div className="dashboard-card">
            {!session ? (
              <div className="dashboard-empty">
                <h3>Sign in to unlock the full flow</h3>
                <p>
                  Users can register, verify email, customize pizzas, pay with Razorpay test mode,
                  and watch order status changes in their dashboard. Admins can manage stock and orders.
                </p>
                <div className="dashboard-metrics">
                  <div className="metric-card">
                    <strong>{pizzas.length}</strong>
                    <span>available pizza varieties</span>
                  </div>
                  <div className="metric-card">
                    <strong>{config.razorpayEnabled ? 'On' : 'Off'}</strong>
                    <span>Razorpay test mode</span>
                  </div>
                  <div className="metric-card">
                    <strong>{config.emailMode}</strong>
                    <span>verification delivery mode</span>
                  </div>
                </div>
              </div>
            ) : null}

            {session && session.role === 'user' ? (
              <div className="dashboard-stack">
                <div className="dashboard-header">
                  <div>
                    <h3>User Dashboard</h3>
                    <p>Track your orders and keep an eye on what is available in the kitchen.</p>
                  </div>
                  <div className="badge-row">
                    <span className="mini-badge">{session.isVerified ? 'verified' : 'verify email'}</span>
                    <span className="mini-badge">{myOrders.length} orders</span>
                  </div>
                </div>

                <div className="dashboard-metrics">
                  <div className="metric-card">
                    <strong>{pizzas.length}</strong>
                    <span>available pizzas</span>
                  </div>
                  <div className="metric-card">
                    <strong>{userOpenCount}</strong>
                    <span>active orders</span>
                  </div>
                  <div className="metric-card">
                    <strong>{userDeliveredCount}</strong>
                    <span>delivered orders</span>
                  </div>
                </div>

                <div className="order-history">
                  <h4>Available Pizza Varieties</h4>
                  <div className="mini-pizza-grid">
                    {pizzas.map((pizza) => (
                      <article className="mini-pizza-card" key={pizza.slug}>
                        <img src={pizza.image} alt={pizza.name} />
                        <div>
                          <strong>{pizza.name}</strong>
                          <span>{formatCurrency(pizza.price)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="order-history">
                  <h4>Order History</h4>
                  {myOrders.length === 0 ? (
                    <p className="auth-helper">Your orders will appear here after checkout.</p>
                  ) : (
                    myOrders.map((order) => (
                      <div className="order-card" key={order._id}>
                        <div className="order-card-top">
                          <div>
                            <strong>{order._id}</strong>
                            <span>{formatDate(order.createdAt)}</span>
                          </div>
                          <span className={statusClassName(order.status)}>{order.status}</span>
                        </div>
                        <div className="order-card-body">
                          <span>{order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</span>
                          <strong>{formatCurrency(order.total)}</strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {session && session.role === 'admin' ? (
              <div className="dashboard-stack">
                <div className="dashboard-header">
                  <div>
                    <h3>Admin Dashboard</h3>
                    <p>Manage orders, inventory thresholds, and account approvals from one place.</p>
                  </div>
                  {adminLoading ? <span className="mini-badge">refreshing</span> : null}
                </div>

                {adminNotice ? <div className="status-banner">{adminNotice}</div> : null}

                <div className="dashboard-metrics">
                  <div className="metric-card">
                    <strong>{adminData.stats ? adminData.stats.totalOrders : 0}</strong>
                    <span>total orders</span>
                  </div>
                  <div className="metric-card">
                    <strong>{adminData.stats ? adminData.stats.totalUsers : 0}</strong>
                    <span>users</span>
                  </div>
                  <div className="metric-card">
                    <strong>{adminData.stats ? adminData.stats.lowStockCount : 0}</strong>
                    <span>low stock items</span>
                  </div>
                </div>

                <div className="admin-panel">
                  <h4>Order Status Control</h4>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>User</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th>Update</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminData.orders.map((order) => (
                          <tr key={order._id}>
                            <td>{order._id}</td>
                            <td>{order.userSnapshot && order.userSnapshot.name}</td>
                            <td>{formatCurrency(order.total)}</td>
                            <td>
                              <select
                                className="table-select"
                                value={order.status}
                                onChange={(event) =>
                                  setAdminData((current) => ({
                                    ...current,
                                    orders: current.orders.map((item) =>
                                      item._id === order._id
                                        ? { ...item, status: event.target.value }
                                        : item
                                    ),
                                  }))
                                }
                              >
                                {ORDER_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <button
                                className="button button-secondary small"
                                type="button"
                                onClick={() => updateOrderStatus(order._id, order.status)}
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="admin-panel">
                  <h4>Inventory Management</h4>
                  <form className="inventory-create-form" onSubmit={createInventoryItem}>
                    <select
                      className="field-select"
                      value={newInventoryItem.category}
                      onChange={(event) =>
                        setNewInventoryItem((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    >
                      <option value="base">base</option>
                      <option value="sauce">sauce</option>
                      <option value="cheese">cheese</option>
                      <option value="veggie">veggie</option>
                      <option value="meat">meat</option>
                    </select>
                    <input
                      className="field-input"
                      placeholder="Item name"
                      value={newInventoryItem.item}
                      onChange={(event) =>
                        setNewInventoryItem((current) => ({
                          ...current,
                          item: event.target.value,
                        }))
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Qty"
                      type="number"
                      value={newInventoryItem.quantity}
                      onChange={(event) =>
                        setNewInventoryItem((current) => ({
                          ...current,
                          quantity: event.target.value,
                        }))
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Price"
                      type="number"
                      value={newInventoryItem.price}
                      onChange={(event) =>
                        setNewInventoryItem((current) => ({
                          ...current,
                          price: event.target.value,
                        }))
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Threshold"
                      type="number"
                      value={newInventoryItem.threshold}
                      onChange={(event) =>
                        setNewInventoryItem((current) => ({
                          ...current,
                          threshold: event.target.value,
                        }))
                      }
                    />
                    <button className="button button-accent small" type="submit">
                      Add Item
                    </button>
                  </form>

                  {inventoryGroups.map((group) => (
                    <div className="inventory-group" key={group.key}>
                      <h5>{group.label}</h5>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Threshold</th>
                              <th>Save</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item) => (
                              <tr key={item._id}>
                                <td>
                                  <input
                                    className="table-input"
                                    value={inventoryDrafts[item._id] ? inventoryDrafts[item._id].item : item.item}
                                    onChange={(event) =>
                                      updateInventoryDraft(item._id, 'item', event.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    className="table-input"
                                    type="number"
                                    value={
                                      inventoryDrafts[item._id]
                                        ? inventoryDrafts[item._id].quantity
                                        : item.quantity
                                    }
                                    onChange={(event) =>
                                      updateInventoryDraft(item._id, 'quantity', event.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    className="table-input"
                                    type="number"
                                    value={
                                      inventoryDrafts[item._id]
                                        ? inventoryDrafts[item._id].price
                                        : item.price
                                    }
                                    onChange={(event) =>
                                      updateInventoryDraft(item._id, 'price', event.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    className="table-input"
                                    type="number"
                                    value={
                                      inventoryDrafts[item._id]
                                        ? inventoryDrafts[item._id].threshold
                                        : item.threshold
                                    }
                                    onChange={(event) =>
                                      updateInventoryDraft(item._id, 'threshold', event.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <button
                                    className="button button-secondary small"
                                    type="button"
                                    onClick={() => saveInventoryDraft(item._id)}
                                  >
                                    Save
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="admin-panel">
                  <h4>Account Review</h4>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Verified</th>
                          <th>Approved</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(adminData.users || []), ...(adminData.admins || [])].map((account) => (
                          <tr key={account._id}>
                            <td>{account.name}</td>
                            <td>{account.email}</td>
                            <td>{account.role}</td>
                            <td>{account.isVerified ? 'Yes' : 'No'}</td>
                            <td>{account.isApproved ? 'Yes' : 'No'}</td>
                            <td>
                              {account.role === 'admin' ? (
                                <button
                                  className="button button-secondary small"
                                  type="button"
                                  onClick={() => toggleApproval(account)}
                                >
                                  {account.isApproved ? 'Revoke' : 'Approve'}
                                </button>
                              ) : (
                                <span className="mini-badge">user</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      ) : null}

      {!isAccountPage ? (
        <>
      <section className="section" id="featured">
        <div className="section-heading">
          <div>
            <h2 className="section-title">Featured Pizzas</h2>
            <p className="section-subtitle">
              House signatures designed to feel a little more premium and restaurant-like.
            </p>
          </div>
        </div>
        <div className="card-grid">
          {(featuredPizzas.length ? featuredPizzas : pizzas.slice(0, 3)).map((pizza) => (
            <article className="pizza-card fade-up" key={pizza.slug}>
              <img src={pizza.image} alt={pizza.name} />
              <div className="card-body">
                <div className="tag-row">
                  <span className="tag">{pizza.category}</span>
                  <span className="tag">{pizza.isVegetarian ? 'Vegetarian' : 'Non-Veg'}</span>
                  <span className="tag">{pizza.rating} rating</span>
                </div>
                <h3 className="card-title">{pizza.name}</h3>
                <p className="card-copy">{pizza.description}</p>
                <div className="ingredient-list">
                  {(pizza.ingredients || []).map((ingredient) => (
                    <span key={ingredient}>{ingredient}</span>
                  ))}
                </div>
                <div className="price-row">
                  <strong className="price">{formatCurrency(pizza.price)}</strong>
                  <button className="button button-accent" onClick={() => addMenuPizza(pizza)}>
                    Add to Cart
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section content-layout" id="menu">
        <div>
          <div className="section-heading">
            <div>
              <h2 className="section-title">Menu</h2>
              <p className="section-subtitle">
                Filter the collection and move straight from browsing to ordering.
              </p>
            </div>
          </div>

          {pageNotice ? <div className="status-banner light-banner">{pageNotice}</div> : null}

          <div className="filter-row">
            {['All', 'Classic', 'Veggie', 'Special'].map((option) => (
              <button
                key={option}
                className={`button filter-chip ${filter === option ? 'active' : ''}`}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="sidebar-card">
              <p>Loading menu...</p>
            </div>
          ) : (
            <div className="card-grid">
              {visiblePizzas.map((pizza) => (
                <article className="pizza-card" key={pizza.slug}>
                  <img src={pizza.image} alt={pizza.name} />
                  <div className="card-body">
                    <div className="tag-row">
                      <span className="tag">{pizza.category}</span>
                      <span className="tag">{pizza.isVegetarian ? 'Vegetarian' : 'Non-Veg'}</span>
                    </div>
                    <h3 className="card-title">{pizza.name}</h3>
                    <p className="card-copy">{pizza.description}</p>
                    <div className="price-row">
                      <strong className="price">{formatCurrency(pizza.price)}</strong>
                      <button className="button button-accent" onClick={() => addMenuPizza(pizza)}>
                        Add
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <section className="builder-card builder-section" id="builder">
            <h3>Custom Pizza Builder</h3>
            <p>Choose your base, sauce, cheese, veggies, and meats before sending it to the cart.</p>
            <div className="builder-grid">
              <label className="form-field full">
                <span className="field-label">Pizza Name</span>
                <input
                  className="field-input"
                  value={builder.name}
                  onChange={(event) =>
                    setBuilder((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label className="form-field">
                <span className="field-label">Size</span>
                <select
                  className="field-select"
                  value={builder.size}
                  onChange={(event) =>
                    setBuilder((current) => ({ ...current, size: event.target.value }))
                  }
                >
                  {Object.keys(SIZE_PRICES).map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="field-label">Base</span>
                <select
                  className="field-select"
                  value={builder.base}
                  onChange={(event) =>
                    setBuilder((current) => ({ ...current, base: event.target.value }))
                  }
                >
                  {builderOptions.base.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="field-label">Sauce</span>
                <select
                  className="field-select"
                  value={builder.sauce}
                  onChange={(event) =>
                    setBuilder((current) => ({ ...current, sauce: event.target.value }))
                  }
                >
                  {builderOptions.sauce.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="field-label">Cheese</span>
                <select
                  className="field-select"
                  value={builder.cheese}
                  onChange={(event) =>
                    setBuilder((current) => ({ ...current, cheese: event.target.value }))
                  }
                >
                  {builderOptions.cheese.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-field full">
                <span className="field-label">Veggies</span>
                <div className="checkbox-grid">
                  {builderOptions.veggies.map((veggie) => (
                    <label className="check-pill" key={veggie}>
                      <input
                        type="checkbox"
                        checked={builder.veggies.includes(veggie)}
                        onChange={() => toggleBuilderValue('veggies', veggie)}
                      />
                      <span>{veggie}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-field full">
                <span className="field-label">Meats</span>
                <div className="checkbox-grid">
                  {builderOptions.meats.map((meat) => (
                    <label className="check-pill" key={meat}>
                      <input
                        type="checkbox"
                        checked={builder.meats.includes(meat)}
                        onChange={() => toggleBuilderValue('meats', meat)}
                      />
                      <span>{meat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="builder-preview">
              <strong>{builder.name || 'House Special'}</strong>
              <p>
                {builder.size}, {builder.base}, {builder.sauce}, {builder.cheese},{' '}
                {builder.veggies.join(', ') || 'no veggies'},{' '}
                {builder.meats.join(', ') || 'no meats'}.
              </p>
              <div className="price-row">
                <strong className="price">{formatCurrency(customPrice)}</strong>
                <button className="button button-accent" onClick={addCustomPizza}>
                  Add Custom Pizza
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="sidebar">
          <section className="sidebar-card charcoal-card order-panel" id="checkout">
            <h3>Checkout</h3>
            <p>Review the cart, choose a payment method, and place your order.</p>

            <div>
              <h4 className="order-block-title">Cart Summary</h4>
              {cart.length === 0 ? (
                <p className="empty-state">Your cart is empty. Add something from the oven.</p>
              ) : (
                <div className="cart-list">
                  {cart.map((item, index) => (
                    <div className="cart-item" key={`${item.id}-${index}`}>
                      <div className="cart-top">
                        <div className="cart-meta">
                          <strong>{item.name}</strong>
                          <span>{item.size}</span>
                        </div>
                        <strong>{formatCurrency(item.price * item.quantity)}</strong>
                      </div>
                      <div className="qty-row">
                        <button className="qty-button" onClick={() => changeQuantity(index, -1)}>
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button className="qty-button" onClick={() => changeQuantity(index, 1)}>
                          +
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={() => removeFromCart(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="summary-row">
                <span>Subtotal</span>
                <strong>{formatCurrency(cartSummary.subtotal)}</strong>
              </div>
              <div className="summary-row">
                <span>Sales Tax</span>
                <strong>{formatCurrency(cartSummary.salesTax)}</strong>
              </div>
              <div className="summary-row">
                <span>Delivery</span>
                <strong>{formatCurrency(cartSummary.deliveryCharges)}</strong>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <strong>{formatCurrency(cartSummary.total)}</strong>
              </div>
            </div>

            <div className="order-divider"></div>

            <div>
              <h4 className="order-block-title">Delivery Details</h4>
              <form className="order-form" onSubmit={handleCheckout}>
                <label className="form-field">
                  <span className="field-label">Phone</span>
                  <input
                    className="field-input"
                    value={delivery.phone}
                    onChange={(event) => updateDeliveryField('phone', event.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span className="field-label">Address</span>
                  <input
                    className="field-input"
                    value={delivery.address}
                    onChange={(event) => updateDeliveryField('address', event.target.value)}
                  />
                </label>

                <div className="checkout-grid">
                  <label className="form-field">
                    <span className="field-label">City</span>
                    <input
                      className="field-input"
                      value={delivery.city}
                      onChange={(event) => updateDeliveryField('city', event.target.value)}
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">Postal Code</span>
                    <input
                      className="field-input"
                      value={delivery.postalCode}
                      onChange={(event) => updateDeliveryField('postalCode', event.target.value)}
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span className="field-label">Country</span>
                  <input
                    className="field-input"
                    value={delivery.country}
                    onChange={(event) => updateDeliveryField('country', event.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span className="field-label">Notes</span>
                  <textarea
                    className="field-textarea"
                    value={delivery.notes}
                    onChange={(event) => updateDeliveryField('notes', event.target.value)}
                  />
                </label>

                <div className="payment-toggle">
                  <button
                    type="button"
                    className={`payment-button ${paymentMethod === 'cod' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('cod')}
                  >
                    Cash on Delivery
                  </button>
                  <button
                    type="button"
                    className={`payment-button ${paymentMethod === 'razorpay' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('razorpay')}
                    disabled={!config.razorpayEnabled}
                  >
                    Razorpay Test Mode
                  </button>
                </div>

                {success ? (
                  <div className="order-success">
                    <h3>Order Confirmed</h3>
                    <p>
                      ID: {success.orderId}
                      <br />
                      Total: {formatCurrency(success.total)}
                      <br />
                      Payment: {success.paymentStatus}
                    </p>
                  </div>
                ) : null}

                <button className="button button-accent wide" disabled={submitting} type="submit">
                  {submitting
                    ? 'Processing...'
                    : paymentMethod === 'razorpay'
                    ? 'Pay with Razorpay'
                    : 'Place Order'}
                </button>
              </form>
            </div>
          </section>
        </aside>
      </section>
        </>
      ) : null}

      <footer className="footer-note">Pizza Delivery ordering experience.</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
