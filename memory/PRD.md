# Bull & Bear Trading Academy - Product Requirements Document

## Original Problem Statement
Create a premium mobile application named "Bull & Bear" focused on professional trading education, market analysis, and private trading signals.

## Product Overview
- **App Name:** Bull & Bear Trading Academy
- **Design:** Luxury, institutional-grade with black & gold color palette
- **Tech Stack:** React + FastAPI + MongoDB

## Core Features

### 1. Home Dashboard
- Welcome section
- Live market overview (Forex, Crypto, Indices)
- Latest signals preview
- Latest news preview

### 2. Trading Courses ($49.90 one-time)
- Video course library with categories
- Progress tracking
- Video playback for purchased users

### 3. Trading Book ($29.90 one-time)
- "Game of Candles" PDF book
- Built-in PDF reader access
- Custom book cover display

### 4. Private Signals ($19.90/month)
- Real-time trading signals
- Entry, Stop Loss, Take Profit levels
- Risk management notes

### 5. Market News & Analysis
- Admin-posted market commentary
- Educational content

### 6. Admin Panel
- User management
- Course management (upload videos, thumbnails)
- Book management (upload PDF, cover)
- Signal management
- News management
- Dashboard stats

## What's Implemented (Jan 17, 2026)

### Completed Features
- Full React frontend with luxury black/gold theme
- FastAPI backend with all API endpoints
- MongoDB database integration
- User authentication (JWT)
- Admin panel with all CRUD operations
- File upload system (videos, PDFs, images)
- Static file serving via `/api/uploads/`
- Products page consolidating all offerings
- Support page with email contact
- Site-wide footer with support email

### Stripe Payment Integration (Jan 19, 2026)
- ✅ Stripe Checkout for one-time payments (Courses $49.90, Book $29.90)
- ✅ Stripe Checkout for monthly subscriptions (Signals $19.90/month)
- ✅ Payment success/cancel pages with status polling
- ✅ Automatic access granting after successful payment
- ✅ Payment transaction tracking in database
- ✅ Webhook handling for payment confirmations
- ✅ USDC Crypto payments toggle (Ethereum, Base, Polygon)

### Push Notifications (Jan 19, 2026)
- ✅ In-app notification system with bell icon in navbar
- ✅ Auto-notifications when admin creates new signals
- ✅ Auto-notifications when admin posts news/analysis
- ✅ Mark as read / Mark all read functionality
- ✅ Real-time polling every 30 seconds

### Video Conversion (Jan 19, 2026)
- ✅ Admin Video Manager tab to view all uploaded videos
- ✅ One-click .MOV to .MP4 conversion using FFmpeg
- ✅ Background conversion with status polling
- ✅ Auto-deletion of original file after conversion

### Content Protection (Jan 19, 2026)
- ✅ Disabled right-click context menu on videos
- ✅ Disabled download button on video player
- ✅ Disabled picture-in-picture mode
- ✅ Keyboard shortcut blocking for screenshots
- ✅ CSS watermark overlay for premium content
- ✅ Video pause on window blur (screen share detection)

### PDF Offline Download (Jan 19, 2026)
- ✅ "Download for Offline" button on Book page
- ✅ Secure download endpoint with access validation
- ✅ Proper filename with book title

### Email Notifications - Resend (Jan 19, 2026)
- ✅ Email alerts for new trading signals (to subscribed users)
- ✅ Email alerts for new market news (to all users)
- ✅ Beautiful HTML email templates with branding
- ✅ User email preferences in Profile settings
- ✅ Admin test email functionality

### Browser Push Notifications (Jan 19, 2026)
- ✅ Service Worker for push notifications
- ✅ Push subscription management in Profile
- ✅ Toggle switches for notification preferences

### Real-time Market Data - Alpha Vantage (Jan 19, 2026)
- ✅ Live forex rates (EUR/USD, GBP/USD, USD/JPY)
- ✅ Live crypto prices (BTC, ETH from API, SOL fallback)
- ✅ Stock indices via ETF proxies (SPY→S&P500, QQQ→NASDAQ, DIA→DOW)
- ✅ 5-minute in-memory caching to respect API limits
- ✅ Fallback to mock data when API unavailable

### Bug Fixes Applied (This Session)
1. **Video Playback Fixed**: Added `getMediaUrl()` helper to convert old preview URLs to correct current URLs
2. **Book Saving Fixed**: Backend working correctly; changed to store relative URLs for portability
3. **Static Files Routing Fixed**: Changed mount from `/uploads` to `/api/uploads` for proper Kubernetes ingress routing

## Pending/Future Tasks

### P1 - High Priority
- [x] ~~Implement Stripe payment integration~~ ✅ DONE
- [x] ~~Add push notifications~~ ✅ DONE (in-app notifications)
- [x] ~~Convert videos (.mov to .mp4)~~ ✅ DONE (Video Manager)
- [x] ~~Content protection~~ ✅ DONE
- [x] ~~Crypto payments (USDC)~~ ✅ DONE

### P2 - Medium Priority
- [ ] Offline reading for book PDF (download for offline access)
- [ ] Email notifications (in addition to in-app)
- [ ] Browser push notifications (Web Push API with service worker)

### P3 - Low Priority
- [ ] Real-time market data integration (replace mock data)
- [ ] Advanced content watermarking with user info

## API Endpoints

### Auth
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Content
- `GET /api/courses` - List courses
- `GET /api/signals` - List signals
- `GET /api/book` - Get book info
- `GET /api/news` - List news articles
- `GET /api/market` - Get market data (mock)

### Payments (Stripe)
- `POST /api/checkout/create` - Create Stripe checkout session
- `GET /api/checkout/status/{session_id}` - Get payment status
- `POST /api/webhook/stripe` - Handle Stripe webhooks

### Admin
- `POST /api/courses` - Create course
- `PUT /api/courses/{id}` - Update course
- `DELETE /api/courses/{id}` - Delete course
- `PUT /api/book` - Update book
- `POST /api/signals` - Create signal
- `DELETE /api/signals/{id}` - Delete signal
- `POST /api/news` - Create news
- `DELETE /api/news/{id}` - Delete news

### File Uploads
- `POST /api/upload/video` - Upload video file
- `POST /api/upload/pdf` - Upload PDF file
- `POST /api/upload/image` - Upload image file

## Test Credentials
- **Admin:** admin@bullbear.com / admin123

## Known Limitations
- Market data is mocked (not real-time)
- Payment system not yet integrated
- Large video files (730MB .mov) take time to buffer

## Support
- Email: bullbearacademy.su@gmail.com
