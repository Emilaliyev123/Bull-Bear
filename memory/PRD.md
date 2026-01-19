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

### Bug Fixes Applied (This Session)
1. **Video Playback Fixed**: Added `getMediaUrl()` helper to convert old preview URLs to correct current URLs
2. **Book Saving Fixed**: Backend working correctly; changed to store relative URLs for portability
3. **Static Files Routing Fixed**: Changed mount from `/uploads` to `/api/uploads` for proper Kubernetes ingress routing

## Pending/Future Tasks

### P1 - High Priority
- [x] ~~Implement Stripe payment integration~~ ✅ DONE
- [ ] Add push notifications for new signals and market news

### P2 - Medium Priority
- [ ] Content protection (screen recording prevention)
- [ ] Offline reading for book PDF
- [ ] Convert large .mov videos to MP4 for better browser compatibility

### P3 - Low Priority
- [ ] Crypto payment support (Stripe supports USDC)
- [ ] Real-time market data integration (replace mock data)

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
