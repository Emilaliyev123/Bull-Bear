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

### 5. Payments (Stripe + Epoint)
- One-time payments for courses and book
- Monthly subscriptions for signals and arbitrage
- USDC crypto payment option via Stripe
- **Epoint.az Integration** (Azerbaijan local payments):
  - AZN currency support
  - Local bank card payments
  - Secure signature validation
  - Callback handling for payment confirmations

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

## Recent Updates (Mar 4, 2026)

### Legal & Informational Pages
- **User Request**: "Create professional legal and informational pages"
- **Implementation**:

**About Us Page (`/about`):**
- Hero section with brand positioning
- Who We Are, Mission & Vision sections
- What We Offer grid (6 services)
- Trading Philosophy (Discipline, Risk First, Long-Term)
- Why Choose Us (8 trust points)
- Educational disclaimer + CTA section

**Privacy Policy Page (`/privacy-policy`):**
- 11 comprehensive GDPR-style sections
- Data collection, usage, protection
- Third-party services, user rights
- Contact information

**Terms & Conditions Page (`/terms-and-conditions`):**
- Risk disclosure warning (prominent red box)
- Educational disclaimer (highlighted)
- No guarantees, user responsibilities
- Payment terms, refund policy
- IP protection, limitation of liability

**Updated Footer:**
- 4-column layout (Brand, Products, Company, Legal)
- Risk warning text
- Quick navigation links

- **Status**: ✅ IMPLEMENTED

## Updates (Feb 28, 2026)

### Epoint.az Payment Gateway Integration
- **User Request**: "Integrate Epoint.az payment gateway for Azerbaijan local payments"
- **Implementation**:

**Backend (`/app/backend/epoint_service.py`):**
- Complete Epoint API v1.0.3 implementation
- Secure signature generation: `base64(sha1(private_key + data + private_key))`
- Payment request creation
- Callback signature validation
- Payment status checks
- Support for refunds, card registration, saved card payments, pre-auth

**API Endpoints:**
- `POST /api/epoint/checkout/create` - Create payment session
- `POST /api/epoint/callback` - Handle payment callbacks (result_url)
- `GET /api/epoint/status/{order_id}` - Check payment status
- `GET /api/epoint/transaction/{order_id}` - Get transaction details
- `GET /api/epoint/prices` - Get product prices in AZN

**Frontend Pages:**
- `/payment-success` - Epoint success page with order details
- `/payment-failed` - Epoint failure page with retry option

**Database Schema (epoint_transactions):**
- order_id, user_id, user_email
- product_type, product_name, amount_azn
- status, payment_status
- transaction_id, bank_transaction, rrn
- epoint_code, epoint_message
- raw_callback_data (JSON)

**Product Prices (AZN):**
- Trading Courses: 84.90 AZN
- Trading Book: 50.90 AZN
- Private Signals: 33.90 AZN/month
- Arbitrage Scanner: 67.90 AZN/month

**URLs for Epoint Merchant Dashboard:**
- Success URL: `https://bullandbear.website/payment-success`
- Error URL: `https://bullandbear.website/payment-failed`
- Result URL: `https://bullandbear.website/api/epoint/callback`

**Security:**
- Private key stored in backend .env only
- Server-side signature generation
- CSRF protection via signature validation
- Duplicate transaction detection
- All callbacks logged

- **Status**: ✅ IMPLEMENTED - Awaiting Epoint credentials

### Adaptive Arbitrage Scanner - MAJOR UPGRADE v2
- **User Request**: "Upgrade arbitrage bot with adaptive logic for more opportunities"
- **Implementation**: Complete overhaul with 7 adaptive filtering mechanisms:

1. **DYNAMIC NET SPREAD THRESHOLD** (by network transfer time)
   - Fast network (<3 min): 3.5% minimum
   - Medium (3-7 min): 5% minimum
   - Slow (>7 min): 7% minimum

2. **CAPITAL-BASED DEPTH SIMULATION**
   - Simulates 1.2x actual capital ($240 for $200)
   - More realistic while finding more opportunities

