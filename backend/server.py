from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request, BackgroundTasks, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
import subprocess
import asyncio
import resend
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi.responses import RedirectResponse
from yigim_service import YigimService

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
(UPLOADS_DIR / "videos").mkdir(exist_ok=True)
(UPLOADS_DIR / "pdfs").mkdir(exist_ok=True)
(UPLOADS_DIR / "images").mkdir(exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'bull_bear_db')]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'bull-bear-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Stripe Settings
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

# Yigim.az (MAGNET) Payment Gateway Settings
YIGIM_MERCHANT = os.environ.get('YIGIM_MERCHANT', '')
YIGIM_API_KEY = os.environ.get('YIGIM_API_KEY', '')
YIGIM_BILLER = os.environ.get('YIGIM_BILLER', '')
YIGIM_TEMPLATE = os.environ.get('YIGIM_TEMPLATE', 'default')
YIGIM_SANDBOX = os.environ.get('YIGIM_SANDBOX', 'true').lower() == 'true'

# Product pricing in USD for Yigim
PRODUCTS_USD = {
    "course": {"name": "Trading Courses", "price": 49.90, "type": "one_time"},
    "book": {"name": "Trading Book", "price": 29.90, "type": "one_time"},
    "signals": {"name": "Private Signals (Monthly)", "price": 19.90, "type": "subscription"},
    "arbitrage": {"name": "Arbitrage Scanner (Monthly)", "price": 39.90, "type": "subscription"}
}

# Product pricing (server-side defined - NEVER accept amounts from frontend)
PRODUCTS = {
    "course": {"name": "Trading Courses", "price": 49.90, "type": "one_time"},
    "book": {"name": "Trading Book", "price": 29.90, "type": "one_time"},
    "signals": {"name": "Private Signals (Monthly)", "price": 19.90, "type": "subscription"},
    "arbitrage": {"name": "Arbitrage Scanner (Monthly)", "price": 39.90, "type": "subscription"}
}

# CoinMarketCap API
COINMARKETCAP_API_KEY = os.environ.get('COINMARKETCAP_API_KEY', '')

app = FastAPI(title="Bull & Bear Trading Academy API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Serve uploaded files - mount under /api/uploads for proper routing through ingress
app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# ============ EMAIL CONFIGURATION ============

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# Initialize Resend
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

async def send_email_notification(to_emails: List[str], subject: str, html_content: str):
    """Send email notification to multiple recipients (non-blocking)"""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return
    
    try:
        for email in to_emails:
            params = {
                "from": SENDER_EMAIL,
                "to": [email],
                "subject": subject,
                "html": html_content
            }
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"Email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")

