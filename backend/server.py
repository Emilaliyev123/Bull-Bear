from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request, BackgroundTasks
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
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

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

# Product pricing (server-side defined - NEVER accept amounts from frontend)
PRODUCTS = {
    "course": {"name": "Trading Courses", "price": 49.90, "type": "one_time"},
    "book": {"name": "Trading Book", "price": 29.90, "type": "one_time"},
    "signals": {"name": "Private Signals (Monthly)", "price": 19.90, "type": "subscription"}
}

app = FastAPI(title="Bull & Bear Trading Academy API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Serve uploaded files - mount under /api/uploads for proper routing through ingress
app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

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
async def register(data: UserCreate):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=data.email,
        name=data.name
    )
    user_dict = user.model_dump()
    user_dict['password_hash'] = hash_password(data.password)
    
    await db.users.insert_one(user_dict)
    token = create_token(user.id, user.is_admin)
    
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
async def create_course(data: CourseCreate, admin: dict = Depends(require_admin)):
    course = Course(**data.model_dump())
    await db.courses.insert_one(course.model_dump())
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
async def create_signal(data: SignalCreate, admin: dict = Depends(require_admin)):
    signal = Signal(**data.model_dump())
    await db.signals.insert_one(signal.model_dump())
    
    # Create notification for all users
    await create_notification_for_all_users(
        notification_type="signal",
        title=f"New Signal: {signal.asset}",
        message=f"{signal.direction} signal for {signal.asset}",
        link="/signals"
    )
    
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
async def create_news(data: NewsCreate, admin: dict = Depends(require_admin)):
    article = NewsArticle(**data.model_dump())
    await db.news.insert_one(article.model_dump())
    
    # Create notification for all users
    await create_notification_for_all_users(
        notification_type="news",
        title="New Market Analysis",
        message=article.title[:100],
        link="/news"
    )
    
    return article.model_dump()

@api_router.delete("/news/{news_id}")
async def delete_news(news_id: str, admin: dict = Depends(require_admin)):
    result = await db.news.delete_one({"id": news_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"success": True}

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
    
    # Create user notifications for all users
    users = await db.users.find({}, {"id": 1}).to_list(10000)
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
    
    checkout_request = CheckoutSessionRequest(
        amount=float(product['price']),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata
    )
    
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
            currency="usd",
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

# ============ ADMIN ROUTES ============

@api_router.get("/admin/users")
async def get_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
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

# ============ MARKET DATA (MOCK) ============

@api_router.get("/market")
async def get_market_data():
    # Mock market data - in production, integrate with real API
    return {
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

@api_router.get("/")
async def root():
    return {"message": "Bull & Bear Trading Academy API", "version": "1.0.0"}

# ============ FILE UPLOAD ROUTES ============

@api_router.post("/upload/video")
async def upload_video(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    """Upload a video file"""
    allowed_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_extensions}")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOADS_DIR / "videos" / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Return the URL with /api prefix for proper routing
    file_url = f"/api/uploads/videos/{unique_filename}"
    return {"url": file_url, "filename": unique_filename}

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
