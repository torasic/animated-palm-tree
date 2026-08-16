# Grove

**Grove** adalah platform marketplace pertanian digital yang menghubungkan petani langsung dengan pembeli. Platform ini memfasilitasi transaksi jual-beli produk pertanian secara transparan dengan sistem escrow pembayaran, harga referensi berbasis AI, serta fitur permintaan pasokan (demand request) antara pembeli dan petani.

---

## Fitur Utama

- **Marketplace Produk Pertanian** - Petani dapat mempublikasikan produk, pembeli dapat mencari dan memesan langsung.
- **Manajemen Pesanan** - Alur pesanan lengkap dari konfirmasi, pengiriman, hingga penyelesaian transaksi.
- **Escrow Payment (Xendit)** - Dana pembeli ditahan aman dan baru dicairkan ke petani setelah barang diterima.
- **Ajukan Permintaan (Demand Request)** - Pembeli dapat memposting kebutuhan komoditas; petani dapat berkomitmen atau langsung memenuhi permintaan.
- **Tren Harga Referensi** - Harga pasar komoditas ditampilkan sebagai acuan, didukung data scraping dan analisis AI.
- **AI Chat (Groq + Gemini)** - Asisten percakapan berbasis AI untuk membantu pengguna navigasi platform.
- **Real-time Update via WebSocket** - Status pesanan dan permintaan diperbarui secara langsung tanpa refresh.
- **Tampilan Peta Interaktif** - Visualisasi lokasi produk/petani menggunakan Leaflet.
- **Autentikasi Google OAuth** - Login aman menggunakan akun Google.
- **Scheduler Otomatis** - Timeout konfirmasi, pengambilan, dan auto-konfirmasi pengiriman ditangani secara otomatis oleh sistem.
- **Sistem Rating** - Pembeli dapat memberikan penilaian setelah transaksi selesai.

---

## Tech Stack

### Backend