def create_signal_email_html(signal: dict) -> str:
    """Create HTML email for new trading signal"""
    direction_color = "#10b981" if signal.get('direction') == 'BUY' else "#ef4444"
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #18181b; padding: 24px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #f59e0b; margin: 0;">🐂 Bull & Bear Academy</h1>
            <p style="color: #71717a; margin: 8px 0 0 0;">New Trading Signal Alert</p>
        </div>
        
        <div style="background: #27272a; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
            <h2 style="color: white; margin: 0 0 16px 0;">{signal.get('asset', 'N/A')}</h2>
            <div style="display: inline-block; background: {direction_color}; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold;">
                {signal.get('direction', 'N/A')}
            </div>
        </div>
        
        <div style="background: #27272a; padding: 20px; border-radius: 8px;">
            <table style="width: 100%; color: #a1a1aa;">
                <tr>
                    <td style="padding: 8px 0;"><strong>Entry Price:</strong></td>
                    <td style="text-align: right; color: white;">${signal.get('entry_price', 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Stop Loss:</strong></td>
                    <td style="text-align: right; color: #ef4444;">${signal.get('stop_loss', 'N/A')}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;"><strong>Take Profit 1:</strong></td>
                    <td style="text-align: right; color: #10b981;">${signal.get('take_profit_1', 'N/A')}</td>
                </tr>
            </table>
        </div>
        
        <p style="color: #71717a; font-size: 12px; text-align: center; margin-top: 24px;">
            This is a premium signal from Bull & Bear Trading Academy.<br>
            Trade responsibly and manage your risk.
        </p>
    </div>
    """

def create_news_email_html(article: dict) -> str:
    """Create HTML email for new market analysis"""
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #18181b; padding: 24px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #f59e0b; margin: 0;">🐂 Bull & Bear Academy</h1>
            <p style="color: #71717a; margin: 8px 0 0 0;">New Market Analysis</p>
        </div>
        
        <div style="background: #27272a; padding: 20px; border-radius: 8px;">
            <h2 style="color: white; margin: 0 0 16px 0;">{article.get('title', 'New Analysis')}</h2>
            <p style="color: #a1a1aa; line-height: 1.6;">
                {article.get('content', '')[:300]}...
            </p>
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
            <a href="#" style="display: inline-block; background: linear-gradient(to right, #f59e0b, #eab308); color: black; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Read Full Analysis
            </a>
        </div>
        
        <p style="color: #71717a; font-size: 12px; text-align: center; margin-top: 24px;">
            Bull & Bear Trading Academy - Professional Trading Education
        </p>
    </div>
    """

# ============ ALPHA VANTAGE MARKET DATA ============

ALPHA_VANTAGE_KEY = os.environ.get('ALPHA_VANTAGE_KEY', '')
ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"

# Simple in-memory cache for market data (5 minute TTL)
market_cache = {}
CACHE_TTL = 300  # 5 minutes

async def get_cached_market_data(cache_key: str):
    """Get data from cache if not expired"""
    if cache_key in market_cache:
        data, timestamp = market_cache[cache_key]
        if (datetime.now(timezone.utc) - timestamp).total_seconds() < CACHE_TTL:
            return data
    return None

async def set_cached_market_data(cache_key: str, data: dict):
    """Store data in cache"""
    market_cache[cache_key] = (data, datetime.now(timezone.utc))

async def fetch_alpha_vantage(function: str, **params) -> dict:
    """Fetch data from Alpha Vantage API"""
    if not ALPHA_VANTAGE_KEY:
        return {"error": "API key not configured"}
    
    cache_key = f"{function}:{':'.join(f'{k}={v}' for k,v in sorted(params.items()))}"
    cached = await get_cached_market_data(cache_key)
    if cached:
        return cached
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                ALPHA_VANTAGE_URL,
                params={"function": function, "apikey": ALPHA_VANTAGE_KEY, **params},
                timeout=10.0
            )
            data = response.json()
            
            # Check for API errors
            if "Error Message" in data or "Note" in data:
                logger.warning(f"Alpha Vantage API error: {data}")
                return {"error": data.get("Error Message") or data.get("Note")}
            
            await set_cached_market_data(cache_key, data)
            return data
    except Exception as e:
        logger.error(f"Alpha Vantage fetch error: {str(e)}")
        return {"error": str(e)}

# ============ MODELS ============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    is_admin: bool = False
    course_access: bool = False
    book_access: bool = False
    signals_subscription: bool = False
    signals_expiry: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Course(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    category: str  # beginner, advanced, psychology, risk-management, technical-analysis
    thumbnail: str = ""
    video_url: str = ""
    duration: str = ""
    order: int = 0
    is_free: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CourseCreate(BaseModel):
    title: str
    description: str
    category: str
    thumbnail: str = ""
    video_url: str = ""
    duration: str = ""
    order: int = 0
    is_free: bool = False

class Signal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    asset: str  # EURUSD, BTCUSDT, XAUUSD
    direction: str  # BUY or SELL
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: Optional[float] = None
    take_profit_3: Optional[float] = None
    risk_note: str = ""
    status: str = "active"  # active, tp_hit, sl_hit, closed
    is_pinned: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SignalCreate(BaseModel):
    asset: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: Optional[float] = None
    take_profit_3: Optional[float] = None
    risk_note: str = ""
    is_pinned: bool = False

class SignalUpdate(BaseModel):
    status: Optional[str] = None
    is_pinned: Optional[bool] = None

class NewsArticle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    image_url: str = ""
    tags: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class NewsCreate(BaseModel):
    title: str
    content: str
    image_url: str = ""
    tags: List[str] = []

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # signal, news, system
    title: str
    message: str
    link: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class UserNotification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    notification_id: str
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BookInfo(BaseModel):
    id: str = "main-book"
    title: str = "Bull & Bear Trading Mastery"
    description: str = ""
    cover_url: str = ""
    pdf_url: str = ""
    price: float = 29.90
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Purchase(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    product_type: str  # course, book, signals
    amount: float
    status: str = "completed"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    user_id: str
    user_email: str
    product_type: str
    product_name: str
    amount: float
    currency: str = "usd"
    status: str = "pending"  # pending, paid, failed, expired
    payment_status: str = "initiated"  # initiated, processing, paid, failed
    metadata: Dict[str, str] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CheckoutRequest(BaseModel):
    product_type: str  # course, book, signals
    origin_url: str  # Frontend URL for redirects
    use_crypto: bool = False  # Enable crypto/USDC payments

# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, is_admin: bool = False) -> str:
    payload = {
        'user_id': user_id,
        'is_admin': is_admin,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
        return user
    except:
        return None

async def require_admin(user: dict = Depends(get_current_user)):
    if not user.get('is_admin'):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ============ AUTH ROUTES ============

@api_router.post("/auth/register")
async def register(background_tasks: BackgroundTasks, data: UserCreate):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=data.email,
        name=data.name
    )
    user_dict = user.model_dump()
    user_dict['password_hash'] = hash_password(data.password)
    user_dict['email_notifications'] = True  # Enable email notifications by default
    
    await db.users.insert_one(user_dict)
    token = create_token(user.id, user.is_admin)
    
    # Send welcome email (background task)
    async def send_welcome_email():
        try:
            html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #f59e0b; margin: 0;">🐂 Bull & Bear Academy 🐻</h1>
                </div>
                <h2 style="color: #fff;">Welcome, {data.name}! 🎉</h2>
                <p style="color: #a1a1aa; line-height: 1.6;">
                    Thank you for joining Bull & Bear Trading Academy. You're now part of an elite community of traders.
                </p>
                <div style="background: #18181b; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #f59e0b; margin-top: 0;">What's waiting for you:</h3>
                    <ul style="color: #a1a1aa; line-height: 1.8;">
                        <li>📚 Professional trading courses</li>
                        <li>📈 Real-time trading signals</li>
                        <li>📖 Exclusive trading book</li>
                        <li>🤖 AI Investment Advisor</li>
                        <li>📰 Daily market analysis</li>
                    </ul>
                </div>
                <p style="color: #a1a1aa;">
                    You'll receive email notifications when we publish new signals, courses, and market analysis.
                </p>
                <p style="color: #71717a; font-size: 12px; margin-top: 30px;">
                    © 2025 Bull & Bear Academy. All rights reserved.
                </p>
            </div>
            """
            await send_email_notification([data.email], "🎉 Welcome to Bull & Bear Trading Academy!", html)
        except Exception as e:
            logger.error(f"Failed to send welcome email: {str(e)}")
    
    background_tasks.add_task(send_welcome_email)
    
    return {"token": token, "user": user.model_dump()}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'], user.get('is_admin', False))
    user_data = {k: v for k, v in user.items() if k != 'password_hash'}
    
    return {"token": token, "user": user_data}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    user_data = {k: v for k, v in user.items() if k != 'password_hash'}
    return user_data

# ============ COURSES ROUTES ============

@api_router.get("/courses")
async def get_courses(user: dict = Depends(get_optional_user)):
    courses = await db.courses.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return courses

@api_router.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_optional_user)):
    course = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check access
    has_access = course.get('is_free', False)
    if user and (user.get('course_access') or user.get('is_admin')):
        has_access = True
    
    if not has_access:
        course['video_url'] = ''  # Hide video URL if no access
    
    return {**course, "has_access": has_access}

@api_router.post("/courses")
async def create_course(background_tasks: BackgroundTasks, data: CourseCreate, admin: dict = Depends(require_admin)):
    course = Course(**data.model_dump())
    await db.courses.insert_one(course.model_dump())
    
    # Create notification for all users
    notification = Notification(
        type="course",
        title=f"New Course: {course.title}",
        message=f"A new {course.category} course has been added!",
        link="/courses"
    )
    await db.notifications.insert_one(notification.model_dump())
    
    # Create user notifications for all users
    users = await db.users.find({}, {"id": 1}).to_list(500)
    if users:
        user_notifications = [
            UserNotification(user_id=u['id'], notification_id=notification.id).model_dump()
            for u in users
        ]
        await db.user_notifications.insert_many(user_notifications)
    
    # Send email notifications to all users with email_notifications enabled (background task)
    async def send_course_emails():
        try:
            users_with_email = await db.users.find(
                {"email": {"$exists": True}, "email_notifications": {"$ne": False}},
                {"_id": 0, "email": 1}
            ).to_list(500)
            emails = [u['email'] for u in users_with_email if u.get('email')]
            if emails:
                html = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #f59e0b; margin: 0;">🐂 Bull & Bear Academy 🐻</h1>
                    </div>
                    <h2 style="color: #fff;">🎬 New Course Available!</h2>
                    <div style="background: #18181b; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #f59e0b; margin-top: 0;">{course.title}</h3>
                        <p style="color: #a1a1aa;">{course.description}</p>
                        <span style="background: #3b82f6; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; text-transform: uppercase;">{course.category}</span>
                    </div>
                    <p style="color: #a1a1aa;">
                        Start learning now and take your trading to the next level!
                    </p>
                    <p style="color: #71717a; font-size: 12px; margin-top: 30px;">
                        © 2025 Bull & Bear Academy. All rights reserved.
                    </p>
                </div>
                """
                await send_email_notification(emails, f"🎬 New Course: {course.title}", html)
        except Exception as e:
            logger.error(f"Failed to send course notification emails: {str(e)}")
    
    background_tasks.add_task(send_course_emails)
    
    return course.model_dump()

@api_router.put("/courses/{course_id}")
async def update_course(course_id: str, data: CourseCreate, admin: dict = Depends(require_admin)):
    result = await db.courses.update_one(
        {"id": course_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"success": True}

@api_router.delete("/courses/{course_id}")
async def delete_course(course_id: str, admin: dict = Depends(require_admin)):
    result = await db.courses.delete_one({"id": course_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"success": True}

# ============ SIGNALS ROUTES ============

@api_router.get("/signals")
async def get_signals(user: dict = Depends(get_optional_user)):
    # Check if user has signals access
    has_access = False
    if user and (user.get('signals_subscription') or user.get('is_admin')):
        has_access = True
    
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    if not has_access:
        # Return limited preview for non-subscribers
        for signal in signals:
            signal['entry_price'] = 0
            signal['stop_loss'] = 0
            signal['take_profit_1'] = 0
            signal['take_profit_2'] = None
            signal['take_profit_3'] = None
    
    return {"signals": signals, "has_access": has_access}

@api_router.post("/signals")
async def create_signal(background_tasks: BackgroundTasks, data: SignalCreate, admin: dict = Depends(require_admin)):
    signal = Signal(**data.model_dump())
    await db.signals.insert_one(signal.model_dump())
    
    # Create notification for all users
    await create_notification_for_all_users(
        notification_type="signal",
        title=f"New Signal: {signal.asset}",
        message=f"{signal.direction} signal for {signal.asset}",
        link="/signals"
    )
    
    # Send email notifications to subscribed users (background task)
    async def send_signal_emails():
        # Get users with signals subscription AND email_notifications enabled (limit to 500 for performance)
        subscribers = await db.users.find(
            {"signals_subscription": True, "email": {"$exists": True}, "email_notifications": {"$ne": False}},
            {"_id": 0, "email": 1}
        ).to_list(500)
        
        if subscribers:
            emails = [u['email'] for u in subscribers]
            html = create_signal_email_html(signal.model_dump())
            await send_email_notification(emails, f"🚀 New Signal: {signal.asset} {signal.direction}", html)
    
    background_tasks.add_task(send_signal_emails)
    
    return signal.model_dump()

@api_router.put("/signals/{signal_id}")
async def update_signal(signal_id: str, data: SignalUpdate, admin: dict = Depends(require_admin)):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.signals.update_one(
        {"id": signal_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    return {"success": True}

@api_router.delete("/signals/{signal_id}")
async def delete_signal(signal_id: str, admin: dict = Depends(require_admin)):
    result = await db.signals.delete_one({"id": signal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    return {"success": True}

# ============ NEWS ROUTES ============

@api_router.get("/news")
async def get_news():
    news = await db.news.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return news

@api_router.get("/news/{news_id}")
async def get_news_article(news_id: str):
    article = await db.news.find_one({"id": news_id}, {"_id": 0})
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article

@api_router.post("/news")
async def create_news(background_tasks: BackgroundTasks, data: NewsCreate, admin: dict = Depends(require_admin)):
    article = NewsArticle(**data.model_dump())
    await db.news.insert_one(article.model_dump())
    
    # Create notification for all users
    await create_notification_for_all_users(
        notification_type="news",
        title="New Market Analysis",
        message=article.title[:100],
        link="/news"
    )
    
    # Send email notifications to all users with email_notifications enabled (background task)
    async def send_news_emails():
        # Get all users with email AND email_notifications enabled (limit to 500 for performance)
        users = await db.users.find(
            {"email": {"$exists": True}, "email_notifications": {"$ne": False}},
            {"_id": 0, "email": 1}
        ).to_list(500)
        
        if users:
            emails = [u['email'] for u in users]
            html = create_news_email_html(article.model_dump())
            await send_email_notification(emails, f"📊 New Analysis: {article.title}", html)
    
    background_tasks.add_task(send_news_emails)
    
    return article.model_dump()

@api_router.delete("/news/{news_id}")
async def delete_news(news_id: str, admin: dict = Depends(require_admin)):
    result = await db.news.delete_one({"id": news_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"success": True}

# ============ EMAIL PREFERENCES ============

class EmailPreferences(BaseModel):
    receive_signal_emails: bool = True
    receive_news_emails: bool = True

@api_router.get("/user/email-preferences")
async def get_email_preferences(user: dict = Depends(get_current_user)):
    """Get user's email notification preferences"""
    return {
        "receive_signal_emails": user.get('receive_signal_emails', True),
        "receive_news_emails": user.get('receive_news_emails', True)
    }

@api_router.put("/user/email-preferences")
async def update_email_preferences(prefs: EmailPreferences, user: dict = Depends(get_current_user)):
    """Update user's email notification preferences"""
    await db.users.update_one(
        {"id": user['id']},
        {"$set": {
            "receive_signal_emails": prefs.receive_signal_emails,
            "receive_news_emails": prefs.receive_news_emails
        }}
    )
    return {"success": True}

@api_router.post("/admin/test-email")
async def send_test_email(admin: dict = Depends(require_admin)):
    """Send a test email to verify email configuration"""
    if not RESEND_API_KEY:
        raise HTTPException(status_code=400, detail="Email not configured")
    
    try:
        html = """
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #18181b; padding: 24px; border-radius: 12px;">
            <h1 style="color: #f59e0b; text-align: center;">🐂 Bull & Bear Academy</h1>
            <p style="color: white; text-align: center;">Email configuration is working correctly!</p>
            <p style="color: #71717a; text-align: center; font-size: 12px;">This is a test email.</p>
        </div>
        """
        await send_email_notification([admin['email']], "✅ Bull & Bear - Email Test", html)
        return {"success": True, "message": f"Test email sent to {admin['email']}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============ NOTIFICATION ROUTES ============

async def create_notification_for_all_users(notification_type: str, title: str, message: str, link: str = ""):
    """Helper function to create a notification for all users"""
    notification = Notification(
        type=notification_type,
        title=title,
        message=message,
        link=link
    )
    await db.notifications.insert_one(notification.model_dump())
    
    # Create user notifications for all users (limit to 500 for performance)
    users = await db.users.find({}, {"id": 1}).to_list(500)
    if users:
        user_notifications = [
            UserNotification(
                user_id=user['id'],
                notification_id=notification.id
            ).model_dump() for user in users
        ]
        await db.user_notifications.insert_many(user_notifications)
    
    return notification

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Get all notifications for the current user"""
    # Get user's notification read status
    user_notifs = await db.user_notifications.find(
        {"user_id": user['id']},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    if not user_notifs:
        return {"notifications": [], "unread_count": 0}
    
    # Get the actual notifications
    notification_ids = [un['notification_id'] for un in user_notifs]
    notifications = await db.notifications.find(
        {"id": {"$in": notification_ids}},
        {"_id": 0}
    ).to_list(50)
    
    # Create a map for quick lookup
    notif_map = {n['id']: n for n in notifications}
    read_map = {un['notification_id']: un['read'] for un in user_notifs}
    
    # Combine data
    result = []
    unread_count = 0
    for un in user_notifs:
        if un['notification_id'] in notif_map:
            notif = notif_map[un['notification_id']].copy()
            notif['read'] = read_map.get(un['notification_id'], False)
            notif['user_notification_id'] = un['id']
            result.append(notif)
            if not notif['read']:
                unread_count += 1
    
    return {"notifications": result, "unread_count": unread_count}

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    """Mark a notification as read"""
    result = await db.user_notifications.update_one(
        {"user_id": user['id'], "notification_id": notification_id},
        {"$set": {"read": True}}
    )
    return {"success": True}

@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read for the current user"""
    await db.user_notifications.update_many(
        {"user_id": user['id']},
        {"$set": {"read": True}}
    )
    return {"success": True}

# ============ BOOK ROUTES ============

@api_router.get("/book")
async def get_book(user: dict = Depends(get_optional_user)):
    book = await db.book.find_one({"id": "main-book"}, {"_id": 0})
    if not book:
        book = BookInfo().model_dump()
    
    has_access = False
    if user and (user.get('book_access') or user.get('is_admin')):
        has_access = True
    
    if not has_access:
        book['pdf_url'] = ''
    
    return {**book, "has_access": has_access}

@api_router.put("/book")
async def update_book(data: dict, admin: dict = Depends(require_admin)):
    data['id'] = 'main-book'
    data['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.book.update_one(
        {"id": "main-book"},
        {"$set": data},
        upsert=True
    )
    return {"success": True}

# ============ PURCHASE ROUTES ============

@api_router.post("/purchase/{product_type}")
async def purchase(product_type: str, user: dict = Depends(get_current_user)):
    prices = {
        "course": 49.90,
        "book": 29.90,
        "signals": 19.90
    }
    
    if product_type not in prices:
        raise HTTPException(status_code=400, detail="Invalid product type")
    
    # Create purchase record
    purchase = Purchase(
        user_id=user['id'],
        product_type=product_type,
        amount=prices[product_type]
    )
    await db.purchases.insert_one(purchase.model_dump())
    
    # Update user access
    update_data = {}
    if product_type == "course":
        update_data['course_access'] = True
    elif product_type == "book":
        update_data['book_access'] = True
    elif product_type == "signals":
        update_data['signals_subscription'] = True
        update_data['signals_expiry'] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    
    await db.users.update_one(
        {"id": user['id']},
        {"$set": update_data}
    )
    
    return {"success": True, "message": f"Successfully purchased {product_type}"}

@api_router.get("/purchases")
async def get_purchases(user: dict = Depends(get_current_user)):
    purchases = await db.purchases.find({"user_id": user['id']}, {"_id": 0}).to_list(100)
    return purchases

# ============ STRIPE PAYMENT ROUTES ============

@api_router.post("/checkout/create")
async def create_checkout_session(request: Request, data: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Create a Stripe checkout session for a product"""
    
    # Validate product type
    if data.product_type not in PRODUCTS:
        raise HTTPException(status_code=400, detail="Invalid product type")
    
    product = PRODUCTS[data.product_type]
    
    # Build URLs from frontend origin (NEVER hardcode)
    success_url = f"{data.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{data.origin_url}/payment/cancel"
    
    # Initialize Stripe with webhook URL
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Create checkout session with server-defined amount
    metadata = {
        "user_id": user['id'],
        "user_email": user['email'],
        "product_type": data.product_type,
        "product_name": product['name']
    }
    
    # Build checkout request - add crypto payment methods if requested
    checkout_params = {
        "amount": float(product['price']),
        "currency": "usd",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": metadata
    }
    
    # Note: Crypto payment methods (USDC) are automatically enabled when available
    # The Stripe SDK will include them based on merchant account settings
    if data.use_crypto:
        # Add a note in metadata for tracking
        checkout_params["metadata"]["payment_method"] = "crypto_enabled"
    
    checkout_request = CheckoutSessionRequest(**checkout_params)
    
    try:
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Create payment transaction record BEFORE redirect
        transaction = PaymentTransaction(
            session_id=session.session_id,
            user_id=user['id'],
            user_email=user['email'],
            product_type=data.product_type,
            product_name=product['name'],
            amount=product['price'],
            currency="usd" if not data.use_crypto else "usd_crypto",
            status="pending",
            payment_status="initiated",
            metadata=metadata
        )
        await db.payment_transactions.insert_one(transaction.model_dump())
        
        return {
            "checkout_url": session.url,
            "session_id": session.session_id
        }
    except Exception as e:
        logger.error(f"Stripe checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Payment initialization failed: {str(e)}")

@api_router.get("/checkout/status/{session_id}")
async def get_checkout_status(request: Request, session_id: str, user: dict = Depends(get_current_user)):
    """Get the status of a checkout session and process payment if successful"""
    
    # Verify the session belongs to this user
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user['id']},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed, return cached status
    if transaction['payment_status'] == 'paid':
        return {
            "status": "complete",
            "payment_status": "paid",
            "message": "Payment already processed",
            "product_type": transaction['product_type']
        }
    
    # Initialize Stripe and check status
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        checkout_status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update transaction status
        new_status = checkout_status.status
        new_payment_status = checkout_status.payment_status
        
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": new_status,
                "payment_status": new_payment_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # If payment successful, grant access (only if not already processed)
        if new_payment_status == 'paid':
            # Double-check we haven't already processed this
            existing_purchase = await db.purchases.find_one({
                "user_id": user['id'],
                "stripe_session_id": session_id
            })
            
            if not existing_purchase:
                # Create purchase record
                purchase = Purchase(
                    user_id=user['id'],
                    product_type=transaction['product_type'],
                    amount=transaction['amount'],
                    status="completed"
                )
                purchase_dict = purchase.model_dump()
                purchase_dict['stripe_session_id'] = session_id
                await db.purchases.insert_one(purchase_dict)
                
                # Grant user access based on product type
                update_data = {}
                if transaction['product_type'] == "course":
                    update_data['course_access'] = True
                elif transaction['product_type'] == "book":
                    update_data['book_access'] = True
                elif transaction['product_type'] == "signals":
                    update_data['signals_subscription'] = True
                    update_data['signals_expiry'] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                elif transaction['product_type'] == "arbitrage":
                    update_data['arbitrage_subscription'] = True
                    update_data['arbitrage_expiry'] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                
                if update_data:
                    await db.users.update_one(
                        {"id": user['id']},
                        {"$set": update_data}
                    )
                
                logger.info(f"Payment processed for user {user['id']}, product: {transaction['product_type']}")
        
        return {
            "status": new_status,
            "payment_status": new_payment_status,
            "amount_total": checkout_status.amount_total,
            "currency": checkout_status.currency,
            "product_type": transaction['product_type']
        }
    except Exception as e:
        logger.error(f"Error checking checkout status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check payment status: {str(e)}")

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        host_url = str(request.base_url).rstrip('/')
        webhook_url = f"{host_url}api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == 'paid':
            # Update transaction
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id},
                {"$set": {
                    "status": "complete",
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Get transaction details
            transaction = await db.payment_transactions.find_one(
                {"session_id": webhook_response.session_id},
                {"_id": 0}
            )
            
            if transaction:
                # Check if already processed
                existing_purchase = await db.purchases.find_one({
                    "user_id": transaction['user_id'],
                    "stripe_session_id": webhook_response.session_id
                })
                
                if not existing_purchase:
                    # Create purchase record
                    purchase = Purchase(
                        user_id=transaction['user_id'],
                        product_type=transaction['product_type'],
                        amount=transaction['amount'],
                        status="completed"
                    )
                    purchase_dict = purchase.model_dump()
                    purchase_dict['stripe_session_id'] = webhook_response.session_id
                    await db.purchases.insert_one(purchase_dict)
                    
                    # Grant user access
                    update_data = {}
                    if transaction['product_type'] == "course":
                        update_data['course_access'] = True
                    elif transaction['product_type'] == "book":
                        update_data['book_access'] = True
                    elif transaction['product_type'] == "signals":
                        update_data['signals_subscription'] = True
                        update_data['signals_expiry'] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                    
                    if update_data:
                        await db.users.update_one(
                            {"id": transaction['user_id']},
                            {"$set": update_data}
                        )
                    
                    logger.info(f"Webhook: Payment processed for user {transaction['user_id']}")
        
        return {"status": "received"}
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

# ============ YIGIM PAYMENT ROUTES (Azerbaijan) ============

class YigimCheckoutRequest(BaseModel):
    product_type: str
    origin_url: str

class YigimTransactionModel(BaseModel):
    """Yigim transaction record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    reference: str  # Yigim payment reference (also used as order_id externally)
    user_id: str
    user_email: str
    product_type: str
    product_name: str
    amount: float
    currency: str = "USD"
    currency_code: int = 840  # ISO 4217
    status: str = "pending"  # pending, success, failed
    payment_status: str = "initiated"
    yigim_status_code: Optional[str] = None  # "00" = approved
    yigim_message: Optional[str] = None
    raw_status_data: Optional[Dict] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None

def get_yigim_service() -> YigimService:
    """Get configured Yigim service instance"""
    if not YIGIM_MERCHANT or not YIGIM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Yigim payment gateway not configured. Please contact support."
        )

    return YigimService(
        merchant=YIGIM_MERCHANT,
        api_key=YIGIM_API_KEY,
        biller=YIGIM_BILLER or YIGIM_MERCHANT,
        template=YIGIM_TEMPLATE,
        base_url="",
        sandbox=YIGIM_SANDBOX
    )

async def grant_yigim_entitlement(transaction: dict) -> bool:
    """
    Idempotently grant entitlement for a successful Yigim payment.
    Returns True if entitlement was newly granted, False if already granted.
    """
    reference = transaction['reference']
    user_id = transaction['user_id']
    product_type = transaction['product_type']

    # Idempotency check on purchases collection
    existing_purchase = await db.purchases.find_one({
        "user_id": user_id,
        "yigim_reference": reference
    })
    if existing_purchase:
        return False

    # Create purchase record
    purchase = Purchase(
        user_id=user_id,
        product_type=product_type,
        amount=transaction['amount'],
        status="completed"
    )
    purchase_dict = purchase.model_dump()
    purchase_dict['yigim_reference'] = reference
    purchase_dict['currency'] = 'USD'
    purchase_dict['payment_method'] = 'yigim'
    await db.purchases.insert_one(purchase_dict)

    # Grant user access flags
    update_user_data = {}
    if product_type == "course":
        update_user_data['course_access'] = True
    elif product_type == "book":
        update_user_data['book_access'] = True
    elif product_type == "signals":
        update_user_data['signals_subscription'] = True
        update_user_data['signals_expiry'] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    elif product_type == "arbitrage":
        update_user_data['arbitrage_subscription'] = True
        update_user_data['arbitrage_expiry'] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    if update_user_data:
        await db.users.update_one(
            {"id": user_id},
            {"$set": update_user_data}
        )

    logger.info(f"Yigim entitlement granted: ref={reference}, user={user_id}, product={product_type}")

    # Send confirmation email asynchronously
    try:
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user and user.get('email'):
            product_info = PRODUCTS_USD.get(product_type, {})
            asyncio.create_task(send_payment_confirmation_email(
                user['email'],
                user.get('name', 'Customer'),
                reference,
                product_info.get('name', product_type),
                transaction['amount'],
                'USD'
            ))
    except Exception as email_error:
        logger.error(f"Failed to send confirmation email: {email_error}")

    return True


async def _refresh_yigim_status(reference: str) -> dict:
    """Re-verify a Yigim transaction status. Updates DB and grants entitlement on success.
    Returns the latest transaction document.
    """
    transaction = await db.yigim_transactions.find_one(
        {"reference": reference},
        {"_id": 0}
    )
    if not transaction:
        return None

    if transaction.get("status") == "success":
        return transaction

    yigim = get_yigim_service()
    status_data = await yigim.get_payment_status(reference)
    yigim_status = status_data.get("status")

    update_data = {
        "yigim_status_code": yigim_status,
        "yigim_message": status_data.get("message"),
        "raw_status_data": status_data,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    if yigim.is_payment_approved(yigim_status):
        update_data["status"] = "success"
        update_data["payment_status"] = "paid"
    elif yigim_status in ["S0", "S1", None]:
        # Still pending / waiting for input — don't change overall status
        pass
    else:
        update_data["status"] = "failed"
        update_data["payment_status"] = "failed"

    await db.yigim_transactions.update_one(
        {"reference": reference},
        {"$set": update_data}
    )
    transaction.update(update_data)

    if update_data.get("status") == "success":
        await grant_yigim_entitlement(transaction)

    return transaction


@api_router.post("/yigim/checkout/create")
async def create_yigim_checkout(
    request: Request,
    data: YigimCheckoutRequest,
    user: dict = Depends(get_current_user)
):
    """Create a Yigim payment session"""
    if data.product_type not in PRODUCTS_USD:
        raise HTTPException(status_code=400, detail="Invalid product type")

    product = PRODUCTS_USD[data.product_type]

    # Generate unique reference (used as order_id externally)
    reference = f"BB-{uuid.uuid4().hex[:8].upper()}-{int(datetime.now().timestamp())}"

    yigim = get_yigim_service()

    # Build callback URL — Yigim redirects user here with ?reference=...
    base_url = str(request.base_url).rstrip('/')
    if base_url.endswith('/api'):
        base_url = base_url[:-4]
    callback_url = f"{base_url}/api/yigim/callback"

    # Persist transaction BEFORE calling Yigim so failed attempts are auditable
    transaction = YigimTransactionModel(
        reference=reference,
        user_id=user['id'],
        user_email=user['email'],
        product_type=data.product_type,
        product_name=product['name'],
        amount=product['price'],
    )
    await db.yigim_transactions.insert_one(transaction.model_dump())

    result = await yigim.create_payment(
        reference=reference,
        amount=product['price'],
        currency=840,  # USD
        description=f"Bull & Bear - {product['name']}",
        language="en",
        callback_url=callback_url
    )

    if not result.get("success"):
        # Mark the transaction as failed for auditability
        await db.yigim_transactions.update_one(
            {"reference": reference},
            {"$set": {
                "status": "failed",
                "payment_status": "creation_failed",
                "yigim_message": result.get("error"),
                "raw_status_data": result,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        logger.error(f"Yigim checkout creation failed: {result}")

        # User-friendly message — different language depending on the upstream error
        upstream_error = (result.get("error") or "").lower()
        if "merchant" in upstream_error:
            user_msg = (
                "Payment provider not yet activated. The Yigim merchant account "
                "for this site is awaiting approval. Please contact support to "
                "complete your purchase."
            )
        elif "signature" in upstream_error:
            user_msg = (
                "Payment configuration error. Please contact support — our team "
                "has been notified."
            )
        else:
            user_msg = (
                f"Could not start payment: {result.get('error', 'Unknown error')}. "
                "Please try again or contact support."
            )
        raise HTTPException(status_code=502, detail=user_msg)

    logger.info(f"Yigim checkout created: ref={reference}, user={user['email']}, amount=${product['price']}")

    return {
        "success": True,
        "redirect_url": result.get("url"),
        "order_id": reference,
        "amount": product['price'],
        "currency": "USD"
    }


@api_router.get("/yigim/callback")
async def yigim_callback(reference: str):
    """
    Handle Yigim payment callback / user redirect.

    Yigim sends a GET request to this URL with ?reference=XXX after payment.
    We verify the payment status server-side, grant entitlements (idempotent),
    and redirect the user to the appropriate frontend page.
    """
    logger.info(f"Yigim callback received: reference={reference}")

    transaction = await db.yigim_transactions.find_one(
        {"reference": reference},
        {"_id": 0}
    )

    if not transaction:
        logger.error(f"Yigim callback: transaction not found for reference={reference}")
        return RedirectResponse(url=f"/payment-failed?order_id={reference}", status_code=303)

    try:
        transaction = await _refresh_yigim_status(reference) or transaction
    except Exception as e:
        logger.error(f"Yigim callback verification error: {e}")

    final_status = transaction.get("status", "pending")
    if final_status == "success":
        return RedirectResponse(url=f"/payment-success?order_id={reference}", status_code=303)
    elif final_status == "failed":
        return RedirectResponse(url=f"/payment-failed?order_id={reference}", status_code=303)
    else:
        # Still pending — send to success page; it will poll until resolved
        return RedirectResponse(url=f"/payment-success?order_id={reference}", status_code=303)

async def send_payment_confirmation_email(
    email: str, 
    name: str, 
    order_id: str, 
    product_name: str, 
    amount: float, 
    currency: str
):
    """Send payment confirmation email"""
    try:
        resend.api_key = os.environ.get('RESEND_API_KEY')
        sender = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #ffffff;">
            <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #f59e0b;">
                <h1 style="color: #f59e0b; margin: 0;">Bull & Bear</h1>
                <p style="color: #9ca3af; margin: 5px 0;">Trading Academy</p>
            </div>
            
            <div style="padding: 30px 0;">
                <h2 style="color: #22c55e;">✓ Payment Successful!</h2>
                <p>Hi {name},</p>
                <p>Your payment has been successfully processed. Thank you for your purchase!</p>
                
                <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #f59e0b; margin-top: 0;">Order Details</h3>
                    <table style="width: 100%; color: #ffffff;">
                        <tr>
                            <td style="padding: 8px 0; color: #9ca3af;">Order ID:</td>
                            <td style="padding: 8px 0; text-align: right;">{order_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #9ca3af;">Product:</td>
                            <td style="padding: 8px 0; text-align: right;">{product_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #9ca3af;">Amount:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #f59e0b;">{amount} {currency}</td>
                        </tr>
                    </table>
                </div>
                
                <p>Your purchased content is now available in your account. Login to access it.</p>
                
                <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
                    If you have any questions, please contact our support team.
                </p>
            </div>
            
            <div style="text-align: center; padding: 20px 0; border-top: 1px solid #333;">
                <p style="color: #6b7280; font-size: 12px;">
                    © 2024 Bull & Bear Trading Academy. All rights reserved.
                </p>
            </div>
        </div>
        """
        
        resend.Emails.send({
            "from": sender,
            "to": email,
            "subject": f"Payment Confirmed - {product_name}",
            "html": html_content
        })
        
        logger.info(f"Payment confirmation email sent to {email}")
        
    except Exception as e:
        logger.error(f"Failed to send payment confirmation email: {e}")

@api_router.get("/yigim/status/{order_id}")
async def get_yigim_payment_status(
    order_id: str,
    user: dict = Depends(get_current_user)
):
    """Get/refresh payment status for a Yigim order. Grants entitlement on success."""

    transaction = await db.yigim_transactions.find_one(
        {"reference": order_id, "user_id": user['id']},
        {"_id": 0}
    )

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # If terminal status, return cached
    if transaction['status'] in ['success', 'failed']:
        return {
            "order_id": order_id,
            "status": transaction['status'],
            "payment_status": transaction['payment_status'],
            "product_type": transaction['product_type'],
            "amount": transaction['amount'],
            "currency": "USD",
            "message": transaction.get('yigim_message')
        }

    # Otherwise, refresh from Yigim
    try:
        transaction = await _refresh_yigim_status(order_id) or transaction

        return {
            "order_id": order_id,
            "status": transaction.get("status", "pending"),
            "payment_status": transaction.get("payment_status", "pending"),
            "product_type": transaction['product_type'],
            "amount": transaction['amount'],
            "currency": "USD",
            "message": transaction.get('yigim_message')
        }

    except Exception as e:
        logger.error(f"Error checking Yigim status: {e}")
        return {
            "order_id": order_id,
            "status": transaction['status'],
            "payment_status": transaction['payment_status'],
            "product_type": transaction['product_type'],
            "amount": transaction['amount'],
            "currency": "USD"
        }

@api_router.get("/yigim/transaction/{order_id}")
async def get_yigim_transaction_details(
    order_id: str,
    user: dict = Depends(get_current_user)
):
    """Get full transaction details for display on success/failure pages.

    Re-verifies status with Yigim if still pending — this guarantees entitlements
    are granted even if Yigim's redirect callback was missed.
    """

    transaction = await db.yigim_transactions.find_one(
        {"reference": order_id, "user_id": user['id']},
        {"_id": 0}
    )

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Refresh if still pending
    if transaction['status'] == 'pending':
        try:
            transaction = await _refresh_yigim_status(order_id) or transaction
        except Exception as e:
            logger.error(f"Yigim transaction details refresh error: {e}")

    return {
        "order_id": transaction['reference'],
        "product_type": transaction['product_type'],
        "product_name": transaction['product_name'],
        "amount": transaction['amount'],
        "currency": "USD",
        "status": transaction['status'],
        "payment_status": transaction['payment_status'],
        "transaction_id": transaction.get('reference'),
        "bank_transaction": None,
        "rrn": None,
        "message": transaction.get('yigim_message'),
        "created_at": transaction['created_at'],
        "updated_at": transaction.get('updated_at')
    }

@api_router.get("/yigim/prices")
async def get_yigim_prices():
    """Get product prices in USD"""
    return {
        "currency": "USD",
        "products": {
            key: {
                "name": val["name"],
                "price": val["price"],
                "type": val["type"]
            }
            for key, val in PRODUCTS_USD.items()
        }
    }

# ============ ADMIN ROUTES ============

# Video conversion status tracking
video_conversion_status = {}

def convert_video_sync(input_path: str, output_path: str, task_id: str):
    """Synchronous video conversion using ffmpeg (runs in background)"""
    try:
        video_conversion_status[task_id] = {"status": "processing", "progress": 0}
        
        # FFmpeg command to convert to MP4 with H.264 codec
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)  # 30 min timeout
        
        if result.returncode == 0:
            video_conversion_status[task_id] = {"status": "completed", "output_path": output_path}
            # Delete original file
            os.remove(input_path)
            logger.info(f"Video conversion completed: {output_path}")
        else:
            video_conversion_status[task_id] = {"status": "failed", "error": result.stderr[:500]}
            logger.error(f"Video conversion failed: {result.stderr[:500]}")
    except Exception as e:
        video_conversion_status[task_id] = {"status": "failed", "error": str(e)}
        logger.error(f"Video conversion error: {str(e)}")

@api_router.post("/admin/convert-video")
async def convert_video(background_tasks: BackgroundTasks, data: dict, admin: dict = Depends(require_admin)):
    """Convert a video file from MOV to MP4"""
    video_url = data.get('video_url', '')
    
    # Extract filename from URL
    if '/api/uploads/videos/' in video_url:
        filename = video_url.split('/api/uploads/videos/')[-1]
    elif '/uploads/videos/' in video_url:
        filename = video_url.split('/uploads/videos/')[-1]
    else:
        raise HTTPException(status_code=400, detail="Invalid video URL")
    
    input_path = str(UPLOADS_DIR / 'videos' / filename)
    
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Check if already MP4
    if filename.lower().endswith('.mp4'):
        return {"message": "Video is already MP4", "status": "completed"}
    
    # Generate output path
    output_filename = os.path.splitext(filename)[0] + '.mp4'
    output_path = str(UPLOADS_DIR / 'videos' / output_filename)
    
    # Create task ID
    task_id = str(uuid.uuid4())
    
    # Start background conversion
    background_tasks.add_task(convert_video_sync, input_path, output_path, task_id)
    
    return {
        "task_id": task_id,
        "status": "started",
        "output_url": f"/api/uploads/videos/{output_filename}"
    }

@api_router.get("/admin/convert-video/status/{task_id}")
async def get_conversion_status(task_id: str, admin: dict = Depends(require_admin)):
    """Check video conversion status"""
    if task_id not in video_conversion_status:
        return {"status": "unknown"}
    return video_conversion_status[task_id]

@api_router.get("/admin/videos")
async def get_all_videos(admin: dict = Depends(require_admin)):
    """Get list of all video files with their formats"""
    videos_dir = UPLOADS_DIR / 'videos'
    videos = []
    
    if videos_dir.exists():
        for file in videos_dir.iterdir():
            if file.is_file():
                stat = file.stat()
                videos.append({
                    "filename": file.name,
                    "url": f"/api/uploads/videos/{file.name}",
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "format": file.suffix.lower(),
                    "needs_conversion": file.suffix.lower() in ['.mov', '.avi', '.wmv', '.mkv']
                })
    
    return {"videos": videos}

@api_router.get("/admin/users")
async def get_users(admin: dict = Depends(require_admin), skip: int = 0, limit: int = 100):
    # Paginated user list (max 100 per request)
    limit = min(limit, 100)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    return users

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, data: dict, admin: dict = Depends(require_admin)):
    # Remove sensitive fields
    data.pop('password_hash', None)
    data.pop('id', None)
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}

@api_router.get("/admin/stats")
async def get_stats(admin: dict = Depends(require_admin)):
    users_count = await db.users.count_documents({})
    courses_count = await db.courses.count_documents({})
    signals_count = await db.signals.count_documents({})
    purchases_count = await db.purchases.count_documents({})
    
    return {
        "users": users_count,
        "courses": courses_count,
        "signals": signals_count,
        "purchases": purchases_count
    }

# ============ AI INVESTMENT MANAGER ============

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# AI Investment Manager System Prompt
AI_INVESTMENT_SYSTEM_PROMPT = """You are an expert AI Investment Manager for Bull & Bear Trading Academy. You help users with:

1. **Market Analysis**: Analyze crypto (Bitcoin, Ethereum, etc.), precious metals (Gold, Silver), forex, and stocks
2. **Investment Advice**: Provide personalized investment strategies based on risk tolerance and goals
3. **Trading Education**: Explain trading concepts, strategies, and terminology
4. **Risk Management**: Help users understand and manage investment risks

IMPORTANT GUIDELINES:
- Always provide balanced, educational advice
- Include risk disclaimers when giving investment suggestions
- Use real market data when available
- Explain complex concepts in simple terms
- Be encouraging but realistic about potential returns
- Never guarantee profits or specific returns
- Recommend diversification and proper position sizing

Current market context will be provided with each message when available.

Format your responses with clear sections using markdown:
- Use **bold** for key points
- Use bullet points for lists
- Use code blocks for numerical data
- Keep responses concise but informative"""

class AIChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    include_market_data: bool = True

class AIChatResponse(BaseModel):
    response: str
    session_id: str
    market_context: Optional[Dict] = None

# Store active chat sessions
ai_chat_sessions: Dict[str, LlmChat] = {}

async def get_market_context() -> str:
    """Get current market data for AI context"""
    try:
        # Fetch current market data
        context_parts = []
        
        # Get forex
        for pair in [("EUR", "USD"), ("GBP", "USD")]:
            data = await fetch_alpha_vantage("CURRENCY_EXCHANGE_RATE", from_currency=pair[0], to_currency=pair[1])
            if "Realtime Currency Exchange Rate" in data:
                rate = data["Realtime Currency Exchange Rate"].get("5. Exchange Rate", "N/A")
                context_parts.append(f"{pair[0]}/{pair[1]}: {rate}")
        
        # Get crypto
        for crypto in ["BTC", "ETH"]:
            data = await fetch_alpha_vantage("CURRENCY_EXCHANGE_RATE", from_currency=crypto, to_currency="USD")
            if "Realtime Currency Exchange Rate" in data:
                rate = data["Realtime Currency Exchange Rate"].get("5. Exchange Rate", "N/A")
                context_parts.append(f"{crypto}/USD: ${float(rate):,.2f}" if rate != "N/A" else f"{crypto}/USD: N/A")
        
        if context_parts:
            return "Current Market Data:\n" + "\n".join(context_parts)
        return ""
    except Exception as e:
        logger.error(f"Error fetching market context: {e}")
        return ""

@api_router.post("/ai/chat")
async def ai_chat(data: AIChatMessage, user: dict = Depends(get_current_user)):
    """Chat with AI Investment Manager"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Generate or use existing session ID
    session_id = data.session_id or f"ai-{user['id']}-{uuid.uuid4().hex[:8]}"
    
    # Get or create chat session
    if session_id not in ai_chat_sessions:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=AI_INVESTMENT_SYSTEM_PROMPT
        ).with_model("gemini", "gemini-3-flash-preview")
        ai_chat_sessions[session_id] = chat
    else:
        chat = ai_chat_sessions[session_id]
    
    # Build message with market context
    message_text = data.message
    market_context = None
    
    if data.include_market_data:
        context = await get_market_context()
        if context:
            message_text = f"{context}\n\nUser Question: {data.message}"
            market_context = {"fetched": True}
    
    try:
        # Send message to AI
        user_message = UserMessage(text=message_text)
        response = await chat.send_message(user_message)
        
        # Store in database for history
        await db.ai_chats.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user['id'],
            "session_id": session_id,
            "user_message": data.message,
            "ai_response": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return AIChatResponse(
            response=response,
            session_id=session_id,
            market_context=market_context
        )
    except Exception as e:
        logger.error(f"AI chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

@api_router.get("/ai/history")
async def get_ai_chat_history(session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get AI chat history for user"""
    query = {"user_id": user['id']}
    if session_id:
        query["session_id"] = session_id
    
    history = await db.ai_chats.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"history": history}

@api_router.get("/ai/sessions")
async def get_ai_sessions(user: dict = Depends(get_current_user)):
    """Get list of AI chat sessions for user"""
    pipeline = [
        {"$match": {"user_id": user['id']}},
        {"$group": {
            "_id": "$session_id",
            "last_message": {"$last": "$user_message"},
            "created_at": {"$first": "$created_at"},
            "message_count": {"$sum": 1}
        }},
        {"$sort": {"created_at": -1}},
        {"$limit": 20}
    ]
    sessions = await db.ai_chats.aggregate(pipeline).to_list(20)
    return {"sessions": [{"session_id": s["_id"], "last_message": s["last_message"][:50], "message_count": s["message_count"]} for s in sessions]}

@api_router.delete("/ai/session/{session_id}")
async def delete_ai_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete an AI chat session"""
    result = await db.ai_chats.delete_many({"user_id": user['id'], "session_id": session_id})
    if session_id in ai_chat_sessions:
        del ai_chat_sessions[session_id]
    return {"deleted": result.deleted_count}

# ============ CRYPTO ARBITRAGE SCANNER (Simplified) ============

import aiohttp
import time

# Exchange API endpoints
EXCHANGE_APIS = {
    "binance": "https://api.binance.com/api/v3/ticker/price",
    "bybit": "https://api.bybit.com/v5/market/tickers?category=spot",
    "okx": "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
    "gateio": "https://api.gateio.ws/api/v4/spot/tickers",
    "bingx": "https://open-api.bingx.com/openApi/spot/v1/ticker/24hr",
    "kucoin": "https://api.kucoin.com/api/v1/market/allTickers",
    "mexc": "https://api.mexc.com/api/v3/ticker/price"
}

# Trading fees per exchange (taker fee)
EXCHANGE_FEES = {
    "Binance": 0.001,   # 0.1%
    "Bybit": 0.001,     # 0.1%
    "OKX": 0.001,       # 0.1%
    "Gate.io": 0.002,   # 0.2%
    "BingX": 0.001,     # 0.1%
    "KuCoin": 0.001,    # 0.1%
    "MEXC": 0.001       # 0.1%
}

# Estimated withdrawal fees in USD
WITHDRAWAL_FEES_USD = {
    "Binance": 1.0,
    "Bybit": 1.0,
    "OKX": 1.0,
    "Gate.io": 2.0,
    "BingX": 1.5,
    "KuCoin": 1.5,
    "MEXC": 1.0
}

# Major USDT trading pairs — dynamically fetched from CoinMarketCap top 1000
# Cache to avoid hitting API rate limits on every 10s scan
_cmc_cache = {"symbols": set(), "last_fetched": 0}
CMC_CACHE_TTL = 300  # refresh coin list every 5 minutes


async def fetch_top_coin_symbols():
    """Fetch top 1000 coin symbols from CoinMarketCap (cached for 5 min)"""
    now = time.time()
    if _cmc_cache["symbols"] and (now - _cmc_cache["last_fetched"]) < CMC_CACHE_TTL:
        return _cmc_cache["symbols"]

    if not COINMARKETCAP_API_KEY:
        logger.warning("CoinMarketCap API key not configured, using fallback list")
        return _cmc_cache["symbols"] or _FALLBACK_COINS

    url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest"
    headers = {"X-CMC_PRO_API_KEY": COINMARKETCAP_API_KEY, "Accept": "application/json"}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params={"limit": 1000, "convert": "USD"}, timeout=20) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    symbols = {coin["symbol"] for coin in data.get("data", [])}
                    _cmc_cache["symbols"] = symbols
                    _cmc_cache["last_fetched"] = now
                    logger.info(f"Fetched {len(symbols)} coins from CoinMarketCap top 1000")
                    return symbols
                else:
                    logger.error(f"CoinMarketCap API error: {resp.status}")
    except Exception as e:
        logger.error(f"CoinMarketCap fetch error: {e}")

    return _cmc_cache["symbols"] or _FALLBACK_COINS


# Fallback list if CoinMarketCap API is unavailable
_FALLBACK_COINS = {
    "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK",
    "MATIC", "UNI", "ATOM", "LTC", "ETC", "FIL", "NEAR", "APT", "ARB", "OP",
    "AAVE", "MKR", "CRV", "INJ", "SUI", "SEI", "TIA", "JUP", "PEPE", "SHIB",
    "TRX", "TON", "BCH", "ICP", "HBAR", "VET", "ALGO", "FTM", "RENDER", "GRT",
    "WLD", "BONK", "FLOKI", "TAO", "STX", "IMX", "MANA", "SAND", "AXS", "ENS"
}

# Trading capital for profit estimation
TRADING_CAPITAL = 200

# Estimated slippage
ESTIMATED_SLIPPAGE = 0.002  # 0.2%

# Minimum net spread filter (1% after fees)
MIN_NET_SPREAD = 1.0


async def fetch_binance_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["binance"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["symbol"][:-4]: float(item["price"])
                            for item in data
                            if item["symbol"].endswith("USDT") and not item["symbol"][:-4].endswith("DOWN") and not item["symbol"][:-4].endswith("UP")}
    except Exception as e:
        logger.error(f"Binance API error: {e}")
    return {}

async def fetch_bybit_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["bybit"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["symbol"][:-4]: float(item.get("lastPrice", 0))
                            for item in data.get("result", {}).get("list", [])
                            if item.get("symbol", "").endswith("USDT")}
    except Exception as e:
        logger.error(f"Bybit API error: {e}")
    return {}

async def fetch_okx_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["okx"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["instId"][:-5]: float(item.get("last", 0))
                            for item in data.get("data", [])
                            if item.get("instId", "").endswith("-USDT")}
    except Exception as e:
        logger.error(f"OKX API error: {e}")
    return {}

async def fetch_gateio_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["gateio"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["currency_pair"][:-5]: float(item.get("last", 0))
                            for item in data
                            if item.get("currency_pair", "").endswith("_USDT")}
    except Exception as e:
        logger.error(f"Gate.io API error: {e}")
    return {}

async def fetch_bingx_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["bingx"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["symbol"].split("-")[0]: float(item.get("lastPrice", 0))
                            for item in data.get("data", [])
                            if "-USDT" in item.get("symbol", "")}
    except Exception as e:
        logger.error(f"BingX API error: {e}")
    return {}

async def fetch_kucoin_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["kucoin"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["symbol"][:-5]: float(item.get("last", 0))
                            for item in data.get("data", {}).get("ticker", [])
                            if item.get("symbol", "").endswith("-USDT")}
    except Exception as e:
        logger.error(f"KuCoin API error: {e}")
    return {}

async def fetch_mexc_prices():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(EXCHANGE_APIS["mexc"], timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return {item["symbol"][:-4]: float(item.get("price", 0))
                            for item in data
                            if item.get("symbol", "").endswith("USDT")}
    except Exception as e:
        logger.error(f"MEXC API error: {e}")
    return {}


async def scan_arbitrage_simple():
    """
    Simple arbitrage scanner:
    - Fetches top 1000 coins from CoinMarketCap
    - Fetches USDT prices from 7 exchanges
    - Filters to only CoinMarketCap top 1000 coins
    - Finds best buy/sell per coin
    - Calculates net spread after all fees
    - Filters by 1% minimum net spread
    - Returns best opportunity per coin, sorted by net spread
    """
    # Fetch top 1000 coin symbols and exchange prices concurrently
    top_coins, *exchange_prices = await asyncio.gather(
        fetch_top_coin_symbols(),
        fetch_binance_prices(),
        fetch_bybit_prices(),
        fetch_okx_prices(),
        fetch_gateio_prices(),
        fetch_bingx_prices(),
        fetch_kucoin_prices(),
        fetch_mexc_prices(),
        return_exceptions=True
    )

    # Handle fetch_top_coin_symbols failure
    if isinstance(top_coins, Exception) or not top_coins:
        top_coins = _FALLBACK_COINS

    exchange_names = ["Binance", "Bybit", "OKX", "Gate.io", "BingX", "KuCoin", "MEXC"]
    connected = sum(1 for p in exchange_prices if isinstance(p, dict) and p)

    # Build price map: {coin: {exchange: price}} — only for top 1000 coins
    all_prices = {}
    for i, prices in enumerate(exchange_prices):
        if isinstance(prices, dict):
            name = exchange_names[i]
            for symbol, price in prices.items():
                if price > 0 and symbol in top_coins:
                    if symbol not in all_prices:
                        all_prices[symbol] = {}
                    all_prices[symbol][name] = price

    # Find best opportunity per coin
    opportunities = []
    for symbol, prices_by_exchange in all_prices.items():
        if len(prices_by_exchange) < 2:
            continue

        items = list(prices_by_exchange.items())
        buy_exchange, buy_price = min(items, key=lambda x: x[1])
        sell_exchange, sell_price = max(items, key=lambda x: x[1])

        if buy_price <= 0 or buy_exchange == sell_exchange:
            continue

        # Gross spread
        gross_spread = (sell_price - buy_price) / buy_price

        # Cap at 50% to filter ticker collisions (same symbol, different tokens)
        if gross_spread > 0.50:
            continue

        # Fees
        buy_fee = EXCHANGE_FEES.get(buy_exchange, 0.001)
        sell_fee = EXCHANGE_FEES.get(sell_exchange, 0.001)
        withdrawal_fee_usd = WITHDRAWAL_FEES_USD.get(buy_exchange, 2.0)
        withdrawal_fee_pct = withdrawal_fee_usd / TRADING_CAPITAL

        # Net spread after all fees
        net_spread = gross_spread - buy_fee - sell_fee - ESTIMATED_SLIPPAGE - withdrawal_fee_pct
        net_spread_pct = round(net_spread * 100, 2)

        # Filter: minimum 1% net spread
        if net_spread_pct < MIN_NET_SPREAD:
            continue

        net_profit = round(TRADING_CAPITAL * net_spread, 2)

        opportunities.append({
            "coin": symbol,
            "buy_exchange": buy_exchange,
            "buy_price": buy_price,
            "sell_exchange": sell_exchange,
            "sell_price": sell_price,
            "net_spread_pct": net_spread_pct,
            "net_profit_usd": net_profit,
        })

    # Sort by highest net spread
    opportunities.sort(key=lambda x: -x["net_spread_pct"])

    return {
        "opportunities": opportunities,
        "exchanges_connected": connected,
        "coins_scanned": len(all_prices),
        "capital": TRADING_CAPITAL,
        "min_spread_filter": MIN_NET_SPREAD,
        "scan_time": datetime.now(timezone.utc).isoformat()
    }


@api_router.get("/arbitrage/scan")
async def get_arbitrage_scan(user: dict = Depends(get_optional_user)):
    """Simple crypto arbitrage scan - major USDT pairs only"""
    has_access = False
    if user and (user.get('arbitrage_subscription') or user.get('is_admin')):
        has_access = True

    if not has_access:
        return {
            "opportunities": [],
            "has_access": False,
            "message": "Subscribe to access the arbitrage scanner",
        }

    try:
        result = await scan_arbitrage_simple()
        result["has_access"] = True
        return result
    except Exception as e:
        logger.error(f"Arbitrage scan error: {e}")
        raise HTTPException(status_code=500, detail="Failed to scan arbitrage opportunities")

@api_router.get("/arbitrage/status")
async def get_arbitrage_status(user: dict = Depends(get_optional_user)):
    """Get user's arbitrage subscription status"""
    has_access = False
    if user and (user.get('arbitrage_subscription') or user.get('is_admin')):
        has_access = True

    return {
        "has_access": has_access,
        "price": PRODUCTS["arbitrage"]["price"],
        "features": [
            "Top 1000 CoinMarketCap coins across 7 exchanges",
            "Net spread after all fees & commissions",
            "Auto-refresh every 10 seconds",
            "Sorted by highest profit opportunity"
        ]
    }

# ============ MARKET DATA (Alpha Vantage) ============

# Fallback mock data for when API is unavailable
FALLBACK_MARKET_DATA = {
    "forex": [
        {"symbol": "EUR/USD", "price": 1.0847, "change": 0.15},
        {"symbol": "GBP/USD", "price": 1.2634, "change": -0.08},
        {"symbol": "USD/JPY", "price": 154.32, "change": 0.22}
    ],
    "crypto": [
        {"symbol": "BTC/USD", "price": 67842.50, "change": 2.34},
        {"symbol": "ETH/USD", "price": 3521.80, "change": 1.87},
        {"symbol": "SOL/USD", "price": 142.65, "change": -1.23}
    ],
    "indices": [
        {"symbol": "S&P 500", "price": 5234.18, "change": 0.45},
        {"symbol": "NASDAQ", "price": 16428.82, "change": 0.67},
        {"symbol": "DOW", "price": 39127.80, "change": 0.32}
    ]
}

@api_router.get("/market")
async def get_market_data():
    """Get real-time market data from Alpha Vantage"""
    if not ALPHA_VANTAGE_KEY:
        return FALLBACK_MARKET_DATA
    
    result = {"forex": [], "crypto": [], "indices": []}
    
    # Forex pairs
    forex_pairs = [("EUR", "USD"), ("GBP", "USD"), ("USD", "JPY")]
    for from_curr, to_curr in forex_pairs:
        data = await fetch_alpha_vantage("CURRENCY_EXCHANGE_RATE", from_currency=from_curr, to_currency=to_curr)
        if "Realtime Currency Exchange Rate" in data:
            rate_data = data["Realtime Currency Exchange Rate"]
            price = float(rate_data.get("5. Exchange Rate", 0))
            result["forex"].append({
                "symbol": f"{from_curr}/{to_curr}",
                "price": round(price, 4),
                "change": round((price - float(rate_data.get("5. Exchange Rate", price))) / price * 100, 2)
            })
        else:
            # Use fallback for this pair
            fallback = next((f for f in FALLBACK_MARKET_DATA["forex"] if f["symbol"] == f"{from_curr}/{to_curr}"), None)
            if fallback:
                result["forex"].append(fallback)
    
    # Crypto - BTC and ETH
    crypto_symbols = ["BTC", "ETH"]
    for symbol in crypto_symbols:
        data = await fetch_alpha_vantage("CURRENCY_EXCHANGE_RATE", from_currency=symbol, to_currency="USD")
        if "Realtime Currency Exchange Rate" in data:
            rate_data = data["Realtime Currency Exchange Rate"]
            price = float(rate_data.get("5. Exchange Rate", 0))
            result["crypto"].append({
                "symbol": f"{symbol}/USD",
                "price": round(price, 2),
                "change": round((hash(symbol) % 500 - 250) / 100, 2)  # Simulated change
            })
        else:
            fallback = next((c for c in FALLBACK_MARKET_DATA["crypto"] if c["symbol"] == f"{symbol}/USD"), None)
            if fallback:
                result["crypto"].append(fallback)
    
    # Add SOL from fallback (Alpha Vantage doesn't support all cryptos)
    result["crypto"].append(FALLBACK_MARKET_DATA["crypto"][2])
    
    # Indices - Use Global Quote for major ETFs as proxy
    indices_symbols = [("SPY", "S&P 500"), ("QQQ", "NASDAQ"), ("DIA", "DOW")]
    for symbol, display_name in indices_symbols:
        data = await fetch_alpha_vantage("GLOBAL_QUOTE", symbol=symbol)
        if "Global Quote" in data and data["Global Quote"]:
            quote = data["Global Quote"]
            price = float(quote.get("05. price", 0))
            change_pct = float(quote.get("10. change percent", "0%").replace("%", ""))
            
            # Convert ETF price to approximate index value
            multiplier = {"SPY": 10, "QQQ": 100, "DIA": 100}.get(symbol, 1)
            result["indices"].append({
                "symbol": display_name,
                "price": round(price * multiplier, 2),
                "change": round(change_pct, 2)
            })
        else:
            fallback = next((i for i in FALLBACK_MARKET_DATA["indices"] if i["symbol"] == display_name), None)
            if fallback:
                result["indices"].append(fallback)
    
    # If all categories are empty, return fallback
    if not result["forex"] and not result["crypto"] and not result["indices"]:
        return FALLBACK_MARKET_DATA
    
    return result

@api_router.get("/market/quote/{symbol}")
async def get_stock_quote(symbol: str):
    """Get real-time quote for a specific stock symbol"""
    data = await fetch_alpha_vantage("GLOBAL_QUOTE", symbol=symbol.upper())
    
    if "Global Quote" in data and data["Global Quote"]:
        quote = data["Global Quote"]
        return {
            "symbol": quote.get("01. symbol"),
            "price": float(quote.get("05. price", 0)),
            "change": float(quote.get("09. change", 0)),
            "change_percent": quote.get("10. change percent", "0%"),
            "volume": int(quote.get("06. volume", 0)),
            "latest_trading_day": quote.get("07. latest trading day")
        }
    
    raise HTTPException(status_code=404, detail=f"Quote not found for {symbol}")

@api_router.get("/market/forex/{from_currency}/{to_currency}")
async def get_forex_rate(from_currency: str, to_currency: str):
    """Get real-time forex exchange rate"""
    data = await fetch_alpha_vantage(
        "CURRENCY_EXCHANGE_RATE", 
        from_currency=from_currency.upper(), 
        to_currency=to_currency.upper()
    )
    
    if "Realtime Currency Exchange Rate" in data:
        rate_data = data["Realtime Currency Exchange Rate"]
        return {
            "from": rate_data.get("1. From_Currency Code"),
            "to": rate_data.get("3. To_Currency Code"),
            "rate": float(rate_data.get("5. Exchange Rate", 0)),
            "last_refreshed": rate_data.get("6. Last Refreshed")
        }
    
    raise HTTPException(status_code=404, detail=f"Rate not found for {from_currency}/{to_currency}")

@api_router.get("/")
async def root():
    return {"message": "Bull & Bear Trading Academy API", "version": "1.0.0"}

# ============ VIDEO STREAMING ROUTE ============

from fastapi.responses import StreamingResponse, Response
import mimetypes

@api_router.get("/stream/video/{filename}")
async def stream_video(filename: str, request: Request):
    """Stream video with proper range request support for browser playback"""
    video_path = UPLOADS_DIR / 'videos' / filename
    
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_size = video_path.stat().st_size
    
    # Parse range header
    range_header = request.headers.get('range')
    
    if range_header:
        # Parse "bytes=start-end"
        range_match = range_header.replace('bytes=', '').split('-')
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        
        if start >= file_size:
            raise HTTPException(status_code=416, detail="Range not satisfiable")
        
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        def iter_file():
            with open(video_path, 'rb') as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(65536, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
        
        headers = {
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Accept-Ranges': 'bytes',
            'Content-Length': str(content_length),
            'Content-Type': 'video/mp4',
        }
        
        return StreamingResponse(iter_file(), status_code=206, headers=headers, media_type='video/mp4')
    else:
        # No range header - return full file
        def iter_full_file():
            with open(video_path, 'rb') as f:
                while True:
                    data = f.read(65536)
                    if not data:
                        break
                    yield data
        
        headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': str(file_size),
            'Content-Type': 'video/mp4',
        }
        
        return StreamingResponse(iter_full_file(), headers=headers, media_type='video/mp4')

@api_router.head("/stream/video/{filename}")
async def stream_video_head(filename: str):
    """HEAD request for video metadata"""
    video_path = UPLOADS_DIR / 'videos' / filename
    
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_size = video_path.stat().st_size
    
    headers = {
        'Accept-Ranges': 'bytes',
        'Content-Length': str(file_size),
        'Content-Type': 'video/mp4',
    }
    
    return Response(content=b'', headers=headers, media_type='video/mp4')

# ============ DOWNLOAD ROUTES ============

from fastapi.responses import FileResponse

@api_router.get("/download/book")
async def download_book(user: dict = Depends(get_current_user)):
    """Download the book PDF for offline reading"""
    # Check if user has book access
    if not user.get('book_access') and not user.get('is_admin'):
        raise HTTPException(status_code=403, detail="You don't have access to this book")
    
    # Get book info
    book = await db.book.find_one({"id": "main-book"}, {"_id": 0})
    if not book or not book.get('pdf_url'):
        raise HTTPException(status_code=404, detail="Book PDF not found")
    
    # Extract filename from URL
    pdf_url = book['pdf_url']
    if '/api/uploads/pdfs/' in pdf_url:
        filename = pdf_url.split('/api/uploads/pdfs/')[-1]
    elif '/uploads/pdfs/' in pdf_url:
        filename = pdf_url.split('/uploads/pdfs/')[-1]
    else:
        raise HTTPException(status_code=404, detail="Invalid PDF URL")
    
    file_path = UPLOADS_DIR / 'pdfs' / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    # Return file with download headers
    download_name = f"{book.get('title', 'BullBear-Trading-Book').replace(' ', '-')}.pdf"
    return FileResponse(
        path=str(file_path),
        media_type='application/pdf',
        filename=download_name,
        headers={"Content-Disposition": f"attachment; filename={download_name}"}
    )

# ============ FILE UPLOAD ROUTES ============

ALLOWED_VIDEO_EXTENSIONS = [
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
    '.3gp', '.ts', '.mts', '.mpg', '.mpeg', '.vob', '.ogv', '.f4v',
    '.rm', '.rmvb', '.asf', '.divx', '.mxf', '.m2ts', '.m2v', '.dat'
]

# In-memory registry of in-flight chunked uploads
# (process-local — fine because supervisord runs a single backend instance)
CHUNK_UPLOADS_DIR = UPLOADS_DIR / "_chunks"
CHUNK_UPLOADS_DIR.mkdir(exist_ok=True)
chunk_uploads: Dict[str, Dict] = {}

# In-memory registry of background ffmpeg conversions
# Each entry: {status: 'processing'|'completed'|'failed', result?: dict, error?: str, started_at}
video_jobs: Dict[str, Dict] = {}


def _process_uploaded_video_sync(temp_path: Path, file_ext: str, base_name: str) -> Dict:
    """
    Run ffmpeg validation + conversion on an already-saved video file.
    Synchronous — call via `asyncio.to_thread()` from async code so the
    event loop stays responsive during multi-minute conversions.
    """
    temp_filename = temp_path.name
    file_size = temp_path.stat().st_size
    logger.info(f"Processing {temp_filename} ({file_size / (1024*1024):.1f} MB)")

    ffmpeg_available = bool(shutil.which('ffmpeg'))

    if ffmpeg_available:
        try:
            probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=codec_type', '-of', 'csv=p=0',
                 str(temp_path)],
                capture_output=True, text=True, timeout=30
            )
            if 'video' not in probe.stdout:
                os.remove(temp_path)
                raise HTTPException(status_code=400, detail="File does not contain a valid video stream")
        except subprocess.TimeoutExpired:
            pass
        except HTTPException:
            raise
        except Exception:
            pass

    has_audio = True
    if ffmpeg_available:
        try:
            audio_probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
                 '-show_entries', 'stream=codec_type', '-of', 'csv=p=0',
                 str(temp_path)],
                capture_output=True, text=True, timeout=30
            )
            has_audio = 'audio' in audio_probe.stdout
        except Exception:
            has_audio = True

    needs_conversion = file_ext != '.mp4'

    if not ffmpeg_available and needs_conversion:
        logger.warning(f"ffmpeg not available, keeping original {file_ext}")
        return {
            "url": f"/api/uploads/videos/{temp_filename}",
            "filename": temp_filename,
            "converted": False,
            "error": "Video saved but not converted (ffmpeg unavailable). It may not play in all browsers."
        }

    if needs_conversion:
        output_filename = f"{base_name}.mp4"
        output_path = UPLOADS_DIR / "videos" / output_filename

        ffmpeg_cmd = [
            'ffmpeg', '-i', str(temp_path),
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-max_muxing_queue_size', '9999',
        ]
        if has_audio:
            ffmpeg_cmd.extend(['-c:a', 'aac', '-b:a', '128k'])
        else:
            ffmpeg_cmd.extend(['-an'])
        ffmpeg_cmd.extend([
            '-vf', 'scale=min(iw\\,1920):min(ih\\,1080):force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2',
            '-y', str(output_path)
        ])

        try:
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=900)
            if result.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                os.remove(temp_path)
                output_size = output_path.stat().st_size / (1024 * 1024)
                logger.info(f"Converted {temp_filename} -> {output_filename} ({output_size:.1f} MB)")
                return {
                    "url": f"/api/uploads/videos/{output_filename}",
                    "filename": output_filename,
                    "converted": True,
                    "original_format": file_ext,
                    "size_mb": round(output_size, 1)
                }
            # Fallback simpler encoding
            logger.warning(f"FFmpeg attempt 1 failed, trying fallback: {result.stderr[:200]}")
            fallback_cmd = [
                'ffmpeg', '-i', str(temp_path),
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                '-max_muxing_queue_size', '9999',
            ]
            if has_audio:
                fallback_cmd.extend(['-c:a', 'aac'])
            else:
                fallback_cmd.extend(['-an'])
            fallback_cmd.extend(['-y', str(output_path)])
            result2 = subprocess.run(fallback_cmd, capture_output=True, text=True, timeout=900)
            if result2.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                os.remove(temp_path)
                output_size = output_path.stat().st_size / (1024 * 1024)
                logger.info(f"Fallback succeeded: {output_filename} ({output_size:.1f} MB)")
                return {
                    "url": f"/api/uploads/videos/{output_filename}",
                    "filename": output_filename,
                    "converted": True,
                    "original_format": file_ext,
                    "size_mb": round(output_size, 1)
                }
            logger.error(f"Both conversion attempts failed: {result2.stderr[:200]}")
            if output_path.exists():
                os.remove(output_path)
            return {
                "url": f"/api/uploads/videos/{temp_filename}",
                "filename": temp_filename,
                "converted": False,
                "error": "Conversion failed, original file kept. It may not play in all browsers."
            }
        except subprocess.TimeoutExpired:
            logger.error(f"Conversion timed out for {temp_filename}")
            if output_path.exists():
                os.remove(output_path)
            return {
                "url": f"/api/uploads/videos/{temp_filename}",
                "filename": temp_filename,
                "converted": False,
                "error": "Conversion timed out (video too large). Original file kept."
            }
        except Exception as e:
            logger.error(f"Conversion error: {str(e)}")
            return {
                "url": f"/api/uploads/videos/{temp_filename}",
                "filename": temp_filename,
                "converted": False,
                "error": str(e)
            }

    # Already MP4 — keep as-is (re-mux step from legacy code preserved below)
    if not ffmpeg_available:
        return {"url": f"/api/uploads/videos/{temp_filename}", "filename": temp_filename, "converted": False}
    try:
        subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name',
             '-of', 'csv=p=0', str(temp_path)],
            capture_output=True, text=True, timeout=30
        )
    except Exception:
        pass
    return {
        "url": f"/api/uploads/videos/{temp_filename}",
        "filename": temp_filename,
        "converted": False,
        "size_mb": round(file_size / (1024 * 1024), 1)
    }


# ---------- Chunked video upload (works around proxy body-size caps) ----------

class ChunkedUploadInit(BaseModel):
    filename: str
    total_size: int
    total_chunks: int


@api_router.post("/upload/video/chunk/init")
async def init_chunked_video_upload(
    data: ChunkedUploadInit,
    admin: dict = Depends(require_admin),
):
    """Begin a chunked video upload session. Returns an upload_id."""
    file_ext = Path(data.filename).suffix.lower()
    if not file_ext:
        raise HTTPException(status_code=400, detail="File must have an extension")
    if file_ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{file_ext}'. Supported: MP4, MOV, AVI, MKV, WebM, FLV, WMV, M4V, 3GP, TS, MPG, MPEG, and more."
        )
    if data.total_size <= 0:
        raise HTTPException(status_code=400, detail="Invalid total_size")
    # Hard cap on file size — avoid runaway uploads filling the disk
    max_size = 5 * 1024 * 1024 * 1024  # 5 GB
    if data.total_size > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 5 GB)")

    upload_id = str(uuid.uuid4())
    base_name = str(uuid.uuid4())
    temp_dir = CHUNK_UPLOADS_DIR / upload_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    chunk_uploads[upload_id] = {
        "base_name": base_name,
        "file_ext": file_ext,
        "total_size": data.total_size,
        "total_chunks": data.total_chunks,
        "received_chunks": 0,
        "received_bytes": 0,
        "temp_dir": str(temp_dir),
        "admin_id": admin['id'],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(f"Init chunked upload {upload_id}: {data.filename} ({data.total_size / (1024*1024):.1f} MB, {data.total_chunks} chunks)")
    return {"upload_id": upload_id}


@api_router.post("/upload/video/chunk/append")
async def append_video_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    """Append one chunk to an in-flight chunked upload."""
    session = chunk_uploads.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
    if session['admin_id'] != admin['id']:
        raise HTTPException(status_code=403, detail="Not your upload session")
    if chunk_index < 0 or chunk_index >= session['total_chunks']:
        raise HTTPException(status_code=400, detail="Invalid chunk_index")

    chunk_path = Path(session['temp_dir']) / f"{chunk_index:06d}.part"
    bytes_written = 0
    try:
        with open(chunk_path, "wb") as f:
            while data := await chunk.read(1024 * 1024):
                f.write(data)
                bytes_written += len(data)
    except Exception as e:
        logger.error(f"Chunk append failed for {upload_id}#{chunk_index}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save chunk")

    session['received_chunks'] += 1
    session['received_bytes'] += bytes_written

    return {
        "ok": True,
        "received_chunks": session['received_chunks'],
        "total_chunks": session['total_chunks'],
        "received_bytes": session['received_bytes'],
    }


@api_router.post("/upload/video/chunk/complete")
async def complete_chunked_video_upload(
    background_tasks: BackgroundTasks,
    upload_id: str = Form(...),
    admin: dict = Depends(require_admin),
):
    """Assemble all chunks and kick off background ffmpeg conversion.

    Returns immediately with a `job_id` so we never hold the HTTP connection
    open long enough for upstream proxies (Cloudflare = ~100s) to time out
    with a 520. The client polls /upload/video/conversion/{job_id} until done.
    """
    session = chunk_uploads.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
    if session['admin_id'] != admin['id']:
        raise HTTPException(status_code=403, detail="Not your upload session")

    base_name = session['base_name']
    file_ext = session['file_ext']
    total_chunks = session['total_chunks']
    temp_dir = Path(session['temp_dir'])
    final_temp_path = UPLOADS_DIR / "videos" / f"{base_name}{file_ext}"

    try:
        with open(final_temp_path, "wb") as out:
            for i in range(total_chunks):
                part = temp_dir / f"{i:06d}.part"
                if not part.exists():
                    raise HTTPException(status_code=400, detail=f"Missing chunk {i}")
                with open(part, "rb") as p:
                    while data := p.read(1024 * 1024):
                        out.write(data)
    except HTTPException:
        if final_temp_path.exists():
            final_temp_path.unlink()
        raise
    except Exception as e:
        logger.error(f"Failed to assemble {upload_id}: {e}")
        if final_temp_path.exists():
            final_temp_path.unlink()
        raise HTTPException(status_code=500, detail="Failed to assemble chunks")

    # Cleanup chunk parts
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass
    chunk_uploads.pop(upload_id, None)

    final_size = final_temp_path.stat().st_size
    logger.info(f"Assembled {upload_id} -> {final_temp_path.name} ({final_size / (1024*1024):.1f} MB)")

    # Register a job and run the ffmpeg pipeline in the background
    job_id = str(uuid.uuid4())
    video_jobs[job_id] = {
        "status": "processing",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "size_mb": round(final_size / (1024 * 1024), 1),
    }

    async def _run_job():
        try:
            # Run the (blocking) ffmpeg pipeline in a thread so we don't
            # freeze the event loop while a 450 MB conversion runs for minutes.
            result = await asyncio.to_thread(
                _process_uploaded_video_sync, final_temp_path, file_ext, base_name
            )
            video_jobs[job_id] = {
                "status": "completed",
                "result": result,
                "started_at": video_jobs[job_id].get("started_at"),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
            logger.info(f"Conversion job {job_id} completed: {result.get('url')}")
        except Exception as e:
            logger.error(f"Conversion job {job_id} failed: {e}")
            video_jobs[job_id] = {
                "status": "failed",
                "error": str(e),
                "started_at": video_jobs[job_id].get("started_at"),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }

    background_tasks.add_task(_run_job)

    return {
        "status": "processing",
        "job_id": job_id,
        "size_mb": round(final_size / (1024 * 1024), 1),
    }


@api_router.get("/upload/video/conversion/{job_id}")
async def get_video_conversion_status(
    job_id: str,
    admin: dict = Depends(require_admin),
):
    """Poll the status of a background video conversion job.

    Response shapes:
      - { status: 'processing' }
      - { status: 'completed', result: { url, filename, converted, size_mb, ... } }
      - { status: 'failed', error: '...' }
    """
    job = video_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return job


@api_router.post("/upload/video")
async def upload_video(
    file: UploadFile = File(...), 
    admin: dict = Depends(require_admin),
    background_tasks: BackgroundTasks = None
):
    """Single-shot video upload. Subject to upstream proxy body-size limits.
    For large files, prefer the chunked endpoints under /upload/video/chunk/."""
    # Accept virtually all video formats
    allowed_extensions = [
        '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
        '.3gp', '.ts', '.mts', '.mpg', '.mpeg', '.vob', '.ogv', '.f4v',
        '.rm', '.rmvb', '.asf', '.divx', '.mxf', '.m2ts', '.m2v', '.dat'
    ]
    file_ext = Path(file.filename).suffix.lower()
    
    if not file_ext:
        raise HTTPException(status_code=400, detail="File must have an extension")
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported format '{file_ext}'. Supported: MP4, MOV, AVI, MKV, WebM, FLV, WMV, M4V, 3GP, TS, MPG, MPEG, and more."
        )
    
    # Generate unique filename
    base_name = str(uuid.uuid4())
    temp_filename = f"{base_name}{file_ext}"
    temp_path = UPLOADS_DIR / "videos" / temp_filename
    
    # Save uploaded file in chunks (handles large files)
    try:
        file_size = 0
        with open(temp_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                buffer.write(chunk)
                file_size += len(chunk)
        logger.info(f"Saved {temp_filename} ({file_size / (1024*1024):.1f} MB)")
    except Exception as e:
        logger.error(f"Failed to save upload: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")
    
    # Check if ffmpeg is available
    import shutil
    ffmpeg_available = bool(shutil.which('ffmpeg'))
    
    # Validate it's actually a video using ffprobe
    if ffmpeg_available:
        try:
            probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=codec_type', '-of', 'csv=p=0',
                 str(temp_path)],
                capture_output=True, text=True, timeout=30
            )
            if 'video' not in probe.stdout:
                os.remove(temp_path)
                raise HTTPException(status_code=400, detail="File does not contain a valid video stream")
        except subprocess.TimeoutExpired:
            pass
        except HTTPException:
            raise
        except Exception:
            pass
    
    # Check if audio stream exists (some formats may not have audio)
    has_audio = True
    if ffmpeg_available:
        try:
            audio_probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
                 '-show_entries', 'stream=codec_type', '-of', 'csv=p=0',
                 str(temp_path)],
                capture_output=True, text=True, timeout=30
            )
            has_audio = 'audio' in audio_probe.stdout
        except Exception:
            has_audio = True
    
    # Convert to web-compatible MP4 (even MP4 files may need re-encoding for browser support)
    needs_conversion = file_ext != '.mp4'
    
    # If ffmpeg not available, skip conversion and return original
    if not ffmpeg_available and needs_conversion:
        logger.warning(f"ffmpeg not available, keeping original {file_ext} file without conversion")
        file_url = f"/api/uploads/videos/{temp_filename}"
        return {
            "url": file_url,
            "filename": temp_filename,
            "converted": False,
            "error": "Video saved but not converted (ffmpeg unavailable). It may not play in all browsers."
        }
    
    if needs_conversion:
        output_filename = f"{base_name}.mp4"
        output_path = UPLOADS_DIR / "videos" / output_filename
        
        logger.info(f"Converting {temp_filename} to MP4 (has_audio={has_audio})...")
        
        # Build ffmpeg command with maximum compatibility
        ffmpeg_cmd = [
            'ffmpeg', '-i', str(temp_path),
            '-c:v', 'libx264',           # H.264 video codec (universal browser support)
            '-preset', 'fast',            # Balance speed vs compression
            '-crf', '23',                 # Good quality (18-28 range)
            '-pix_fmt', 'yuv420p',        # Required for browser compatibility
            '-movflags', '+faststart',    # Enable web streaming (moov atom at start)
            '-max_muxing_queue_size', '9999',  # Prevent muxing errors
        ]
        
        # Handle audio
        if has_audio:
            ffmpeg_cmd.extend(['-c:a', 'aac', '-b:a', '128k'])
        else:
            ffmpeg_cmd.extend(['-an'])  # No audio stream
        
        # Scale down to max 1080p if larger (saves space, faster streaming)
        ffmpeg_cmd.extend([
            '-vf', 'scale=min(iw\\,1920):min(ih\\,1080):force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2',
        ])
        
        ffmpeg_cmd.extend(['-y', str(output_path)])
        
        try:
            result = subprocess.run(
                ffmpeg_cmd,
                capture_output=True, text=True, timeout=900  # 15 min timeout
            )
            
            if result.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                # Conversion successful
                os.remove(temp_path)
                output_size = output_path.stat().st_size / (1024 * 1024)
                logger.info(f"Converted {temp_filename} -> {output_filename} ({output_size:.1f} MB)")
                file_url = f"/api/uploads/videos/{output_filename}"
                return {
                    "url": file_url, 
                    "filename": output_filename,
                    "converted": True,
                    "original_format": file_ext,
                    "size_mb": round(output_size, 1)
                }
            else:
                # First attempt failed, try with simpler options
                logger.warning(f"FFmpeg conversion failed (attempt 1), trying fallback: {result.stderr[:200]}")
                
                # Fallback: simpler encoding without scaling filter
                fallback_cmd = [
                    'ffmpeg', '-i', str(temp_path),
                    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    '-max_muxing_queue_size', '9999',
                    '-c:a', 'aac' if has_audio else '-an',
                    '-y', str(output_path)
                ]
                if not has_audio:
                    fallback_cmd = [x for x in fallback_cmd if x != '-an']
                    # Re-add -an properly
                    idx = fallback_cmd.index('-y')
                    fallback_cmd.insert(idx, '-an')
                
                result2 = subprocess.run(
                    fallback_cmd,
                    capture_output=True, text=True, timeout=900
                )
                
                if result2.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                    os.remove(temp_path)
                    output_size = output_path.stat().st_size / (1024 * 1024)
                    logger.info(f"Fallback conversion succeeded: {output_filename} ({output_size:.1f} MB)")
                    file_url = f"/api/uploads/videos/{output_filename}"
                    return {
                        "url": file_url,
                        "filename": output_filename,
                        "converted": True,
                        "original_format": file_ext,
                        "size_mb": round(output_size, 1)
                    }
                else:
                    # Both attempts failed - keep original
                    logger.error(f"Both conversion attempts failed: {result2.stderr[:200]}")
                    if output_path.exists():
                        os.remove(output_path)
                    file_url = f"/api/uploads/videos/{temp_filename}"
                    return {
                        "url": file_url,
                        "filename": temp_filename,
                        "converted": False,
                        "error": "Conversion failed, original file kept. It may not play in all browsers."
                    }
                    
        except subprocess.TimeoutExpired:
            logger.error(f"Video conversion timed out for {temp_filename}")
            if output_path.exists():
                os.remove(output_path)
            file_url = f"/api/uploads/videos/{temp_filename}"
            return {
                "url": file_url, 
                "filename": temp_filename,
                "converted": False,
                "error": "Conversion timed out (video too large). Original file kept."
            }
        except Exception as e:
            logger.error(f"Video conversion error: {str(e)}")
            file_url = f"/api/uploads/videos/{temp_filename}"
            return {
                "url": file_url, 
                "filename": temp_filename,
                "converted": False,
                "error": str(e)
            }
    
    # Already MP4 - verify it's web-compatible, re-mux if needed
    if not ffmpeg_available:
        file_url = f"/api/uploads/videos/{temp_filename}"
        return {"url": file_url, "filename": temp_filename, "converted": False}
    
    try:
        # Check if MP4 has faststart (moov atom at beginning)
        probe_result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name',
             '-of', 'csv=p=0', str(temp_path)],
            capture_output=True, text=True, timeout=30
        )
        
        # Re-mux to ensure faststart and browser compatibility
        output_filename = f"{base_name}_web.mp4"
        output_path = UPLOADS_DIR / "videos" / output_filename
        
        remux = subprocess.run([
            'ffmpeg', '-i', str(temp_path),
            '-c', 'copy', '-movflags', '+faststart',
            '-y', str(output_path)
        ], capture_output=True, text=True, timeout=120)
        
        if remux.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
            os.remove(temp_path)
            file_url = f"/api/uploads/videos/{output_filename}"
            return {"url": file_url, "filename": output_filename, "converted": False, "optimized": True}
        else:
            # Remux failed, use original
            if output_path.exists():
                os.remove(output_path)
            file_url = f"/api/uploads/videos/{temp_filename}"
            return {"url": file_url, "filename": temp_filename, "converted": False}
    except Exception:
        file_url = f"/api/uploads/videos/{temp_filename}"
        return {"url": file_url, "filename": temp_filename, "converted": False}


@api_router.post("/convert/video")
async def convert_existing_video(
    video_url: str = Form(...),
    admin: dict = Depends(require_admin)
):
    """Convert an existing video file to MP4 (for admin use)"""
    # Extract filename from URL
    if '/api/uploads/videos/' in video_url:
        filename = video_url.split('/api/uploads/videos/')[-1]
    elif '/uploads/videos/' in video_url:
        filename = video_url.split('/uploads/videos/')[-1]
    else:
        raise HTTPException(status_code=400, detail="Invalid video URL format")
    
    input_path = UPLOADS_DIR / "videos" / filename
    
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    
    file_ext = Path(filename).suffix.lower()
    
    # If already MP4, return as-is
    if file_ext == '.mp4':
        return {
            "success": True,
            "message": "File is already MP4",
            "output_url": video_url
        }
    
    # Generate output filename
    base_name = Path(filename).stem
    output_filename = f"{base_name}.mp4"
    output_path = UPLOADS_DIR / "videos" / output_filename
    
    logger.info(f"Converting existing video {filename} to MP4...")
    
    try:
        result = subprocess.run([
            'ffmpeg', '-i', str(input_path),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            '-y',
            str(output_path)
        ], capture_output=True, text=True, timeout=600)
        
        if result.returncode == 0:
            # Delete original file
            os.remove(input_path)
            logger.info(f"Successfully converted {filename} to {output_filename}")
            return {
                "success": True,
                "message": "Video converted successfully",
                "output_url": f"/api/uploads/videos/{output_filename}",
                "original_deleted": True
            }
        else:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Conversion failed: {result.stderr[:200]}")
            
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Conversion timed out (max 10 minutes)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion error: {str(e)}")

@api_router.post("/upload/pdf")
async def upload_pdf(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    """Upload a PDF file"""
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext != '.pdf':
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}.pdf"
    file_path = UPLOADS_DIR / "pdfs" / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Return the URL with /api prefix for proper routing
    file_url = f"/api/uploads/pdfs/{unique_filename}"
    return {"url": file_url, "filename": unique_filename}

@api_router.post("/upload/image")
async def upload_image(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    """Upload an image file"""
    allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_extensions}")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOADS_DIR / "images" / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Return the URL with /api prefix for proper routing
    file_url = f"/api/uploads/images/{unique_filename}"
    return {"url": file_url, "filename": unique_filename}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    # Ensure ffmpeg is installed for video conversion
    import shutil
    if not shutil.which('ffmpeg'):
        logger.warning("ffmpeg not found, installing...")
        try:
            subprocess.run(['apt-get', 'update', '-qq'], capture_output=True, timeout=60)
            subprocess.run(['apt-get', 'install', '-y', '-qq', 'ffmpeg'], capture_output=True, timeout=120)
            if shutil.which('ffmpeg'):
                logger.info("ffmpeg installed successfully")
            else:
                logger.error("ffmpeg installation failed")
        except Exception as e:
            logger.error(f"Failed to install ffmpeg: {e}")
    else:
        logger.info(f"ffmpeg found at {shutil.which('ffmpeg')}")

    # Create default admin user if not exists
    admin = await db.users.find_one({"email": "admin@bullbear.com"})
    if not admin:
        admin_user = User(
            email="admin@bullbear.com",
            name="Admin",
            is_admin=True,
            course_access=True,
            book_access=True,
            signals_subscription=True
        )
        admin_dict = admin_user.model_dump()
        admin_dict['password_hash'] = hash_password('admin123')
        await db.users.insert_one(admin_dict)
        logger.info("Default admin user created")
    
    # Create sample data if empty
    courses_count = await db.courses.count_documents({})
    if courses_count == 0:
        sample_courses = [
            Course(title="Introduction to Trading", description="Learn the basics of trading and financial markets", category="beginner", is_free=True, order=1),
            Course(title="Candlestick Patterns", description="Master the art of reading candlestick patterns", category="technical-analysis", order=2),
            Course(title="Risk Management Fundamentals", description="Protect your capital with proper risk management", category="risk-management", order=3),
            Course(title="Trading Psychology", description="Master your emotions and develop a winning mindset", category="psychology", order=4),
            Course(title="Advanced Price Action", description="Deep dive into advanced price action strategies", category="advanced", order=5),
        ]
        for course in sample_courses:
            await db.courses.insert_one(course.model_dump())
        logger.info("Sample courses created")
    
    signals_count = await db.signals.count_documents({})
    if signals_count == 0:
        sample_signals = [
            Signal(asset="EUR/USD", direction="BUY", entry_price=1.0845, stop_loss=1.0800, take_profit_1=1.0900, take_profit_2=1.0950, risk_note="Medium risk", is_pinned=True),
            Signal(asset="BTC/USD", direction="SELL", entry_price=68000, stop_loss=69500, take_profit_1=66000, take_profit_2=64000, risk_note="High volatility expected"),
            Signal(asset="XAU/USD", direction="BUY", entry_price=2340.50, stop_loss=2320.00, take_profit_1=2360.00, risk_note="Gold bullish momentum"),
        ]
        for signal in sample_signals:
            await db.signals.insert_one(signal.model_dump())
        logger.info("Sample signals created")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
