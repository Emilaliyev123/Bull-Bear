import { useState, useEffect, createContext, useContext, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster, toast } from 'sonner';
import {
  TrendingUp, TrendingDown, BookOpen, Signal, Newspaper, User, LogOut,
  Menu, X, ChevronRight, Play, Lock, CheckCircle, AlertCircle, Crown,
  BarChart3, Shield, Brain, Target, DollarSign, Clock, ArrowUpRight, ArrowDownRight,
  Settings, Users, PlusCircle, Trash2, Edit, Eye, EyeOff, Upload, FileText,
  Video, Package, Sparkles, Mail, MessageCircle, HelpCircle, Bell, Download, ExternalLink, Loader2
} from "lucide-react";

// Support Email
const SUPPORT_EMAIL = "bullbearacademy.su@gmail.com";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to get full media URL (handles both relative and absolute URLs)
const getMediaUrl = (url) => {
  if (!url) return '';
  // If it's already a full URL (http/https), check if it needs conversion
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Check if it's a relative path stored with old preview URL - extract just the path
    if (url.includes('/uploads/')) {
      let uploadPath = url.substring(url.indexOf('/uploads/'));
      // Ensure path has /api prefix for proper routing
      if (!uploadPath.startsWith('/api/uploads/')) {
        uploadPath = '/api' + uploadPath;
      }
      return `${BACKEND_URL}${uploadPath}`;
    }
    return url;
  }
  // If it's a relative URL starting with /, prepend BACKEND_URL
  if (url.startsWith('/')) {
    // Ensure path has /api prefix for proper routing
    if (url.startsWith('/uploads/')) {
      return `${BACKEND_URL}/api${url}`;
    }
    return `${BACKEND_URL}${url}`;
  }
  return url;
};

// Push Notification Helper
const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      
      // Register service worker
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration);
          
          // Check if already subscribed
          registration.pushManager.getSubscription().then(subscription => {
            setIsSubscribed(!!subscription);
          });
        })
        .catch(err => console.error('Service Worker registration failed:', err));
    }
  }, []);

  const requestPermission = async () => {
    if (!isSupported) return false;
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (err) {
      console.error('Permission request failed:', err);
      return false;
    }
  };

  const subscribe = async () => {
    if (!isSupported || permission !== 'granted') return null;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          // This is a placeholder VAPID key - in production, generate your own
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
        )
      });
      
      setIsSubscribed(true);
      console.log('Push subscription:', subscription);
      return subscription;
    } catch (err) {
      console.error('Subscription failed:', err);
      return null;
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        setIsSubscribed(false);
      }
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    }
  };

  return { isSupported, isSubscribed, permission, requestPermission, subscribe, unsubscribe };
};

// Helper function for VAPID key conversion
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Auth Context
const AuthContext = createContext(null);