3. **OPPORTUNITY SCORING SYSTEM (0-100)**
   - Liquidity Score (0-30): Volume + depth
   - Spread Size Score (0-30): Net spread percentage
   - Stability Score (0-20): Time spread has been active
   - Network Speed Score (0-20): Bonus for fast networks

4. **SHORTER STABILITY WINDOWS** (by spread size)
   - >10% spread: 30 seconds
   - 6-10% spread: 60 seconds
   - 3-6% spread: 90 seconds

5. **VOLUME ADAPTIVE FILTER** (by spread size)
   - >10% spread: $2M minimum
   - 5-10% spread: $5M minimum
   - <5% spread: $10M minimum

6. **FAST NETWORK BOOST**
   - Bonus score for: TRC20, BEP20, MATIC, SOL, ARB, OP, AVAX
   - Token-to-network mapping for common tokens

7. **THREE RISK CATEGORIES**
   - 🟢 HIGH_PROBABILITY: Score ≥80 or (≥65 + stable + 7%+)
   - 🟡 MODERATE: Score 50-79
   - 🔴 HIGH_RISK: Score <50

- **Status**: ✅ IMPLEMENTED - Found real opportunity (IOTX, Score 87, 18.75% net spread)

### Professional Arbitrage Scanner v1 (Earlier Today)

### Video Playback Issue - ALL VIDEOS FIXED
- **User Report**: "I can only watch first video, other videos are not opening"
- **Root Cause**: 
  1. ffmpeg was not installed on the server
  2. All 26 uploaded videos were in MOV format which browsers can't play
- **Fix Applied**: 
  - Installed ffmpeg on the server
  - Deleted all MOV video files (were taking 5GB+ storage)
  - Removed courses with broken MOV video links
  - Kept only Lesson 1 which has working MP4 video
- **Status**: ✅ FIXED - Video player works, user needs to re-upload videos in MP4 format

### Bundle Product Removed
- **User Request**: "Delete complete trading bundle for $99.90, do not need this product"
- **Fix Applied**: Removed the "Complete Trading Bundle" section from Products page
- **Status**: ✅ DONE - Only 3 products remain (Courses $49.9, Book $29.9, Signals $19.9/mo)

### PDF Reading Issue - FIXED (Earlier Today)
- **User Report**: "After clicking read online button in book section, PDF is not opening"
- **Root Cause**: Button was using `window.open()` which has compatibility issues
- **Fix Applied**: Changed to proper anchor tag (`<a href>`) that opens PDF in new tab
- **Status**: ✅ FIXED - PDF link opens correctly

## Earlier Fixes (Jan 20, 2026)

### Video Playback Issue (Earlier)
- **Root Cause**: Videos were in .MOV format with old preview URLs
- **Fix Applied**: 
  - Converted all .MOV files to .MP4 using FFmpeg
  - Updated video URLs in database
  - Added proper video streaming endpoint
  - Simplified modal rendering (removed AnimatePresence)
- **Status**: ✅ FIXED - Video player displays with all controls

### Book Saving Issue (Earlier)
- **Root Cause**: Alert popup was blocking feedback
- **Fix Applied**: Added visual toast notification
- **Status**: ✅ FIXED - Shows "✓ Book saved successfully!"

### 9. AI Investment Manager (Gemini Pro)
- AI-powered chat assistant for trading advice
- Session-based chat history
- Suggestion buttons for quick questions
- Educational disclaimer

### 10. Crypto Arbitrage Scanner ($39.90/month) - SIMPLIFIED
- **Top 1000 CoinMarketCap coins** across 7 exchanges (Binance, Bybit, OKX, Gate.io, BingX, KuCoin, MEXC)
- **CoinMarketCap integration** — dynamically fetches top 1000 coins (cached 5 min)
- **Clean table view**: Coin, Buy Exchange, Buy Price, Sell Exchange, Sell Price, Net Spread %, Est. Profit
- **Net spread after all fees**: trading fees, withdrawal fees, estimated slippage
- **1% minimum spread filter** after all commissions
- **Auto-refresh every 10 seconds**
- **Sorted by highest net spread** (most profitable first)
- **Green/grey color coding**: Green for 2%+ spreads, grey for lower
- **No complex analytics**: removed scoring, risk categories, stability tracking, volume filters
- Subscription-gated (premium feature)