| Komponen | Teknologi |
|---|---|
| Framework | [FastAPI](https://fastapi.tiangolo.com/) |
| Database ORM | [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (async) |
| Database | PostgreSQL + [pgvector](https://github.com/pgvector/pgvector) + [GeoAlchemy2](https://geoalchemy-2.readthedocs.io/) |
| Migrasi DB | [Alembic](https://alembic.sqlalchemy.org/) |
| Validasi | [Pydantic v2](https://docs.pydantic.dev/) |
| Auth | JWT (`python-jose`), Google OAuth |
| Storage | [Supabase Storage](https://supabase.com/storage) |
| Payment | [Xendit](https://www.xendit.co/) (Invoice & Disbursement) |
| AI / LLM | [Groq](https://groq.com/), [Google Gemini](https://ai.google.dev/) |
| Scheduler | [APScheduler](https://apscheduler.readthedocs.io/) |
| Web Scraping | [Playwright](https://playwright.dev/python/) |
| Runtime | [Uvicorn](https://www.uvicorn.org/) |

### Frontend

| Komponen | Teknologi |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| UI Components | [shadcn/ui](https://ui.shadcn.com/), [Base UI](https://base-ui.com/) |
| Peta | [Leaflet](https://leafletjs.com/) + [React Leaflet](https://react-leaflet.js.org/) |
| Grafik | [D3.js](https://d3js.org/) |
| Animasi | [Framer Motion](https://www.framer.com/motion/) |
| Auth Client | [@react-oauth/google](https://github.com/MomenSherif/react-oauth-google) |
| Backend Client | [Supabase JS](https://supabase.com/docs/reference/javascript/) |

---

## Prasyarat

Pastikan software berikut sudah terinstall di sistem Anda:

- **Python** >= 3.11
- **Node.js** >= 18 & **npm** >= 9
- **PostgreSQL** >= 14 (dengan ekstensi `pgvector` dan `postgis`)
- **Git**

Akun & API Key eksternal yang dibutuhkan:

- [Supabase](https://supabase.com/) - Database & Storage
- [Xendit](https://www.xendit.co/) - Payment Gateway
- [Google Cloud Console](https://console.cloud.google.com/) - OAuth Client ID & Gemini API Key
- [Groq](https://console.groq.com/) - LLM API Key

---

## Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/your-org/grove.git
cd grove
```

### 2. Setup Backend

```bash
# Masuk ke direktori backend
cd backend

# Buat virtual environment
python -m venv venv

# Aktifkan virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install semua dependency Python
pip install -r requirements.txt

# Install Playwright browser (untuk scraping harga referensi)
playwright install chromium
```

### 3. Setup Frontend

```bash
# Dari root project, masuk ke direktori frontend
cd frontend

# Install semua dependency Node.js
npm install
```

---

## Konfigurasi

### Backend - `backend/.env`

Salin file contoh lalu isi nilainya:

```bash
cp backend/.env.example backend/.env
```

Kemudian edit `backend/.env`:

```env
# Koneksi database PostgreSQL (asyncpg)
DATABASE_URL=postgresql+asyncpg://user:password@localhost/grove

# API Keys
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# JWT Authentication
JWT_SECRET=your_jwt_secret_here

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here

# Xendit Payment Gateway
XENDIT_SECRET_KEY=your_xendit_secret_key_here
XENDIT_WEBHOOK_TOKEN=your_xendit_webhook_token_here

# Admin
ADMIN_TOKEN=your_secure_admin_token_here

# Environment ("development" atau "production")
APP_ENV=development

# CORS - pisahkan dengan koma jika lebih dari satu origin
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Timeout Alur Pesanan (dalam detik)
TIMEOUT_KONFIRMASI=86400      # 24 jam - batas konfirmasi petani
TIMEOUT_PENGAMBILAN=259200    # 72 jam - batas pengambilan barang
TIMEOUT_AUTO_CONFIRM=172800   # 48 jam - auto-konfirmasi setelah pengiriman
TIMEOUT_KOMPLAIN=86400        # 24 jam - batas pengajuan komplain
```

### Frontend - `frontend/.env.local`

Salin file contoh lalu isi nilainya:

```bash
cp frontend/.env.local.example frontend/.env.local
```

Kemudian edit `frontend/.env.local`:

```env
# URL Backend API (sesuaikan jika port berbeda)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Supabase (gunakan anon/public key, bukan service key)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### Migrasi Database

Setelah database PostgreSQL siap dan `.env` terkonfigurasi, jalankan migrasi:

```bash
cd backend
alembic upgrade head
```

---

## Cara Menjalankan

### Development

Jalankan backend dan frontend secara bersamaan di dua terminal terpisah:

**Terminal 1 - Backend:**

```bash
cd backend
# Aktifkan virtual environment terlebih dahulu
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend API akan tersedia di: `http://localhost:8000`  
Dokumentasi API interaktif (Swagger): `http://localhost:8000/docs`

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

Frontend akan tersedia di: `http://localhost:3000`

### Production

**Backend:**

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Frontend:**

```bash
cd frontend
npm run build
npm run start
```

### Health Check

Verifikasi backend berjalan dengan benar:

```bash
curl http://localhost:8000/health
# Response: {"status": "ok"}
```

---

## Menjalankan Test

```bash
cd backend
# Aktifkan virtual environment
pytest tests/ -v
```

---

## Struktur Folder

```
grove/
├── backend/                    # API server (FastAPI)
│   ├── app/
│   │   ├── models/             # Model SQLAlchemy (tabel database)
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   ├── order.py
│   │   │   ├── demand_request.py
│   │   │   ├── payment_transaction.py
│   │   │   └── ...
│   │   ├── routers/            # Endpoint API (FastAPI Routers)
│   │   │   ├── auth.py
│   │   │   ├── products.py
│   │   │   ├── orders.py
│   │   │   ├── demand_requests.py
│   │   │   ├── conversations.py
│   │   │   ├── reference_prices.py
│   │   │   └── ...
│   │   ├── schemas/            # Skema Pydantic (request/response)
│   │   ├── services/           # Business logic & integrasi eksternal
│   │   │   ├── escrow_service.py      # Logika escrow & pembayaran Xendit
│   │   │   ├── order_status_service.py
│   │   │   ├── groq_service.py        # Integrasi AI (Groq)
│   │   │   ├── scheduler.py           # Job scheduler otomatis
│   │   │   ├── xendit_service.py      # Xendit payment API wrapper
│   │   │   └── ...
│   │   ├── config.py           # Konfigurasi settings (pydantic-settings)
│   │   └── db.py               # Koneksi database async
│   ├── migrations/             # Skrip migrasi Alembic
│   ├── tests/                  # Unit & integration tests
│   ├── main.py                 # Entry point aplikasi FastAPI
│   ├── alembic.ini             # Konfigurasi Alembic
│   ├── requirements.txt        # Dependency Python
│   └── .env.example            # Template environment variables
│
├── frontend/                   # Aplikasi web (Next.js)
│   ├── src/
│   │   ├── app/                # Next.js App Router (halaman)
│   │   │   ├── (auth)/         # Halaman autentikasi
│   │   │   └── (main)/         # Halaman utama aplikasi
│   │   │       ├── beranda/    # Halaman beranda / dashboard
│   │   │       ├── produk/     # Halaman katalog produk
│   │   │       ├── pesanan/    # Manajemen pesanan
│   │   │       ├── permintaan/ # Daftar permintaan pasokan publik
│   │   │       ├── ajukan-permintaan/  # Form ajukan permintaan
│   │   │       ├── tren-harga/ # Grafik tren harga komoditas
│   │   │       ├── chat/       # Halaman AI chat
│   │   │       ├── jual/       # Kelola produk (petani)
│   │   │       ├── petani/     # Profil petani
│   │   │       └── pusat-niaga/  # Pusat niaga / pasar
│   │   ├── components/         # Komponen React yang dapat digunakan ulang
│   │   ├── hooks/              # Custom React hooks
│   │   └── lib/                # Utility functions & konfigurasi klien
│   ├── public/                 # Aset statis
│   ├── package.json
│   └── .env.local.example      # Template environment variables frontend
│
├── docs/                       # Dokumentasi teknis
│   └── alur-transaksi.md       # Pemetaan alur & analisis celah transaksi
│
├── requirements.txt            # Shortcut ke backend/requirements.txt
└── README.md
```

---

## API Endpoints Utama

| Grup | Prefix | Deskripsi |
|---|---|---|
| Auth | `/auth` | Login Google OAuth, refresh token |
| Products | `/products` | CRUD produk pertanian |
| Search | `/search` | Pencarian produk dengan semantic search |
| Orders | `/orders` | Manajemen pesanan & escrow |
| Demand Requests | `/demand_requests` | Permintaan pasokan & pencocokan |
| Reference Prices | `/reference-prices` | Harga referensi komoditas |
| Conversations | `/conversations` | AI chat berbasis Groq/Gemini |
| Ratings | `/ratings` | Penilaian transaksi |
| Users | `/users` | Profil pengguna |
| Admin | `/admin` | Endpoint administrasi |
| Webhooks | `/webhooks/xendit` | Callback pembayaran Xendit |

**WebSocket:**

- `ws://localhost:8000/ws/orders/{order_id}` - Update real-time status pesanan
- `ws://localhost:8000/ws/demand-requests/{id}` - Update real-time permintaan pasokan