const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bb_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data);
    } catch (e) {
      localStorage.removeItem('bb_token');
      setToken(null);
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem('bb_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (name, email, password) => {
    const res = await axios.post(`${API}/auth/register`, { name, email, password });
    localStorage.setItem('bb_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('bb_token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = () => fetchUser();

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// API helper
const api = {
  get: (url, token) => axios.get(`${API}${url}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  post: (url, data, token) => axios.post(`${API}${url}`, data, token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  put: (url, data, token) => axios.put(`${API}${url}`, data, token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  delete: (url, token) => axios.delete(`${API}${url}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
};

// =============== COMPONENTS ===============

const GoldButton = ({ children, onClick, className = "", variant = "primary", disabled = false, type = "button", ...props }) => {
  const baseClasses = "font-semibold px-6 py-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/25",
    secondary: "bg-transparent border-2 border-amber-500 text-amber-500 hover:bg-amber-500/10",
    danger: "bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400"
  };
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      type={type}
      className={`${baseClasses} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
};

const Card3D = ({ children, className = "", onClick }) => (
  <motion.div
    whileHover={{ rotateX: 2, rotateY: 2, scale: 1.02 }}
    transition={{ type: "spring", stiffness: 300 }}
    onClick={onClick}
    className={`bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    style={{ transformStyle: "preserve-3d" }}
  >
    {children}
  </motion.div>
);

const StatCard = ({ icon: Icon, label, value, trend }) => (
  <Card3D className="relative overflow-hidden">
    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
    <div className="flex items-start justify-between">
      <div>
        <p className="text-zinc-500 text-sm mb-1">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {trend !== undefined && (
          <p className={`text-sm mt-1 flex items-center gap-1 ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend)}%
          </p>
        )}
      </div>
      <div className="p-3 bg-amber-500/10 rounded-lg">
        <Icon className="text-amber-500" size={24} />
      </div>
    </div>
  </Card3D>
);

const Navbar = () => {
  const { user, token, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Load notifications
  useEffect(() => {
    if (user && token) {
      loadNotifications();
      // Poll every 30 seconds
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user, token]);

  const loadNotifications = async () => {
    try {
      const res = await api.get('/notifications', token);
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (e) {
      console.error('Failed to load notifications');
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.post(`/notifications/${notificationId}/read`, {}, token);
      loadNotifications();
    } catch (e) {
      console.error('Failed to mark as read');
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all', {}, token);
      loadNotifications();
    } catch (e) {
      console.error('Failed to mark all as read');
    }
  };

  const navLinks = [
    { path: "/", label: "Home", icon: BarChart3 },
    { path: "/products", label: "Products", icon: Package },
    { path: "/courses", label: "Courses", icon: BookOpen },
    { path: "/signals", label: "Signals", icon: Signal },
    { path: "/ai-advisor", label: "AI Advisor", icon: Brain },
    { path: "/book", label: "Book", icon: BookOpen },
    { path: "/news", label: "News", icon: Newspaper },
    { path: "/support", label: "Support", icon: HelpCircle },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
            <TrendingUp className="text-black" size={24} />
          </div>
          <span className="text-xl font-bold text-white">Bull & Bear</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-2 transition-colors ${location.pathname === link.path ? 'text-amber-500' : 'text-zinc-400 hover:text-white'}`}
            >
              <link.icon size={18} />
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              {/* Notification Bell */}
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="text-zinc-400 hover:text-white relative p-2"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                
                {/* Notification Dropdown */}
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50"
                    >
                      <div className="p-3 border-b border-zinc-800 flex justify-between items-center">
                        <span className="text-white font-semibold">Notifications</span>
                        {unreadCount > 0 && (
                          <button onClick={markAllRead} className="text-amber-500 text-xs hover:underline">
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-4 text-center text-zinc-500">No notifications</div>
                        ) : (
                          notifications.slice(0, 10).map(notif => (
                            <div 
                              key={notif.id}
                              onClick={() => {
                                if (!notif.read) markAsRead(notif.id);
                                if (notif.link) navigate(notif.link);
                                setShowNotifications(false);
                              }}
                              className={`p-3 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 ${!notif.read ? 'bg-amber-500/5' : ''}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${notif.type === 'signal' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                                  {notif.type === 'signal' ? (
                                    <Signal size={14} className="text-emerald-500" />
                                  ) : (
                                    <Newspaper size={14} className="text-blue-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${!notif.read ? 'text-white' : 'text-zinc-400'}`}>
                                    {notif.title}
                                  </p>
                                  <p className="text-xs text-zinc-500 truncate">{notif.message}</p>
                                  <p className="text-xs text-zinc-600 mt-1">
                                    {new Date(notif.created_at).toLocaleString()}
                                  </p>
                                </div>
                                {!notif.read && (
                                  <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0"></div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {user.is_admin && (
                <Link to="/admin" className="text-amber-500 hover:text-amber-400 flex items-center gap-2">
                  <Crown size={18} /> Admin
                </Link>
              )}
              <Link to="/profile" className="text-zinc-400 hover:text-white flex items-center gap-2">
                <User size={18} /> {user.name}
              </Link>
              <button onClick={logout} className="text-zinc-400 hover:text-red-500">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-zinc-400 hover:text-white">Login</Link>
              <GoldButton onClick={() => navigate('/register')}>Get Started</GoldButton>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-zinc-900 border-b border-zinc-800"
          >
            <div className="px-4 py-4 space-y-4">
              {navLinks.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 py-2 ${location.pathname === link.path ? 'text-amber-500' : 'text-zinc-400'}`}
                >
                  <link.icon size={18} />
                  {link.label}
                </Link>
              ))}
              {user ? (
                <>
                  {user.is_admin && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-amber-500">
                      <Crown size={18} /> Admin Panel
                    </Link>
                  )}
                  <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2 text-zinc-400">
                    <User size={18} /> Profile
                  </Link>
                  <button onClick={() => { logout(); setMenuOpen(false); }} className="flex items-center gap-2 py-2 text-red-500">
                    <LogOut size={18} /> Logout
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="text-zinc-400 py-2">Login</Link>
                  <GoldButton onClick={() => { navigate('/register'); setMenuOpen(false); }}>Get Started</GoldButton>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

// Footer Component
const Footer = () => (
  <footer className="bg-zinc-950 border-t border-zinc-800 py-12 mt-16">
    <div className="max-w-7xl mx-auto px-4">
      <div className="grid md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="md:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
              <TrendingUp className="text-black" size={24} />
            </div>
            <span className="text-xl font-bold text-white">Bull & Bear</span>
          </div>
          <p className="text-zinc-500 text-sm">Professional trading education, signals, and market analysis for serious traders.</p>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="text-white font-semibold mb-4">Quick Links</h4>
          <ul className="space-y-2">
            <li><Link to="/products" className="text-zinc-400 hover:text-amber-500 text-sm">Products</Link></li>
            <li><Link to="/courses" className="text-zinc-400 hover:text-amber-500 text-sm">Courses</Link></li>
            <li><Link to="/signals" className="text-zinc-400 hover:text-amber-500 text-sm">Signals</Link></li>
            <li><Link to="/book" className="text-zinc-400 hover:text-amber-500 text-sm">Book</Link></li>
            <li><Link to="/news" className="text-zinc-400 hover:text-amber-500 text-sm">News</Link></li>
          </ul>
        </div>

        {/* Support */}
        <div>
          <h4 className="text-white font-semibold mb-4">Support</h4>
          <ul className="space-y-2">
            <li><Link to="/support" className="text-zinc-400 hover:text-amber-500 text-sm">Help Center</Link></li>
            <li><Link to="/support" className="text-zinc-400 hover:text-amber-500 text-sm">Contact Us</Link></li>
            <li><Link to="/support" className="text-zinc-400 hover:text-amber-500 text-sm">FAQ</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="text-white font-semibold mb-4">Contact Us</h4>
          <a 
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-2 text-amber-500 hover:text-amber-400 mb-4"
          >
            <Mail size={18} />
            {SUPPORT_EMAIL}
          </a>
          <p className="text-zinc-500 text-sm">We typically respond within 24 hours.</p>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-zinc-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-zinc-500 text-sm">© 2025 Bull & Bear Academy. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-zinc-400 hover:text-amber-500">
            <Mail size={20} />
          </a>
        </div>
      </div>
    </div>
  </footer>
);

const PageWrapper = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
    className="pt-24 pb-12 min-h-screen"
  >
    {children}
  </motion.div>
);

// =============== PRODUCTS PAGE ===============

const ProductsPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const [useCrypto, setUseCrypto] = useState(false);

  const handlePurchase = async (productType) => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    setLoading(productType);
    try {
      // Create Stripe checkout session
      const response = await api.post('/checkout/create', {
        product_type: productType,
        origin_url: window.location.origin,
        use_crypto: useCrypto
      }, token);
      
      // Redirect to Stripe checkout
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (e) {
      console.error('Payment error:', e);
      alert('Payment initialization failed. Please try again.');
      setLoading(null);
    }
  };

  const products = [
    {
      id: 'course',
      title: 'Trading Courses',
      subtitle: 'Complete Education System',
      description: 'Master the markets with our comprehensive video course library. From beginner basics to advanced strategies.',
      price: 49.90,
      priceType: 'one-time',
      icon: Video,
      color: 'from-blue-500 to-cyan-500',
      features: [
        '50+ HD Video Lessons',
        'Beginner to Advanced Content',
        'Technical Analysis Mastery',
        'Risk Management Strategies',
        'Trading Psychology',
        'Lifetime Access',
        'Certificate of Completion'
      ],
      hasAccess: user?.course_access || user?.is_admin,
      link: '/courses'
    },
    {
      id: 'book',
      title: 'Trading Book',
      subtitle: 'Bull & Bear Trading Mastery',
      description: 'The complete written guide to professional trading. PDF format with over 200 pages of premium content.',
      price: 29.90,
      priceType: 'one-time',
      icon: BookOpen,
      color: 'from-purple-500 to-pink-500',
      features: [
        '200+ Page PDF Guide',
        'Complete Trading Methodology',
        'Chart Analysis Examples',
        'Risk Management Framework',
        'Trading Journal Templates',
        'Lifetime Updates',
        'Offline Reading'
      ],
      hasAccess: user?.book_access || user?.is_admin,
      link: '/book'
    },
    {
      id: 'signals',
      title: 'Private Signals',
      subtitle: 'Premium Trading Signals',
      description: 'Receive high-probability trade setups directly from our expert analysts. Real-time alerts with exact entry, SL & TP.',
      price: 19.90,
      priceType: 'monthly',
      icon: Signal,
      color: 'from-amber-500 to-yellow-500',
      features: [
        'Daily Trade Signals',
        'Forex, Crypto & Indices',
        'Exact Entry & Exit Levels',
        'Risk Management Notes',
        'Real-time Notifications',
        'Signal Performance Stats',
        '24/7 Support'
      ],
      hasAccess: user?.signals_subscription || user?.is_admin,
      link: '/signals',
      popular: true
    }
  ];

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 mb-6"
          >
            <Sparkles className="text-amber-500" size={16} />
            <span className="text-amber-500 text-sm font-medium">Premium Products</span>
          </motion.div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose Your <span className="bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent">Trading Journey</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-6">
            Everything you need to become a professional trader. Courses, books, and live signals - all in one place.
          </p>
          
          {/* Crypto Payment Toggle */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => setUseCrypto(false)}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${!useCrypto ? 'bg-amber-500 text-black font-semibold' : 'bg-zinc-800 text-zinc-400'}`}
            >
              <DollarSign size={18} /> Card Payment
            </button>
            <button
              onClick={() => setUseCrypto(true)}
              className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${useCrypto ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold' : 'bg-zinc-800 text-zinc-400'}`}
            >
              <Shield size={18} /> USDC Crypto
            </button>
          </div>
          {useCrypto && (
            <p className="text-sm text-zinc-500 mb-4">
              Pay with USDC on Ethereum, Base, or Polygon • 1.5% fee
            </p>
          )}
        </div>

        {/* Products Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative bg-gradient-to-br from-zinc-900 to-zinc-950 border ${product.popular ? 'border-amber-500' : 'border-zinc-800'} rounded-2xl overflow-hidden`}
            >
              {product.popular && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-center py-2 text-sm font-bold">
                  MOST POPULAR
                </div>
              )}
              
              <div className={`p-8 ${product.popular ? 'pt-14' : ''}`}>
                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${product.color} flex items-center justify-center mb-6`}>
                  <product.icon className="text-white" size={32} />
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-white mb-1">{product.title}</h3>
                <p className="text-amber-500 text-sm mb-4">{product.subtitle}</p>
                <p className="text-zinc-400 text-sm mb-6">{product.description}</p>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">${product.price}</span>
                  <span className="text-zinc-500 ml-2">/ {product.priceType}</span>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-zinc-300 text-sm">
                      <CheckCircle className="text-emerald-500 flex-shrink-0" size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                {product.hasAccess ? (
                  <div className="space-y-3">
                    <div className="bg-emerald-500/20 text-emerald-500 px-4 py-3 rounded-lg flex items-center justify-center gap-2">
                      <CheckCircle size={18} />
                      Access Granted
                    </div>
                    <GoldButton variant="secondary" onClick={() => navigate(product.link)} className="w-full">
                      View Content <ChevronRight size={18} />
                    </GoldButton>
                  </div>
                ) : (
                  <GoldButton 
                    onClick={() => handlePurchase(product.id)} 
                    className="w-full"
                    disabled={loading === product.id}
                  >
                    {loading === product.id ? (
                      <>Processing...</>
                    ) : (
                      <><DollarSign size={18} /> Pay ${product.price}</>
                    )}
                  </GoldButton>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bundle Offer */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-16"
        >
          <Card3D className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-yellow-500/10" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-8 p-4">
              <div>
                <span className="inline-block bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full mb-4">BEST VALUE</span>
                <h3 className="text-2xl font-bold text-white mb-2">Complete Trading Bundle</h3>
                <p className="text-zinc-400">Get all products together and save 20%! Courses + Book + 3 Months Signals</p>
              </div>
              <div className="text-center">
                <p className="text-zinc-500 line-through">$139.60</p>
                <p className="text-4xl font-bold text-amber-500 mb-4">$99.90</p>
                <GoldButton onClick={() => alert('Bundle purchase coming soon!')}>
                  <Package size={18} /> Get Bundle
                </GoldButton>
              </div>
            </div>
          </Card3D>
        </motion.div>
      </div>
    </PageWrapper>
  );
};

// =============== PAGES ===============

const HomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [market, setMarket] = useState(null);
  const [signals, setSignals] = useState([]);
  const [news, setNews] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [marketRes, signalsRes, newsRes] = await Promise.all([
        api.get('/market'),
        api.get('/signals'),
        api.get('/news')
      ]);
      setMarket(marketRes.data);
      setSignals(signalsRes.data.signals?.slice(0, 3) || []);
      setNews(newsRes.data?.slice(0, 3) || []);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <PageWrapper>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto px-4 py-20 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 mb-6">
              <Crown className="text-amber-500" size={16} />
              <span className="text-amber-500 text-sm font-medium">Premium Trading Education</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="text-white">Master The</span>{" "}
              <span className="bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent">Markets</span>
            </h1>
            
            <p className="text-xl text-zinc-400 mb-8 max-w-2xl mx-auto">
              Professional trading courses, exclusive signals, and institutional-grade market analysis. 
              Join thousands of successful traders.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <GoldButton onClick={() => navigate('/products')} className="text-lg px-8 py-4">
                <Play size={20} /> Start Learning
              </GoldButton>
              <GoldButton variant="secondary" onClick={() => navigate('/signals')} className="text-lg px-8 py-4">
                <Signal size={20} /> View Signals
              </GoldButton>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Market Overview */}
      {market && (
        <section className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
            <BarChart3 className="text-amber-500" /> Live Market Overview
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {['forex', 'crypto', 'indices'].map(category => (
              <Card3D key={category}>
                <h3 className="text-lg font-semibold text-amber-500 mb-4 capitalize">{category}</h3>
                <div className="space-y-3">
                  {market[category]?.map(item => (
                    <div key={item.symbol} className="flex justify-between items-center py-2 border-b border-zinc-800 last:border-0">
                      <span className="text-white font-medium">{item.symbol}</span>
                      <div className="text-right">
                        <p className="text-white">${item.price?.toLocaleString()}</p>
                        <p className={`text-sm ${item.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {item.change >= 0 ? '+' : ''}{item.change}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card3D>
            ))}
          </div>
        </section>
      )}

      {/* Latest Signals Preview */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Signal className="text-amber-500" /> Latest Signals
          </h2>
          <Link to="/signals" className="text-amber-500 hover:text-amber-400 flex items-center gap-2">
            View All <ChevronRight size={18} />
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {signals.map(signal => (
            <Card3D key={signal.id}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xl font-bold text-white">{signal.asset}</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${signal.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                    {signal.direction === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {signal.direction}
                  </span>
                </div>
                {signal.is_pinned && <Crown className="text-amber-500" size={20} />}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Entry</span>
                  <span className="text-white">{signal.entry_price || '***'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Stop Loss</span>
                  <span className="text-red-500">{signal.stop_loss || '***'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Take Profit</span>
                  <span className="text-emerald-500">{signal.take_profit_1 || '***'}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <span className={`text-xs px-2 py-1 rounded ${signal.status === 'active' ? 'bg-amber-500/20 text-amber-500' : signal.status === 'tp_hit' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                  {signal.status?.toUpperCase().replace('_', ' ')}
                </span>
              </div>
            </Card3D>
          ))}
        </div>
      </section>

      {/* AI Investment Advisor Promo */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <Card3D className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
          
          <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Brain size={48} className="text-black" />
              </div>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium mb-3">
                <Sparkles size={14} /> NEW FEATURE
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">AI Investment Manager</h2>
              <p className="text-zinc-400 mb-6 max-w-xl">
                Get personalized investment advice, real-time market analysis, and learn trading strategies from our AI-powered assistant. 
                Ask about crypto, gold, forex, stocks, and more!
              </p>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-full text-sm">Bitcoin Analysis</span>
                <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-full text-sm">Gold & Silver</span>
                <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-full text-sm">Portfolio Advice</span>
                <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-full text-sm">Risk Management</span>
              </div>
            </div>
            
            <div className="flex-shrink-0">
              <GoldButton onClick={() => navigate('/ai-advisor')} className="text-lg px-6 py-3">
                Try AI Advisor <ChevronRight size={20} />
              </GoldButton>
            </div>
          </div>
        </Card3D>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-white text-center mb-12">Why Choose Bull & Bear?</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { icon: BookOpen, title: "Pro Courses", desc: "Learn from institutional traders" },
            { icon: Signal, title: "Live Signals", desc: "High-probability trade setups" },
            { icon: Shield, title: "Risk Management", desc: "Protect your capital" },
            { icon: Brain, title: "Psychology", desc: "Master your trading mindset" },
          ].map((item, i) => (
            <Card3D key={i} className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center">
                <item.icon className="text-amber-500" size={28} />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-zinc-500 text-sm">{item.desc}</p>
            </Card3D>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <Card3D className="text-center py-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-yellow-500/5" />
          <div className="relative">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Start Trading Professionally?</h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto">Join our community of successful traders and get access to premium education, signals, and market analysis.</p>
            <GoldButton onClick={() => navigate('/products')} className="text-lg px-8 py-4">
              View All Products <ChevronRight size={20} />
            </GoldButton>
          </div>
        </Card3D>
      </section>
    </PageWrapper>
  );
};

const CoursesPage = () => {
  const { user, token } = useAuth();
  const [courses, setCourses] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const navigate = useNavigate();

  const categories = [
    { id: 'all', label: 'All Courses', icon: BookOpen },
    { id: 'beginner', label: 'Beginner', icon: Target },
    { id: 'advanced', label: 'Advanced', icon: TrendingUp },
    { id: 'psychology', label: 'Psychology', icon: Brain },
    { id: 'risk-management', label: 'Risk Management', icon: Shield },
    { id: 'technical-analysis', label: 'Technical Analysis', icon: BarChart3 },
  ];

  useEffect(() => {
    loadCourses();
  }, [token]);

  const loadCourses = async () => {
    try {
      const res = await api.get('/courses', token);
      setCourses(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredCourses = selectedCategory === 'all' 
    ? courses 
    : courses.filter(c => c.category === selectedCategory);

  const hasAccess = user?.course_access || user?.is_admin;

  const handlePurchase = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const response = await api.post('/checkout/create', {
        product_type: 'course',
        origin_url: window.location.origin
      }, token);
      
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (e) {
      alert('Payment initialization failed');
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Trading Courses</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">Master the markets with our comprehensive trading education program designed by professional traders.</p>
        </div>

        {!hasAccess && (
          <Card3D className="mb-8 text-center">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-left">
                <h3 className="text-xl font-bold text-white mb-2">Unlock All Courses</h3>
                <p className="text-zinc-400">Get lifetime access to all courses for a one-time payment</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-3xl font-bold text-amber-500 mb-2">$49.90</p>
                <GoldButton onClick={handlePurchase}>
                  <Lock size={18} /> Purchase Access
                </GoldButton>
              </div>
            </div>
          </Card3D>
        )}

        {/* Categories */}
        <div className="flex flex-wrap gap-3 mb-8">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${selectedCategory === cat.id ? 'bg-amber-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
            >
              <cat.icon size={16} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Course Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map(course => (
            <Card3D key={course.id} onClick={() => setSelectedCourse(course)}>
              <div className="aspect-video bg-zinc-800 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                {course.thumbnail ? (
                  <img src={getMediaUrl(course.thumbnail)} alt={course.title} className="w-full h-full object-cover" />
                ) : (
                  <BookOpen className="text-zinc-600" size={48} />
                )}
                {course.is_free ? (
                  <span className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded">FREE</span>
                ) : !hasAccess && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Lock className="text-amber-500" size={32} />
                  </div>
                )}
              </div>
              <span className="text-xs text-amber-500 uppercase tracking-wider">{course.category?.replace('-', ' ')}</span>
              <h3 className="text-lg font-semibold text-white mt-1 mb-2">{course.title}</h3>
              <p className="text-zinc-500 text-sm line-clamp-2">{course.description}</p>
              {course.duration && (
                <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
                  <Clock size={14} />
                  {course.duration}
                </div>
              )}
            </Card3D>
          ))}
        </div>

        {/* Course Modal */}
        {selectedCourse && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedCourse(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs text-amber-500 uppercase tracking-wider">{selectedCourse.category?.replace('-', ' ')}</span>
                  <button onClick={() => setSelectedCourse(null)} className="text-zinc-500 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">{selectedCourse.title}</h2>
                  
                  {(hasAccess || selectedCourse.is_free) && selectedCourse.video_url ? (
                    <div className="aspect-video bg-black rounded-lg mb-4">
                      <video 
                        key={selectedCourse.id}
                        controls 
                        controlsList="nodownload" 
                        preload="auto"
                        playsInline
                        autoPlay={false}
                        className="w-full h-full rounded-lg protected-video"
                        src={getMediaUrl(selectedCourse.video_url)}
                        onError={(e) => console.error('Video error:', e.target.error)}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-zinc-800 rounded-lg mb-4 flex items-center justify-center">
                      <div className="text-center">
                        <Lock className="text-amber-500 mx-auto mb-2" size={48} />
                        <p className="text-zinc-400">Purchase access to watch this lesson</p>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-zinc-400">{selectedCourse.description}</p>
                  
                  {!(hasAccess || selectedCourse.is_free) && (
                    <div className="mt-6">
                      <GoldButton onClick={handlePurchase} className="w-full">
                        Unlock All Courses - $49.90
                      </GoldButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </PageWrapper>
  );
};

const SignalsPage = () => {
  const { user, token } = useAuth();
  const [signalsData, setSignalsData] = useState({ signals: [], has_access: false });
  const navigate = useNavigate();

  useEffect(() => {
    loadSignals();
  }, [token]);

  const loadSignals = async () => {
    try {
      const res = await api.get('/signals', token);
      setSignalsData(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const response = await api.post('/checkout/create', {
        product_type: 'signals',
        origin_url: window.location.origin
      }, token);
      
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (e) {
      alert('Payment initialization failed');
    }
  };

  const hasAccess = signalsData.has_access;

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Private Trading Signals</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">Get access to our high-probability trade setups with clear entry, stop loss, and take profit levels.</p>
        </div>

        {!hasAccess && (
          <Card3D className="mb-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Subscribe to Signals</h3>
                <p className="text-zinc-400">Get unlimited access to all trading signals</p>
                <ul className="mt-4 space-y-2">
                  {['Real-time signal alerts', 'Entry, SL & TP levels', 'Risk management tips', 'Signal status updates'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-zinc-300">
                      <CheckCircle className="text-emerald-500" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-500 mb-1">$19.90</p>
                <p className="text-zinc-500 text-sm mb-4">per month</p>
                <GoldButton onClick={handleSubscribe}>
                  <Signal size={18} /> Subscribe Now
                </GoldButton>
              </div>
            </div>
          </Card3D>
        )}

        {/* Signals Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {signalsData.signals.map(signal => (
            <Card3D key={signal.id} className={`relative ${signal.is_pinned ? 'border-amber-500/50' : ''}`}>
              {signal.is_pinned && (
                <div className="absolute -top-3 left-4 bg-amber-500 text-black text-xs font-bold px-2 py-1 rounded">
                  PINNED
                </div>
              )}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-2xl font-bold text-white">{signal.asset}</p>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${signal.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                    {signal.direction === 'BUY' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {signal.direction}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${signal.status === 'active' ? 'bg-amber-500/20 text-amber-500' : signal.status === 'tp_hit' ? 'bg-emerald-500/20 text-emerald-500' : signal.status === 'sl_hit' ? 'bg-red-500/20 text-red-500' : 'bg-zinc-700 text-zinc-400'}`}>
                  {signal.status?.toUpperCase().replace('_', ' ')}
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Entry Price</span>
                  <span className="text-white font-mono text-lg">
                    {hasAccess ? signal.entry_price : <Lock size={16} className="text-amber-500" />}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Stop Loss</span>
                  <span className="text-red-500 font-mono">
                    {hasAccess ? signal.stop_loss : <Lock size={16} className="text-amber-500" />}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Take Profit 1</span>
                  <span className="text-emerald-500 font-mono">
                    {hasAccess ? signal.take_profit_1 : <Lock size={16} className="text-amber-500" />}
                  </span>
                </div>
                {signal.take_profit_2 && (
                  <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                    <span className="text-zinc-500">Take Profit 2</span>
                    <span className="text-emerald-500 font-mono">
                      {hasAccess ? signal.take_profit_2 : <Lock size={16} className="text-amber-500" />}
                    </span>
                  </div>
                )}
              </div>
              
              {signal.risk_note && hasAccess && (
                <div className="mt-4 p-3 bg-amber-500/10 rounded-lg">
                  <p className="text-amber-500 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    {signal.risk_note}
                  </p>
                </div>
              )}
              
              <p className="text-zinc-600 text-xs mt-4">
                {new Date(signal.created_at).toLocaleString()}
              </p>
            </Card3D>
          ))}
        </div>

        {signalsData.signals.length === 0 && (
          <div className="text-center py-12">
            <Signal className="text-zinc-700 mx-auto mb-4" size={64} />
            <p className="text-zinc-500">No signals available yet</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};

const BookPage = () => {
  const { user, token } = useAuth();
  const [book, setBook] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadBook();
  }, [token]);

  const loadBook = async () => {
    try {
      const res = await api.get('/book', token);
      setBook(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePurchase = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const response = await api.post('/checkout/create', {
        product_type: 'book',
        origin_url: window.location.origin
      }, token);
      
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (e) {
      toast.error('Payment initialization failed. Please try again.');
    }
  };

  const handleReadOnline = () => {
    if (!book?.pdf_url) {
      toast.error('PDF is not available yet. Please contact support.');
      return;
    }
    const pdfUrl = getMediaUrl(book.pdf_url);
    const newWindow = window.open(pdfUrl, '_blank');
    
    // Check if popup was blocked
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      // Fallback: Create a clickable link that will work even with popup blockers
      toast.info(
        <div className="flex flex-col gap-2">
          <span>Popup blocked. Click below to open the PDF:</span>
          <a 
            href={pdfUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-amber-500 underline font-medium"
          >
            Open PDF →
          </a>
        </div>,
        { duration: 10000 }
      );
    }
  };

  const handleDownload = async () => {
    if (!book?.pdf_url) {
      toast.error('PDF is not available yet. Please contact support.');
      return;
    }
    
    setDownloading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/download/book`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${book.title || 'BullBear-Trading-Book'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Download started! Check your downloads folder.');
    } catch (e) {
      console.error('Download error:', e);
      toast.error(e.message || 'Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const hasAccess = book?.has_access;

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto px-4">
        <Card3D className="overflow-hidden">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Book Cover */}
            <div className="aspect-[3/4] bg-gradient-to-br from-amber-500/20 to-yellow-500/20 rounded-xl flex items-center justify-center">
              {book?.cover_url ? (
                <img src={getMediaUrl(book.cover_url)} alt="Book Cover" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <div className="text-center p-8">
                  <BookOpen className="text-amber-500 mx-auto mb-4" size={80} />
                  <h3 className="text-2xl font-bold text-white">Bull & Bear</h3>
                  <p className="text-amber-500">Trading Mastery</p>
                </div>
              )}
            </div>
            
            {/* Book Info */}
            <div className="flex flex-col justify-center">
              <h1 className="text-3xl font-bold text-white mb-4">{book?.title || 'Bull & Bear Trading Mastery'}</h1>
              <p className="text-zinc-400 mb-6">
                {book?.description || 'The complete guide to mastering the financial markets. Learn professional trading strategies, risk management, and the psychology of successful traders.'}
              </p>
              
              <ul className="space-y-3 mb-8">
                {['Complete trading methodology', 'Risk management frameworks', 'Trading psychology mastery', 'Real trade examples', 'Lifetime updates'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-zinc-300">
                    <CheckCircle className="text-emerald-500" size={18} />
                    {item}
                  </li>
                ))}
              </ul>
              
              {hasAccess ? (
                <div>
                  <div className="bg-emerald-500/20 text-emerald-500 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
                    <CheckCircle size={20} />
                    You own this book
                  </div>
                  {book?.pdf_url ? (
                    <div className="space-y-3">
                      <GoldButton onClick={handleReadOnline} className="w-full" data-testid="read-online-btn">
                        <ExternalLink size={18} /> Read Online
                      </GoldButton>
                      <GoldButton 
                        variant="secondary" 
                        onClick={handleDownload}
                        disabled={downloading}
                        className="w-full"
                        data-testid="download-pdf-btn"
                      >
                        {downloading ? (
                          <>
                            <Loader2 size={18} className="animate-spin" /> Downloading...
                          </>
                        ) : (
                          <>
                            <Download size={18} /> Download for Offline
                          </>
                        )}
                      </GoldButton>
                    </div>
                  ) : (
                    <div className="bg-yellow-500/20 text-yellow-500 px-4 py-3 rounded-lg flex items-center gap-2">
                      <AlertCircle size={20} />
                      PDF will be available soon. Check back later!
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-3xl font-bold text-amber-500 mb-4">${book?.price || 29.90}</p>
                  <GoldButton onClick={handlePurchase} className="w-full" data-testid="purchase-book-btn">
                    <DollarSign size={18} /> Purchase Book
                  </GoldButton>
                </div>
              )}
            </div>
          </div>
        </Card3D>
      </div>
    </PageWrapper>
  );
};

const NewsPage = () => {
  const [news, setNews] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    try {
      const res = await api.get('/news');
      setNews(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Market News & Analysis</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">Stay informed with our latest market insights, technical analysis, and trading commentary.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map(article => (
            <Card3D key={article.id} onClick={() => setSelectedArticle(article)}>
              {article.image_url && (
                <div className="aspect-video bg-zinc-800 rounded-lg mb-4 overflow-hidden">
                  <img src={getMediaUrl(article.image_url)} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-3">
                {article.tags?.map(tag => (
                  <span key={tag} className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded">{tag}</span>
                ))}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">{article.title}</h3>
              <p className="text-zinc-500 text-sm line-clamp-3">{article.content}</p>
              <p className="text-zinc-600 text-xs mt-4">{new Date(article.created_at).toLocaleDateString()}</p>
            </Card3D>
          ))}
        </div>

        {news.length === 0 && (
          <div className="text-center py-12">
            <Newspaper className="text-zinc-700 mx-auto mb-4" size={64} />
            <p className="text-zinc-500">No news articles yet</p>
          </div>
        )}

        {/* Article Modal */}
        <AnimatePresence>
          {selectedArticle && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
              onClick={() => setSelectedArticle(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.tags?.map(tag => (
                      <span key={tag} className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded">{tag}</span>
                    ))}
                  </div>
                  <button onClick={() => setSelectedArticle(null)} className="text-zinc-500 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">{selectedArticle.title}</h2>
                {selectedArticle.image_url && (
                  <img src={getMediaUrl(selectedArticle.image_url)} alt="" className="w-full rounded-lg mb-4" />
                )}
                <p className="text-zinc-300 whitespace-pre-wrap">{selectedArticle.content}</p>
                <p className="text-zinc-600 text-sm mt-6">{new Date(selectedArticle.created_at).toLocaleString()}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageWrapper>
  );
};

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.detail || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <PageWrapper>
      <div className="max-w-md mx-auto px-4">
        <Card3D>
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center mb-4">
              <TrendingUp className="text-black" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
            <p className="text-zinc-500">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}
            <div>
              <label className="text-zinc-400 text-sm mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm mb-2 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <GoldButton type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </GoldButton>
          </form>

          <p className="text-center text-zinc-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-amber-500 hover:underline">Sign up</Link>
          </p>
        </Card3D>
      </div>
    </PageWrapper>
  );
};

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.detail || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <PageWrapper>
      <div className="max-w-md mx-auto px-4">
        <Card3D>
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center mb-4">
              <TrendingUp className="text-black" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">Create Account</h1>
            <p className="text-zinc-500">Start your trading journey</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}
            <div>
              <label className="text-zinc-400 text-sm mb-2 block">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm mb-2 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <GoldButton type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account...' : 'Create Account'}
            </GoldButton>
          </form>

          <p className="text-center text-zinc-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-amber-500 hover:underline">Sign in</Link>
          </p>
        </Card3D>
      </div>
    </PageWrapper>
  );
};

const ProfilePage = () => {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [emailPrefs, setEmailPrefs] = useState({ receive_signal_emails: true, receive_news_emails: true });
  const { isSupported, isSubscribed, permission, requestPermission, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadPurchases();
    loadEmailPrefs();
  }, [user]);

  const loadPurchases = async () => {
    try {
      const res = await api.get('/purchases', token);
      setPurchases(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadEmailPrefs = async () => {
    try {
      const res = await api.get('/user/email-preferences', token);
      setEmailPrefs(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const updateEmailPref = async (key, value) => {
    const newPrefs = { ...emailPrefs, [key]: value };
    setEmailPrefs(newPrefs);
    try {
      await api.put('/user/email-preferences', newPrefs, token);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePushToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          alert('Please enable notifications in your browser settings');
          return;
        }
      }
      await subscribe();
    }
  };

  if (!user) return null;

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto px-4">
        <Card3D className="mb-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
              <span className="text-3xl font-bold text-black">{user.name?.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{user.name}</h1>
              <p className="text-zinc-500">{user.email}</p>
              {user.is_admin && (
                <span className="inline-flex items-center gap-1 mt-2 bg-amber-500/20 text-amber-500 text-xs px-2 py-1 rounded">
                  <Crown size={12} /> Admin
                </span>
              )}
            </div>
          </div>
        </Card3D>

        <h2 className="text-xl font-bold text-white mb-4">Your Subscriptions</h2>
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card3D>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-500 text-sm">Courses</p>
                <p className="text-lg font-semibold text-white">Full Access</p>
              </div>
              {user.course_access ? (
                <CheckCircle className="text-emerald-500" size={24} />
              ) : (
                <Lock className="text-zinc-600" size={24} />
              )}
            </div>
          </Card3D>
          <Card3D>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-500 text-sm">Trading Book</p>
                <p className="text-lg font-semibold text-white">Owned</p>
              </div>
              {user.book_access ? (
                <CheckCircle className="text-emerald-500" size={24} />
              ) : (
                <Lock className="text-zinc-600" size={24} />
              )}
            </div>
          </Card3D>
          <Card3D>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-500 text-sm">Signals</p>
                <p className="text-lg font-semibold text-white">Active</p>
              </div>
              {user.signals_subscription ? (
                <CheckCircle className="text-emerald-500" size={24} />
              ) : (
                <Lock className="text-zinc-600" size={24} />
              )}
            </div>
          </Card3D>
        </div>

        {/* Notification Settings */}
        <h2 className="text-xl font-bold text-white mb-4">Notification Settings</h2>
        <Card3D className="mb-8">
          <div className="space-y-4">
            {/* Push Notifications */}
            {isSupported && (
              <div className="flex items-center justify-between py-3 border-b border-zinc-800">
                <div>
                  <p className="text-white font-medium flex items-center gap-2">
                    <Bell size={18} className="text-amber-500" /> Browser Push Notifications
                  </p>
                  <p className="text-zinc-500 text-sm">Get instant alerts for new signals</p>
                </div>
                <button
                  onClick={handlePushToggle}
                  className={`w-12 h-6 rounded-full transition-colors ${isSubscribed ? 'bg-amber-500' : 'bg-zinc-700'} relative`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isSubscribed ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            )}
            
            {/* Email - Signals */}
            <div className="flex items-center justify-between py-3 border-b border-zinc-800">
              <div>
                <p className="text-white font-medium flex items-center gap-2">
                  <Mail size={18} className="text-blue-500" /> Signal Email Alerts
                </p>
                <p className="text-zinc-500 text-sm">Receive emails for new trading signals</p>
              </div>
              <button
                onClick={() => updateEmailPref('receive_signal_emails', !emailPrefs.receive_signal_emails)}
                className={`w-12 h-6 rounded-full transition-colors ${emailPrefs.receive_signal_emails ? 'bg-amber-500' : 'bg-zinc-700'} relative`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${emailPrefs.receive_signal_emails ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            
            {/* Email - News */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white font-medium flex items-center gap-2">
                  <Newspaper size={18} className="text-purple-500" /> News Email Alerts
                </p>
                <p className="text-zinc-500 text-sm">Receive emails for market analysis</p>
              </div>
              <button
                onClick={() => updateEmailPref('receive_news_emails', !emailPrefs.receive_news_emails)}
                className={`w-12 h-6 rounded-full transition-colors ${emailPrefs.receive_news_emails ? 'bg-amber-500' : 'bg-zinc-700'} relative`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${emailPrefs.receive_news_emails ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </Card3D>

        <h2 className="text-xl font-bold text-white mb-4">Purchase History</h2>
        <Card3D>
          {purchases.length > 0 ? (
            <div className="space-y-4">
              {purchases.map(p => (
                <div key={p.id} className="flex justify-between items-center py-3 border-b border-zinc-800 last:border-0">
                  <div>
                    <p className="text-white font-medium capitalize">{p.product_type}</p>
                    <p className="text-zinc-500 text-sm">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <p className="text-amber-500 font-semibold">${p.amount}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-8">No purchases yet</p>
          )}
        </Card3D>

        <div className="mt-8">
          <GoldButton variant="danger" onClick={logout}>
            <LogOut size={18} /> Sign Out
          </GoldButton>
        </div>
      </div>
    </PageWrapper>
  );
};

// =============== VIDEO MANAGER COMPONENT ===============

const VideoManagerTab = ({ token }) => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState({});
  const [conversionStatus, setConversionStatus] = useState({});

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      const res = await api.get('/admin/videos', token);
      setVideos(res.data.videos || []);
    } catch (e) {
      console.error('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const startConversion = async (video) => {
    if (converting[video.filename]) return;
    
    setConverting(prev => ({ ...prev, [video.filename]: true }));
    
    try {
      const res = await api.post('/admin/convert-video', { video_url: video.url }, token);
      const taskId = res.data.task_id;
      
      // Start polling for status
      pollConversionStatus(taskId, video.filename, res.data.output_url);
    } catch (e) {
      alert('Failed to start conversion');
      setConverting(prev => ({ ...prev, [video.filename]: false }));
    }
  };

  const pollConversionStatus = async (taskId, filename, outputUrl) => {
    const poll = async () => {
      try {
        const res = await api.get(`/admin/convert-video/status/${taskId}`, token);
        setConversionStatus(prev => ({ ...prev, [filename]: res.data }));
        
        if (res.data.status === 'completed') {
          setConverting(prev => ({ ...prev, [filename]: false }));
          // Reload video list
          setTimeout(loadVideos, 1000);
        } else if (res.data.status === 'failed') {
          setConverting(prev => ({ ...prev, [filename]: false }));
          alert(`Conversion failed: ${res.data.error}`);
        } else {
          // Continue polling
          setTimeout(poll, 3000);
        }
      } catch (e) {
        console.error('Failed to poll status');
        setConverting(prev => ({ ...prev, [filename]: false }));
      }
    };
    
    poll();
  };

  if (loading) {
    return (
      <Card3D className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-zinc-400 mt-4">Loading videos...</p>
      </Card3D>
    );
  }

  const needsConversion = videos.filter(v => v.needs_conversion);
  const mp4Videos = videos.filter(v => !v.needs_conversion);

  return (
    <div className="space-y-6">
      <Card3D>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <AlertCircle className="text-amber-500" size={20} />
          Videos Needing Conversion ({needsConversion.length})
        </h3>
        
        {needsConversion.length === 0 ? (
          <p className="text-zinc-500">All videos are in MP4 format ✓</p>
        ) : (
          <div className="space-y-3">
            {needsConversion.map(video => (
              <div key={video.filename} className="flex items-center justify-between bg-zinc-800/50 p-4 rounded-lg">
                <div className="flex-1">
                  <p className="text-white font-medium truncate">{video.filename}</p>
                  <div className="flex gap-4 text-sm text-zinc-500">
                    <span>{video.size_mb} MB</span>
                    <span className="text-amber-500 uppercase">{video.format}</span>
                  </div>
                </div>
                
                {converting[video.filename] ? (
                  <div className="flex items-center gap-2 text-amber-500">
                    <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                    <span className="text-sm">Converting...</span>
                  </div>
                ) : (
                  <GoldButton onClick={() => startConversion(video)} className="text-sm px-3 py-1.5">
                    Convert to MP4
                  </GoldButton>
                )}
              </div>
            ))}
          </div>
        )}
      </Card3D>

      <Card3D>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <CheckCircle className="text-emerald-500" size={20} />
          MP4 Videos ({mp4Videos.length})
        </h3>
        
        {mp4Videos.length === 0 ? (
          <p className="text-zinc-500">No MP4 videos yet</p>
        ) : (
          <div className="space-y-3">
            {mp4Videos.map(video => (
              <div key={video.filename} className="flex items-center justify-between bg-zinc-800/50 p-4 rounded-lg">
                <div className="flex-1">
                  <p className="text-white font-medium truncate">{video.filename}</p>
                  <div className="flex gap-4 text-sm text-zinc-500">
                    <span>{video.size_mb} MB</span>
                    <span className="text-emerald-500 uppercase">.mp4</span>
                  </div>
                </div>
                <a 
                  href={`${BACKEND_URL}${video.url}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white"
                >
                  <Eye size={20} />
                </a>
              </div>
            ))}
          </div>
        )}
      </Card3D>
    </div>
  );
};

// =============== ENHANCED ADMIN PAGE ===============

const AdminPage = () => {
  const { user, token, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [signals, setSignals] = useState([]);
  const [news, setNews] = useState([]);
  const [book, setBook] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Form states
  const [courseForm, setCourseForm] = useState({ title: '', description: '', category: 'beginner', video_url: '', thumbnail: '', duration: '', is_free: false });
  const [signalForm, setSignalForm] = useState({ asset: '', direction: 'BUY', entry_price: '', stop_loss: '', take_profit_1: '', take_profit_2: '', take_profit_3: '', risk_note: '', is_pinned: false });
  const [newsForm, setNewsForm] = useState({ title: '', content: '', image_url: '', tags: '' });
  const [bookForm, setBookForm] = useState({ title: '', description: '', cover_url: '', pdf_url: '', price: 29.90 });

  useEffect(() => {
    if (loading) return;
    if (user?.is_admin) {
      loadData();
    }
  }, [user, loading]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <PageWrapper>
        <div className="max-w-7xl mx-auto px-4 text-center py-20">
          <div className="animate-spin w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading...</p>
        </div>
      </PageWrapper>
    );
  }

  // File upload helper
  const uploadFile = async (file, type) => {
    if (!file) {
      alert('No file selected');
      return null;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    setUploading(true);
    try {
      console.log(`Uploading ${type}:`, file.name, file.size);
      const response = await axios.post(`${API}/upload/${type}`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload progress: ${percentCompleted}%`);
        }
      });
      console.log('Upload response:', response.data);
      setUploading(false);
      // Store relative URL to avoid hardcoding preview URLs that may change
      return response.data.url;
    } catch (e) {
      setUploading(false);
      console.error('Upload error:', e);
      console.error('Error response:', e.response?.data);
      alert('Upload failed: ' + (e.response?.data?.detail || e.message));
      return null;
    }
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file, 'video');
    if (url) {
      setCourseForm(prev => ({...prev, video_url: url}));
      alert('Video uploaded successfully!');
    }
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file, 'image');
    if (url) {
      setCourseForm(prev => ({...prev, thumbnail: url}));
      alert('Image uploaded successfully!');
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file, 'pdf');
    if (url) {
      setBookForm(prev => ({...prev, pdf_url: url}));
      alert('PDF uploaded successfully!');
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file, 'image');
    if (url) {
      setBookForm(prev => ({...prev, cover_url: url}));
      alert('Cover image uploaded successfully!');
    }
  };

  const handleNewsImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file, 'image');
    if (url) {
      setNewsForm(prev => ({...prev, image_url: url}));
      alert('Image uploaded successfully!');
    }
  };

  const loadData = async () => {
    try {
      const [statsRes, usersRes, coursesRes, signalsRes, newsRes, bookRes] = await Promise.all([
        api.get('/admin/stats', token),
        api.get('/admin/users', token),
        api.get('/courses', token),
        api.get('/signals', token),
        api.get('/news'),
        api.get('/book', token)
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setCourses(coursesRes.data);
      setSignals(signalsRes.data.signals || []);
      setNews(newsRes.data);
      setBook(bookRes.data);
      setBookForm({
        title: bookRes.data?.title || 'Bull & Bear Trading Mastery',
        description: bookRes.data?.description || '',
        cover_url: bookRes.data?.cover_url || '',
        pdf_url: bookRes.data?.pdf_url || '',
        price: bookRes.data?.price || 29.90
      });
    } catch (e) {
      console.error(e);
    }
  };

  const addCourse = async (e) => {
    e.preventDefault();
    try {
      console.log('Adding course with data:', courseForm);
      const response = await api.post('/courses', courseForm, token);
      console.log('Course added:', response.data);
      setCourseForm({ title: '', description: '', category: 'beginner', video_url: '', thumbnail: '', duration: '', is_free: false });
      loadData();
      alert('Course added successfully!');
    } catch (e) {
      console.error('Add course error:', e);
      console.error('Error response:', e.response?.data);
      alert('Failed to add course: ' + (e.response?.data?.detail || e.message));
    }
  };

  const updateCourse = async (e) => {
    e.preventDefault();
    try {
      console.log('Updating course with data:', courseForm);
      await api.put(`/courses/${editingCourse.id}`, courseForm, token);
      setEditingCourse(null);
      setCourseForm({ title: '', description: '', category: 'beginner', video_url: '', thumbnail: '', duration: '', is_free: false });
      loadData();
      alert('Course updated successfully!');
    } catch (e) {
      console.error('Update course error:', e);
      alert('Failed to update course: ' + (e.response?.data?.detail || e.message));
    }
  };

  const deleteCourse = async (id) => {
    try {
      await api.delete(`/courses/${id}`, token);
      setCourses(courses.filter(c => c.id !== id));
    } catch (e) {
      console.error('Delete course error:', e);
      alert('Failed to delete');
    }
  };

  const startEditCourse = (course) => {
    setEditingCourse(course);
    setCourseForm({
      title: course.title,
      description: course.description,
      category: course.category,
      video_url: course.video_url || '',
      thumbnail: course.thumbnail || '',
      duration: course.duration || '',
      is_free: course.is_free
    });
  };

  const addSignal = async (e) => {
    e.preventDefault();
    try {
      await api.post('/signals', {
        ...signalForm,
        entry_price: parseFloat(signalForm.entry_price),
        stop_loss: parseFloat(signalForm.stop_loss),
        take_profit_1: parseFloat(signalForm.take_profit_1),
        take_profit_2: signalForm.take_profit_2 ? parseFloat(signalForm.take_profit_2) : null,
        take_profit_3: signalForm.take_profit_3 ? parseFloat(signalForm.take_profit_3) : null
      }, token);
      setSignalForm({ asset: '', direction: 'BUY', entry_price: '', stop_loss: '', take_profit_1: '', take_profit_2: '', take_profit_3: '', risk_note: '', is_pinned: false });
      loadData();
      alert('Signal posted successfully!');
    } catch (e) {
      alert('Failed to add signal');
    }
  };

  const updateSignalStatus = async (id, status) => {
    try {
      await api.put(`/signals/${id}`, { status }, token);
      loadData();
    } catch (e) {
      alert('Failed to update');
    }
  };

  const toggleSignalPin = async (id, currentPinned) => {
    try {
      await api.put(`/signals/${id}`, { is_pinned: !currentPinned }, token);
      loadData();
    } catch (e) {
      alert('Failed to update');
    }
  };

  const deleteSignal = async (id) => {
    try {
      await api.delete(`/signals/${id}`, token);
      setSignals(signals.filter(s => s.id !== id));
    } catch (e) {
      console.error('Delete signal error:', e);
      alert('Failed to delete');
    }
  };

  const addNews = async (e) => {
    e.preventDefault();
    try {
      await api.post('/news', {
        ...newsForm,
        tags: newsForm.tags.split(',').map(t => t.trim()).filter(Boolean)
      }, token);
      setNewsForm({ title: '', content: '', image_url: '', tags: '' });
      loadData();
      alert('News article posted!');
    } catch (e) {
      alert('Failed to add news');
    }
  };

  const deleteNews = async (id) => {
    try {
      await api.delete(`/news/${id}`, token);
      setNews(news.filter(n => n.id !== id));
    } catch (e) {
      console.error('Delete news error:', e);
      alert('Failed to delete');
    }
  };

  const updateBook = async (e) => {
    e.preventDefault();
    try {
      console.log('Updating book with data:', bookForm);
      const response = await api.put('/book', bookForm, token);
      console.log('Book updated:', response.data);
      // Show success message before reloading
      const successMsg = document.createElement('div');
      successMsg.innerHTML = '✓ Book saved successfully!';
      successMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:16px 24px;border-radius:8px;z-index:9999;font-weight:bold;';
      document.body.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);
      loadData();
    } catch (e) {
      console.error('Update book error:', e);
      console.error('Error response:', e.response?.data);
      alert('Failed to update book: ' + (e.response?.data?.detail || e.message));
    }
  };

  const updateUserAccess = async (userId, field, value) => {
    try {
      await api.put(`/admin/users/${userId}`, { [field]: value }, token);
      loadData();
    } catch (e) {
      alert('Failed to update user');
    }
  };

  // Show access denied if not admin (after loading is complete)
  if (!loading && !user?.is_admin) {
    return (
      <PageWrapper>
        <div className="max-w-md mx-auto px-4 text-center py-20">
          <Lock className="text-amber-500 mx-auto mb-4\" size={64} />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-zinc-400 mb-6">You need admin privileges to access this page.</p>
          <GoldButton onClick={() => navigate('/login')}>
            Login as Admin
          </GoldButton>
        </div>
      </PageWrapper>
    );
  }

  const tabs = [
    { id: 'stats', label: 'Dashboard', icon: BarChart3 },
    { id: 'courses', label: 'Courses', icon: Video },
    { id: 'book', label: 'Book/PDF', icon: FileText },
    { id: 'signals', label: 'Signals', icon: Signal },
    { id: 'news', label: 'News', icon: Newspaper },
    { id: 'videos', label: 'Video Manager', icon: Play },
    { id: 'users', label: 'Users', icon: Users },
  ];

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
          <Crown className="text-amber-500" /> Admin Panel
        </h1>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === tab.id ? 'bg-amber-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats Tab */}
        {activeTab === 'stats' && stats && (
          <div className="grid md:grid-cols-4 gap-6">
            <StatCard icon={Users} label="Total Users" value={stats.users} />
            <StatCard icon={BookOpen} label="Courses" value={stats.courses} />
            <StatCard icon={Signal} label="Signals" value={stats.signals} />
            <StatCard icon={DollarSign} label="Purchases" value={stats.purchases} />
          </div>
        )}

        {/* Courses Tab - Enhanced */}
        {activeTab === 'courses' && (
          <div className="space-y-8">
            <Card3D>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Video className="text-amber-500" /> {editingCourse ? 'Edit Course' : 'Add New Course'}
              </h3>
              <form onSubmit={editingCourse ? updateCourse : addCourse} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Course Title *</label>
                    <input
                      placeholder="e.g., Introduction to Forex Trading"
                      value={courseForm.title}
                      onChange={e => setCourseForm({...courseForm, title: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Category *</label>
                    <select
                      value={courseForm.category}
                      onChange={e => setCourseForm({...courseForm, category: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="advanced">Advanced</option>
                      <option value="psychology">Psychology</option>
                      <option value="risk-management">Risk Management</option>
                      <option value="technical-analysis">Technical Analysis</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="text-zinc-400 text-sm mb-2 block">Description *</label>
                  <textarea
                    placeholder="Describe what students will learn in this course..."
                    value={courseForm.description}
                    onChange={e => setCourseForm({...courseForm, description: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white h-24"
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block flex items-center gap-2">
                      <Video size={16} /> Course Video
                    </label>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
                        onChange={handleVideoUpload}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-black file:font-semibold hover:file:bg-amber-400 file:cursor-pointer"
                        disabled={uploading}
                      />
                      {uploading && (
                        <div className="flex items-center gap-2 text-amber-500">
                          <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                          Uploading video...
                        </div>
                      )}
                      <input
                        placeholder="Or paste video URL here"
                        value={courseForm.video_url}
                        onChange={e => setCourseForm({...courseForm, video_url: e.target.value})}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm"
                      />
                      {courseForm.video_url && (
                        <p className="text-emerald-500 text-xs">✓ Video set: {courseForm.video_url.substring(0, 50)}...</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Course Thumbnail</label>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                        onChange={handleThumbnailUpload}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-black file:font-semibold hover:file:bg-amber-400 file:cursor-pointer"
                        disabled={uploading}
                      />
                      {uploading && (
                        <div className="flex items-center gap-2 text-amber-500">
                          <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                          Uploading image...
                        </div>
                      )}
                      <input
                        placeholder="Or paste image URL here"
                        value={courseForm.thumbnail}
                        onChange={e => setCourseForm({...courseForm, thumbnail: e.target.value})}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm"
                      />
                      {courseForm.thumbnail && (
                        <p className="text-emerald-500 text-xs">✓ Thumbnail set</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Duration</label>
                    <input
                      placeholder="e.g., 45 minutes"
                      value={courseForm.duration}
                      onChange={e => setCourseForm({...courseForm, duration: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-3 text-zinc-400 cursor-pointer bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 w-full">
                      <input
                        type="checkbox"
                        checked={courseForm.is_free}
                        onChange={e => setCourseForm({...courseForm, is_free: e.target.checked})}
                        className="rounded w-5 h-5"
                      />
                      <span>Free Preview (visible to all)</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <GoldButton type="submit">
                    {editingCourse ? <><Edit size={18} /> Update Course</> : <><PlusCircle size={18} /> Add Course</>}
                  </GoldButton>
                  {editingCourse && (
                    <GoldButton type="button" variant="secondary" onClick={() => {
                      setEditingCourse(null);
                      setCourseForm({ title: '', description: '', category: 'beginner', video_url: '', thumbnail: '', duration: '', is_free: false });
                    }}>
                      Cancel
                    </GoldButton>
                  )}
                </div>
              </form>
            </Card3D>

            <div>
              <h3 className="text-xl font-semibold text-white mb-4">Existing Courses ({courses.length})</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {courses.map(course => (
                  <Card3D key={course.id}>
                    <div className="flex gap-4">
                      <div className="w-24 h-16 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
                        {course.thumbnail ? (
                          <img src={getMediaUrl(course.thumbnail)} alt="" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <Video className="text-zinc-600" size={24} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-white font-medium truncate">{course.title}</p>
                            <p className="text-zinc-500 text-sm">{course.category?.replace('-', ' ')}</p>
                          </div>
                          <div className="flex gap-2">
                            {course.is_free && <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded">FREE</span>}
                            {course.video_url && <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded">VIDEO</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => startEditCourse(course)} className="bg-amber-500/20 hover:bg-amber-500/40 text-amber-500 p-2 rounded-lg transition-colors">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => deleteCourse(course.id)} className="bg-red-500/20 hover:bg-red-500/40 text-red-500 p-2 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card3D>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Book/PDF Tab - New */}
        {activeTab === 'book' && (
          <Card3D>
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <FileText className="text-amber-500" /> Manage Trading Book
            </h3>
            <form onSubmit={updateBook} className="space-y-4">
              <div>
                <label className="text-zinc-400 text-sm mb-2 block">Book Title</label>
                <input
                  placeholder="Bull & Bear Trading Mastery"
                  value={bookForm.title}
                  onChange={e => setBookForm({...bookForm, title: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                />
              </div>
              
              <div>
                <label className="text-zinc-400 text-sm mb-2 block">Description</label>
                <textarea
                  placeholder="Describe your book..."
                  value={bookForm.description}
                  onChange={e => setBookForm({...bookForm, description: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white h-32"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-400 text-sm mb-2 block flex items-center gap-2">
                    <Upload size={16} /> Book Cover Image
                  </label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                      onChange={handleCoverUpload}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-black file:font-semibold hover:file:bg-amber-400 file:cursor-pointer"
                      disabled={uploading}
                    />
                    {uploading && (
                      <div className="flex items-center gap-2 text-amber-500">
                        <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                        Uploading...
                      </div>
                    )}
                    <input
                      placeholder="Or paste image URL here"
                      value={bookForm.cover_url}
                      onChange={e => setBookForm({...bookForm, cover_url: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm"
                    />
                    {bookForm.cover_url && (
                      <p className="text-emerald-500 text-xs">✓ Cover image set</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-zinc-400 text-sm mb-2 block flex items-center gap-2">
                    <FileText size={16} /> Book PDF File
                  </label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handlePdfUpload}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-black file:font-semibold hover:file:bg-amber-400 file:cursor-pointer"
                      disabled={uploading}
                    />
                    {uploading && (
                      <div className="flex items-center gap-2 text-amber-500">
                        <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                        Uploading PDF...
                      </div>
                    )}
                    <input
                      placeholder="Or paste PDF URL here"
                      value={bookForm.pdf_url}
                      onChange={e => setBookForm({...bookForm, pdf_url: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm"
                    />
                    {bookForm.pdf_url && (
                      <p className="text-emerald-500 text-xs">✓ PDF set</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-48">
                <label className="text-zinc-400 text-sm mb-2 block">Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="29.90"
                  value={bookForm.price}
                  onChange={e => setBookForm({...bookForm, price: parseFloat(e.target.value)})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                />
              </div>

              {/* Preview */}
              {(bookForm.cover_url || bookForm.pdf_url) && (
                <div className="bg-zinc-800/50 rounded-lg p-4 mt-4">
                  <p className="text-zinc-400 text-sm mb-3">Preview:</p>
                  <div className="flex gap-4 items-center">
                    {bookForm.cover_url && (
                      <img src={getMediaUrl(bookForm.cover_url)} alt="Cover" className="w-20 h-28 object-cover rounded" />
                    )}
                    <div>
                      <p className="text-white font-medium">{bookForm.title || 'Untitled'}</p>
                      <p className="text-amber-500">${bookForm.price}</p>
                      {bookForm.pdf_url && <p className="text-emerald-500 text-sm mt-1">✓ PDF Uploaded</p>}
                    </div>
                  </div>
                </div>
              )}

              <GoldButton type="submit">
                <Upload size={18} /> Save Book Settings
              </GoldButton>
            </form>
          </Card3D>
        )}

        {/* Signals Tab - Enhanced */}
        {activeTab === 'signals' && (
          <div className="space-y-8">
            <Card3D>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Signal className="text-amber-500" /> Post New Signal
              </h3>
              <form onSubmit={addSignal} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Asset *</label>
                    <input
                      placeholder="e.g., EUR/USD, BTC/USD, XAU/USD"
                      value={signalForm.asset}
                      onChange={e => setSignalForm({...signalForm, asset: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Direction *</label>
                    <select
                      value={signalForm.direction}
                      onChange={e => setSignalForm({...signalForm, direction: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    >
                      <option value="BUY">🟢 BUY (Long)</option>
                      <option value="SELL">🔴 SELL (Short)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Entry Price *</label>
                    <input
                      placeholder="1.0850"
                      type="number"
                      step="any"
                      value={signalForm.entry_price}
                      onChange={e => setSignalForm({...signalForm, entry_price: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Stop Loss *</label>
                    <input
                      placeholder="1.0800"
                      type="number"
                      step="any"
                      value={signalForm.stop_loss}
                      onChange={e => setSignalForm({...signalForm, stop_loss: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Take Profit 1 *</label>
                    <input
                      placeholder="1.0900"
                      type="number"
                      step="any"
                      value={signalForm.take_profit_1}
                      onChange={e => setSignalForm({...signalForm, take_profit_1: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Take Profit 2</label>
                    <input
                      placeholder="1.0950 (optional)"
                      type="number"
                      step="any"
                      value={signalForm.take_profit_2}
                      onChange={e => setSignalForm({...signalForm, take_profit_2: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-sm mb-2 block">Take Profit 3</label>
                    <input
                      placeholder="1.1000 (optional)"
                      type="number"
                      step="any"
                      value={signalForm.take_profit_3}
                      onChange={e => setSignalForm({...signalForm, take_profit_3: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 text-sm mb-2 block">Risk Note</label>
                  <input
                    placeholder="e.g., High volatility expected, manage risk accordingly"
                    value={signalForm.risk_note}
                    onChange={e => setSignalForm({...signalForm, risk_note: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                  />
                </div>

                <label className="flex items-center gap-3 text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signalForm.is_pinned}
                    onChange={e => setSignalForm({...signalForm, is_pinned: e.target.checked})}
                    className="rounded w-5 h-5"
                  />
                  <span>📌 Pin this signal (highlighted at top)</span>
                </label>

                <GoldButton type="submit">
                  <PlusCircle size={18} /> Post Signal
                </GoldButton>
              </form>
            </Card3D>

            <div>
              <h3 className="text-xl font-semibold text-white mb-4">Active Signals ({signals.length})</h3>
              <div className="space-y-3">
                {signals.map(signal => (
                  <Card3D key={signal.id} className={signal.is_pinned ? 'border-amber-500/50' : ''}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${signal.direction === 'BUY' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                          {signal.direction === 'BUY' ? <TrendingUp className="text-emerald-500" /> : <TrendingDown className="text-red-500" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-bold text-lg">{signal.asset}</p>
                            {signal.is_pinned && <Crown className="text-amber-500" size={16} />}
                          </div>
                          <p className="text-zinc-500 text-sm">
                            Entry: {signal.entry_price} | SL: {signal.stop_loss} | TP: {signal.take_profit_1}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={signal.status}
                          onChange={e => updateSignalStatus(signal.id, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
                        >
                          <option value="active">🟡 Active</option>
                          <option value="tp_hit">🟢 TP Hit</option>
                          <option value="sl_hit">🔴 SL Hit</option>
                          <option value="closed">⚪ Closed</option>
                        </select>
                        <button
                          onClick={() => toggleSignalPin(signal.id, signal.is_pinned)}
                          className={`p-2 rounded-lg transition-colors ${signal.is_pinned ? 'bg-amber-500/20 text-amber-500' : 'bg-zinc-700 text-zinc-500 hover:text-amber-500'}`}
                        >
                          <Crown size={18} />
                        </button>
                        <button onClick={() => deleteSignal(signal.id)} className="bg-red-500/20 hover:bg-red-500/40 text-red-500 p-2 rounded-lg transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </Card3D>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* News Tab */}
        {activeTab === 'news' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card3D>
              <h3 className="text-lg font-semibold text-white mb-4">Post News Article</h3>
              <form onSubmit={addNews} className="space-y-4">
                <input
                  placeholder="Article Title"
                  value={newsForm.title}
                  onChange={e => setNewsForm({...newsForm, title: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                  required
                />
                <textarea
                  placeholder="Article content..."
                  value={newsForm.content}
                  onChange={e => setNewsForm({...newsForm, content: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white h-32"
                  required
                />
                <div>
                  <label className="text-zinc-400 text-sm mb-2 block">Article Image</label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                      onChange={handleNewsImageUpload}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-black file:font-semibold hover:file:bg-amber-400 file:cursor-pointer"
                      disabled={uploading}
                    />
                    {uploading && (
                      <div className="flex items-center gap-2 text-amber-500">
                        <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                        Uploading...
                      </div>
                    )}
                    <input
                      placeholder="Or paste image URL here"
                      value={newsForm.image_url}
                      onChange={e => setNewsForm({...newsForm, image_url: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm"
                    />
                    {newsForm.image_url && (
                      <p className="text-emerald-500 text-xs">✓ Image set</p>
                    )}
                  </div>
                </div>
                <input
                  placeholder="Tags (comma separated): Forex, Crypto, Analysis"
                  value={newsForm.tags}
                  onChange={e => setNewsForm({...newsForm, tags: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                />
                <GoldButton type="submit"><PlusCircle size={18} /> Post Article</GoldButton>
              </form>
            </Card3D>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Articles ({news.length})</h3>
              {news.map(article => (
                <Card3D key={article.id} className="flex justify-between items-center">
                  <div>
                    <p className="text-white font-medium">{article.title}</p>
                    <p className="text-zinc-500 text-sm">{new Date(article.created_at).toLocaleDateString()}</p>
                  </div>
                  <button 
                    onClick={() => deleteNews(article.id)} 
                    className="bg-red-500/20 hover:bg-red-500/40 text-red-500 p-2 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </Card3D>
              ))}
            </div>
          </div>
        )}

        {/* Video Manager Tab */}
        {activeTab === 'videos' && (
          <VideoManagerTab token={token} />
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card3D>
            <h3 className="text-lg font-semibold text-white mb-4">Users ({users.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-800">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Courses</th>
                    <th className="pb-3">Book</th>
                    <th className="pb-3">Signals</th>
                    <th className="pb-3">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-zinc-800">
                      <td className="py-3">
                        <p className="text-white">{u.name}</p>
                        <p className="text-zinc-500 text-sm">{u.email}</p>
                      </td>
                      <td>
                        <button
                          onClick={() => updateUserAccess(u.id, 'course_access', !u.course_access)}
                          className={`p-1 rounded ${u.course_access ? 'text-emerald-500' : 'text-zinc-600'}`}
                        >
                          {u.course_access ? <CheckCircle size={20} /> : <X size={20} />}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => updateUserAccess(u.id, 'book_access', !u.book_access)}
                          className={`p-1 rounded ${u.book_access ? 'text-emerald-500' : 'text-zinc-600'}`}
                        >
                          {u.book_access ? <CheckCircle size={20} /> : <X size={20} />}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => updateUserAccess(u.id, 'signals_subscription', !u.signals_subscription)}
                          className={`p-1 rounded ${u.signals_subscription ? 'text-emerald-500' : 'text-zinc-600'}`}
                        >
                          {u.signals_subscription ? <CheckCircle size={20} /> : <X size={20} />}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => updateUserAccess(u.id, 'is_admin', !u.is_admin)}
                          className={`p-1 rounded ${u.is_admin ? 'text-amber-500' : 'text-zinc-600'}`}
                        >
                          {u.is_admin ? <Crown size={20} /> : <X size={20} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card3D>
        )}
      </div>
    </PageWrapper>
  );
};

// =============== AI INVESTMENT MANAGER PAGE ===============

const AIInvestmentPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadSessions();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await api.get('/ai/sessions', token);
      setSessions(res.data.sessions || []);
    } catch (e) {
      console.error('Failed to load sessions');
    }
  };

  const loadHistory = async (sid) => {
    try {
      const res = await api.get(`/ai/history?session_id=${sid}`, token);
      const history = res.data.history || [];
      // Convert history to messages format
      const msgs = [];
      history.reverse().forEach(h => {
        msgs.push({ role: 'user', content: h.user_message });
        msgs.push({ role: 'assistant', content: h.ai_response });
      });
      setMessages(msgs);
      setSessionId(sid);
      setShowSessions(false);
    } catch (e) {
      console.error('Failed to load history');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await api.post('/ai/chat', {
        message: userMessage,
        session_id: sessionId,
        include_market_data: true
      }, token);

      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
      if (!sessionId) {
        setSessionId(res.data.session_id);
        loadSessions();
      }
    } catch (e) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.',
        error: true 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setShowSessions(false);
  };

  const quickQuestions = [
    "What's the current outlook for Bitcoin?",
    "How should I diversify my portfolio?",
    "Explain support and resistance levels",
    "Is gold a good investment right now?",
    "What are the risks of crypto trading?"
  ];

  if (!user) return null;

  return (
    <PageWrapper>
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
                <Brain size={24} className="text-black" />
              </div>
              AI Investment Manager
            </h1>
            <p className="text-zinc-400 mt-2">Your personal AI assistant for market analysis and investment advice</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center gap-2"
            >
              <Clock size={18} /> History
            </button>
            <GoldButton onClick={startNewChat}>
              <PlusCircle size={18} /> New Chat
            </GoldButton>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sessions Sidebar */}
          {showSessions && (
            <div className="lg:col-span-1">
              <Card3D className="max-h-[600px] overflow-y-auto">
                <h3 className="text-white font-semibold mb-4">Chat History</h3>
                {sessions.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No previous chats</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map(s => (
                      <button
                        key={s.session_id}
                        onClick={() => loadHistory(s.session_id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          sessionId === s.session_id ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-zinc-800/50 hover:bg-zinc-700/50'
                        }`}
                      >
                        <p className="text-white text-sm truncate">{s.last_message}...</p>
                        <p className="text-zinc-500 text-xs mt-1">{s.message_count} messages</p>
                      </button>
                    ))}
                  </div>
                )}
              </Card3D>
            </div>
          )}

          {/* Main Chat Area */}
          <div className={showSessions ? 'lg:col-span-3' : 'lg:col-span-4'}>
            <Card3D className="h-[600px] flex flex-col">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center mb-4">
                      <Brain size={40} className="text-amber-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">How can I help you today?</h3>
                    <p className="text-zinc-400 mb-6 max-w-md">
                      Ask me about market trends, investment strategies, trading concepts, or get personalized advice.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                      {quickQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => { setInput(q); }}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-4 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black'
                            : msg.error
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-zinc-800 text-white'
                        }`}
                      >
                        {msg.role === 'assistant' && !msg.error && (
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-700">
                            <Brain size={16} className="text-amber-500" />
                            <span className="text-amber-500 text-sm font-medium">AI Investment Manager</span>
                          </div>
                        )}
                        <div className="prose prose-invert prose-sm max-w-none">
                          {msg.content.split('\n').map((line, j) => (
                            <p key={j} className={`${line.startsWith('**') ? 'font-semibold' : ''} mb-1`}>
                              {line.replace(/\*\*/g, '')}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 p-4 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                        <span className="text-zinc-400">Analyzing...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-zinc-800">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask about investments, trading strategies, market analysis..."
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    disabled={loading}
                  />
                  <GoldButton onClick={sendMessage} disabled={loading || !input.trim()}>
                    <ChevronRight size={20} />
                  </GoldButton>
                </div>
                <p className="text-zinc-500 text-xs mt-2 text-center">
                  AI advice is for educational purposes only. Always do your own research before investing.
                </p>
              </div>
            </Card3D>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

// =============== SUPPORT PAGE ===============

const SupportPage = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Open email client with pre-filled info
    const mailtoLink = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(`Name: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`)}`;
    window.location.href = mailtoLink;
    setSubmitted(true);
  };

  const faqs = [
    {
      q: "How do I access the courses after purchase?",
      a: "After purchase, all courses are immediately unlocked in your account. Simply log in and navigate to the Courses section to start learning."
    },
    {
      q: "How do I receive trading signals?",
      a: "Once subscribed, all signals appear in real-time on the Signals page. Make sure you're logged in to see the full signal details including entry, SL, and TP levels."
    },
    {
      q: "Can I cancel my signals subscription?",
      a: "Yes, you can manage your subscription from your Profile page. Cancellations take effect at the end of your current billing period."
    },
    {
      q: "How do I download the trading book?",
      a: "After purchasing the book, go to the Book section and click 'Read Book' to access the PDF. You can read it online or download it for offline reading."
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept all major credit/debit cards. Crypto payments are also available upon request."
    },
    {
      q: "How can I become an admin/contributor?",
      a: "Please contact us via email with your background and experience. We're always looking for talented traders to join our team."
    }
  ];

  return (
    <PageWrapper>
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 mb-6"
          >
            <HelpCircle className="text-amber-500" size={16} />
            <span className="text-amber-500 text-sm font-medium">Help & Support</span>
          </motion.div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">How Can We Help?</h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
            Have questions? We're here to help. Reach out to us anytime.
          </p>
        </div>

        {/* Contact Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Email Contact */}
          <Card3D className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center">
              <Mail className="text-amber-500" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Email Support</h3>
            <p className="text-zinc-400 mb-4">Send us an email and we'll respond within 24 hours.</p>
            <a 
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 text-lg font-semibold"
            >
              <Mail size={20} />
              {SUPPORT_EMAIL}
            </a>
          </Card3D>

          {/* Response Time */}
          <Card3D className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
              <MessageCircle className="text-emerald-500" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Quick Response</h3>
            <p className="text-zinc-400 mb-4">We typically respond to all inquiries within 24 hours.</p>
            <div className="flex items-center justify-center gap-2 text-emerald-500">
              <Clock size={20} />
              <span className="font-semibold">Average: 2-4 hours</span>
            </div>
          </Card3D>
        </div>

        {/* Contact Form */}
        <Card3D className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <Mail className="text-amber-500" /> Send Us a Message
          </h2>
          
          {submitted ? (
            <div className="text-center py-12">
              <CheckCircle className="text-emerald-500 mx-auto mb-4" size={64} />
              <h3 className="text-xl font-bold text-white mb-2">Email Client Opened!</h3>
              <p className="text-zinc-400">Please send the email from your mail application. We'll get back to you soon!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-zinc-400 text-sm mb-2 block">Your Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="John Doe"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-sm mb-2 block">Your Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="john@example.com"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-sm mb-2 block">Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                  placeholder="How can we help you?"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div>
                <label className="text-zinc-400 text-sm mb-2 block">Message</label>
                <textarea
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  placeholder="Tell us more about your question or issue..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 h-32"
                  required
                />
              </div>
              <GoldButton type="submit" className="w-full md:w-auto">
                <Mail size={18} /> Send Message
              </GoldButton>
            </form>
          )}
        </Card3D>

        {/* FAQ Section */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq, index) => (
              <Card3D key={index}>
                <h3 className="text-lg font-semibold text-white mb-3 flex items-start gap-2">
                  <HelpCircle className="text-amber-500 flex-shrink-0 mt-1" size={18} />
                  {faq.q}
                </h3>
                <p className="text-zinc-400 text-sm pl-6">{faq.a}</p>
              </Card3D>
            ))}
          </div>
        </div>

        {/* Direct Email CTA */}
        <Card3D className="text-center py-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-yellow-500/5" />
          <div className="relative">
            <h3 className="text-2xl font-bold text-white mb-4">Still Need Help?</h3>
            <p className="text-zinc-400 mb-6">Our team is ready to assist you with any questions.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`}>
              <GoldButton>
                <Mail size={18} /> Email Us Directly
              </GoldButton>
            </a>
          </div>
        </Card3D>
      </div>
    </PageWrapper>
  );
};

// =============== PAYMENT PAGES ===============

const PaymentSuccessPage = () => {
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking');
  const [productType, setProductType] = useState('');
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 10;

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    if (!sessionId) {
      setStatus('error');
      return;
    }
    
    pollPaymentStatus(sessionId);
  }, [user]);

  const pollPaymentStatus = async (sessionId) => {
    if (attempts >= maxAttempts) {
      setStatus('timeout');
      return;
    }

    try {
      const response = await api.get(`/checkout/status/${sessionId}`, token);
      const data = response.data;
      
      if (data.payment_status === 'paid') {
        setStatus('success');
        setProductType(data.product_type);
        // Refresh user data to get updated access
        if (refreshUser) refreshUser();
      } else if (data.status === 'expired') {
        setStatus('expired');
      } else {
        // Continue polling
        setAttempts(prev => prev + 1);
        setTimeout(() => pollPaymentStatus(sessionId), 2000);
      }
    } catch (error) {
      console.error('Error checking payment:', error);
      setAttempts(prev => prev + 1);
      if (attempts < maxAttempts) {
        setTimeout(() => pollPaymentStatus(sessionId), 2000);
      } else {
        setStatus('error');
      }
    }
  };

  const getProductInfo = () => {
    switch(productType) {
      case 'course': return { name: 'Trading Courses', link: '/courses' };
      case 'book': return { name: 'Trading Book', link: '/book' };
      case 'signals': return { name: 'Private Signals', link: '/signals' };
      default: return { name: 'Product', link: '/products' };
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-md mx-auto px-4">
        <Card3D className="text-center">
          {status === 'checking' && (
            <>
              <div className="animate-spin w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-6"></div>
              <h1 className="text-2xl font-bold text-white mb-4">Processing Payment...</h1>
              <p className="text-zinc-400">Please wait while we confirm your payment.</p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="text-emerald-500" size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Payment Successful!</h1>
              <p className="text-zinc-400 mb-6">
                Thank you for purchasing <span className="text-amber-500">{getProductInfo().name}</span>. 
                You now have full access.
              </p>
              <div className="space-y-3">
                <GoldButton onClick={() => navigate(getProductInfo().link)} className="w-full">
                  Access Your Content <ChevronRight size={18} />
                </GoldButton>
                <GoldButton variant="secondary" onClick={() => navigate('/profile')} className="w-full">
                  View Profile
                </GoldButton>
              </div>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="text-red-500" size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Payment Error</h1>
              <p className="text-zinc-400 mb-6">
                We couldn't verify your payment. If you were charged, please contact support.
              </p>
              <div className="space-y-3">
                <GoldButton onClick={() => navigate('/products')} className="w-full">
                  Try Again
                </GoldButton>
                <GoldButton variant="secondary" onClick={() => navigate('/support')} className="w-full">
                  Contact Support
                </GoldButton>
              </div>
            </>
          )}
          
          {status === 'expired' && (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Clock className="text-amber-500" size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Session Expired</h1>
              <p className="text-zinc-400 mb-6">
                Your payment session has expired. Please try again.
              </p>
              <GoldButton onClick={() => navigate('/products')} className="w-full">
                Return to Products
              </GoldButton>
            </>
          )}
          
          {status === 'timeout' && (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Clock className="text-amber-500" size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Verification Timeout</h1>
              <p className="text-zinc-400 mb-6">
                Payment verification is taking longer than expected. Please check your profile or contact support.
              </p>
              <div className="space-y-3">
                <GoldButton onClick={() => navigate('/profile')} className="w-full">
                  Check Profile
                </GoldButton>
                <GoldButton variant="secondary" onClick={() => navigate('/support')} className="w-full">
                  Contact Support
                </GoldButton>
              </div>
            </>
          )}
        </Card3D>
      </div>
    </PageWrapper>
  );
};

const PaymentCancelPage = () => {
  const navigate = useNavigate();

  return (
    <PageWrapper>
      <div className="max-w-md mx-auto px-4">
        <Card3D className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-700/50 flex items-center justify-center">
            <X className="text-zinc-400" size={48} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Payment Cancelled</h1>
          <p className="text-zinc-400 mb-6">
            Your payment was cancelled. No charges were made.
          </p>
          <div className="space-y-3">
            <GoldButton onClick={() => navigate('/products')} className="w-full">
              Return to Products
            </GoldButton>
            <GoldButton variant="secondary" onClick={() => navigate('/')} className="w-full">
              Go Home
            </GoldButton>
          </div>
        </Card3D>
      </div>
    </PageWrapper>
  );
};

// Content Protection Hook
const useContentProtection = () => {
  useEffect(() => {
    // Disable right-click context menu on protected content
    const handleContextMenu = (e) => {
      if (e.target.closest('.protected-content') || e.target.closest('video')) {
        e.preventDefault();
        return false;
      }
    };

    // Disable keyboard shortcuts for screenshots/dev tools
    const handleKeyDown = (e) => {
      // Disable PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        return false;
      }
      
      // Disable common screenshot shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's' || e.key === '4' || e.key === '3')) {
        e.preventDefault();
        return false;
      }
      
      // Allow dev tools for development, but could disable in production
      // if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
      //   e.preventDefault();
      //   return false;
      // }
    };

    // Blur content when window loses focus (potential screen share detection)
    const handleVisibilityChange = () => {
      const videos = document.querySelectorAll('video');
      if (document.hidden) {
        videos.forEach(v => v.pause());
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
};

// Main App
function App() {
  useContentProtection();
  
  return (
    <AuthProvider>
      <div className="App bg-black min-h-screen flex flex-col">
        <BrowserRouter>
          <Navbar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/signals" element={<SignalsPage />} />
              <Route path="/book" element={<BookPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/ai-advisor" element={<AIInvestmentPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/payment/cancel" element={<PaymentCancelPage />} />
            </Routes>
          </div>
          <Footer />
        </BrowserRouter>
        <Toaster 
          position="top-right" 
          richColors 
          closeButton 
          theme="dark"
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid #3f3f46',
              color: '#fff',
            },
          }}
        />
      </div>
    </AuthProvider>
  );
}

export default App;