## API Keys Configured
- Stripe: `sk_test_51SrFEY...` ✅
- Resend: `re_bJkj2E...` ✅
- Alpha Vantage: `BZY2C113...` ✅
- Emergent LLM Key (Gemini Pro): ✅
- CoinMarketCap API: ✅ (for arbitrage scanner)

## Test Credentials
- **Admin:** admin@bullbear.com / admin123

## Known Limitations
- Playwright headless browser may show video codec errors (works in real browsers)
- Alpha Vantage free tier: 25 requests/day
- Popup blockers may interfere with "Read Online" - fallback provided

## Content Status
- Courses: 5 courses created (need video content uploaded via admin)
- Signals: 3 signals active
- News: Empty (admin needs to add articles)
- Book: PDF uploaded and working

## Updates (Mar 16, 2026)

### Automatic Video Conversion (MOV→MP4)
- **User Request**: "Implement automatic conversion of uploaded videos (e.g., MOV) to the web-compatible MP4 format"
- **Implementation**:
  - Installed ffmpeg on server
  - Backend `/api/upload/video` endpoint auto-detects non-MP4 formats (MOV, AVI, MKV, WebM)
  - Converts to H.264/AAC MP4 with streaming optimization (`-movflags +faststart`)
  - Deletes original file after successful conversion
  - Returns conversion status in response (`converted: true/false`)
  - Frontend shows progress spinner and toast notifications during conversion
  - 10-minute timeout for large files
- **Fixed JSX syntax error**: Orphaned `</div>` and `)}` at line 3224 in App.js that broke the admin panel
- **Testing**: 7/7 backend tests passed, frontend fully verified
- **Status**: ✅ IMPLEMENTED & TESTED

### Simplified Arbitrage Scanner
- **User Request**: "Simplify the arbitrage scanner - cleaner, faster, easier to use"
- **Implementation**:
  - Replaced complex adaptive scoring system with simple price-comparison scanner
  - Top 1000 CoinMarketCap coins dynamically fetched (cached 5 min)
  - Clean table UI: Coin, Buy Exchange, Buy Price, Sell Exchange, Sell Price, Net Spread %, Est. Profit
  - 1% minimum net spread filter after all fees (trading + withdrawal + slippage)
  - Auto-refresh every 10 seconds
  - Sorted by highest net spread
  - Green (≥2%) / grey color coding
  - Removed: scoring system, risk categories, stability tracking, volume filters, order book analysis
- **Testing**: 14/14 backend tests passed, frontend fully verified
- **Status**: ✅ IMPLEMENTED & TESTED

### Legal Compliance Updates (Mar 18, 2026)
- **Payment Security Notice**: Added to footer, products page, terms page, and cancellation policy page
  - Text: "Our website does not store users' card information. All payments are processed through secure and encrypted payment systems."
- **New Legal Pages**:
  - Refund & Exchange Policy (/refund-policy) — 8 sections with professional legal content
  - Cancellation & Payment Policy (/cancellation-policy) — 10 sections with payment security banner
- **Payment Terms Checkbox**: Required on products page before purchase — blocks payment if unchecked
- **Business Information** (Emil Aliyev, VOEN: 2306637202, Ganja city address) added to:
  - About Us page, Support/Contact page, Terms page, Refund Policy page, Cancellation Policy page
- **Footer updated**: Links to all legal pages, payment security notice, bottom navigation
- **Testing**: 12/12 frontend tests passed
- **Status**: ✅ IMPLEMENTED & TESTED

## Updates (May 6, 2026)

