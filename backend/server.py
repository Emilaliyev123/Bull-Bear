from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

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

app = FastAPI(title="Bull & Bear Trading Academy API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

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
    return article.model_dump()

@api_router.delete("/news/{news_id}")
async def delete_news(news_id: str, admin: dict = Depends(require_admin)):
    result = await db.news.delete_one({"id": news_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
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
    
    # Return the URL
    file_url = f"/uploads/videos/{unique_filename}"
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
    
    # Return the URL
    file_url = f"/uploads/pdfs/{unique_filename}"
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
    
    # Return the URL
    file_url = f"/uploads/images/{unique_filename}"
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
