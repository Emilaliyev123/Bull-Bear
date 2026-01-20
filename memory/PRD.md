# Bull & Bear Trading Academy - Product Requirements Document

## Original Problem Statement
Create a premium mobile application named "Bull & Bear" focused on professional trading education, market analysis, and private trading signals.

## Product Overview
- **App Name:** Bull & Bear Trading Academy
- **Design:** Luxury, institutional-grade with black & gold color palette
- **Tech Stack:** React + FastAPI + MongoDB

## Core Features Implemented

### 1. User Authentication & Admin Panel
- JWT-based authentication
- Admin panel for content management
- User role management

### 2. Trading Courses ($49.90 one-time)
- Video course library with categories
- MP4 video playback with HTML5 player
- Admin can upload and manage course videos

### 3. Trading Book ($29.90 one-time) 
- "Game of Candles" PDF book
- Download for offline reading
- Admin can update book details and PDF

### 4. Private Signals ($19.90/month)
- Real-time trading signals
- Entry, Stop Loss, Take Profit levels

### 5. Payments (Stripe)
- One-time payments for courses and book
- Monthly subscriptions for signals
- USDC crypto payment option

### 6. Notifications
- In-app notifications with bell icon
- Email notifications via Resend
- Browser push notifications (Service Worker)

### 7. Market Data (Alpha Vantage)
- Live forex rates (EUR/USD, GBP/USD, USD/JPY)
- Live crypto prices (BTC, ETH)
- Stock indices (S&P 500, NASDAQ, DOW)

### 8. Content Protection
- Disabled right-click on videos
- Disabled download button
- Video pause on window blur

## Recent Fixes (Jan 20, 2026)

### Video Playback Issue
- **Root Cause**: Videos were in .MOV format with old preview URLs
- **Fix Applied**: 
  - Converted all .MOV files to .MP4 using FFmpeg
  - Updated video URLs in database
  - Added proper video streaming endpoint
  - Simplified modal rendering (removed AnimatePresence)
- **Status**: ✅ FIXED - Video player displays with all controls

### Book Saving Issue
- **Root Cause**: Alert popup was blocking feedback
- **Fix Applied**: Added visual toast notification
- **Status**: ✅ FIXED - Shows "✓ Book saved successfully!"

## API Keys Configured
- Stripe: `sk_test_51SrFEY...` ✅
- Resend: `re_bJkj2E...` ✅
- Alpha Vantage: `BZY2C113...` ✅

## Test Credentials
- **Admin:** admin@bullbear.com / admin123

## Known Limitations
- Playwright headless browser may show video codec errors (works in real browsers)
- Alpha Vantage free tier: 25 requests/day

## Future Enhancements
- [ ] Advanced watermarking with user info
- [ ] User referral system
- [ ] Multi-language support
- [ ] Mobile app (React Native)