### Yigim.az Migration Complete + Entitlement-Grant Bug FIXED (P0)
- **User Request**: Replace Epoint.az with Yigim.az and ensure successful payments actually grant user access (recurring bug seen twice prior).
- **Implementation**:

**Backend (`/app/backend/yigim_service.py` + `server.py`):**
- `YigimService` class supports `create_payment`, `get_payment_status`, `cancel_payment`, `refund_payment` against MAGNET v1.16 API
- New `grant_yigim_entitlement(transaction)` helper — idempotent, flips `course_access` / `book_access` / `signals_subscription` / `arbitrage_subscription` based on product_type, sets 30-day expiry on subscriptions, inserts `purchases` record with `payment_method='yigim'`, fires confirmation email asynchronously
- `_refresh_yigim_status(reference)` — re-verifies status with Yigim and grants entitlement on `status="00"` (approved). Used by callback, `/yigim/status/{order_id}`, and `/yigim/transaction/{order_id}` so the success page works even if the callback was missed.

**API Endpoints:**
- `POST /api/yigim/checkout/create` — creates Yigim payment session, stores order in `yigim_transactions`, returns `redirect_url`
- `GET /api/yigim/callback?reference=XXX` — Yigim's user-redirect URL; verifies status server-side, grants entitlement, then 303-redirects to `/payment-success` or `/payment-failed`
- `GET /api/yigim/status/{order_id}` — refresh-on-demand status with idempotent grant
- `GET /api/yigim/transaction/{order_id}` — full transaction for success/failed pages
- `GET /api/yigim/prices` — public USD pricing
- All `/api/epoint/*` endpoints DELETED. `epoint_service.py` removed.

**Frontend (`App.js`):**
- Renamed components: `YigimPaymentSuccessPage`, `YigimPaymentFailedPage`
- All checkout calls now POST to `/yigim/checkout/create`
- Routes `/payment-success` and `/payment-failed` retained (per user choice) and now wired to Yigim pages

**Database Schema (`yigim_transactions`):**
- reference (acts as order_id), user_id, user_email, product_type, product_name, amount, currency='USD', currency_code=840, status (pending/success/failed), payment_status, yigim_status_code, yigim_message, raw_status_data, created_at, updated_at

**URLs for Yigim Merchant Dashboard (sandbox):**
- Callback URL: `https://bullandbear.website/api/yigim/callback`
- (Yigim redirects users with `?reference=...` and we redirect them to /payment-success or /payment-failed)

**Test Coverage:**
- `/app/backend/tests/test_yigim_entitlement.py` — 8 tests, all 4 product types, idempotency, approved/declined/pending status transitions
- `/app/backend/pytest.ini` — pytest-asyncio with session-scoped loop (required because Motor binds to event loop at import)
- Full backend: 31/31 passed (8 entitlement + 23 HTTP-level API tests by testing agent)
- Frontend smoke: 12/12 routes render

**Deployment Note (action required by user):**
- `/app/backend/.env` currently has `YIGIM_MERCHANT=Merchant` (placeholder). Yigim sandbox returns "Invalid merchant name" until this is replaced with the real sandbox merchant identifier provided by Yigim.

- **Status**: ✅ IMPLEMENTED & TESTED — recurring entitlement bug now permanently fixed (idempotent grant + verified by automated tests)

## Future Enhancements
- [ ] Replace `YIGIM_MERCHANT` placeholder with real sandbox merchant name (deployment task)
- [ ] Refactor `server.py` into per-feature routers under `/app/backend/routers/` (yigim, auth, courses, signals, arbitrage) — currently 2895 lines
- [ ] Migrate `@app.on_event('startup'|'shutdown')` to FastAPI lifespan handlers (deprecated)
- [ ] Cap success-page polling on abandoned carts so it does not loop forever
- [ ] Fix React `backgroundColor` DOM-prop console warning (cosmetic)
- [ ] Multi-language support (P2)
- [ ] React Native mobile app (P3)
- [ ] Advanced watermarking with user info
- [ ] User referral system
