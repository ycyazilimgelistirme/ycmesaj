import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from .database import Base, engine
from .routes import auth_routes, users_routes, messages_routes, upload_routes, ws_chat, ws_signaling, ws_voice

app = FastAPI(title="WhatsApp Clone")

# DB init
Base.metadata.create_all(bind=engine)

# CORS (gerekirse domainleri kısıtla)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Static ve yüklenen dosyalar
BASE_DIR = os.path.dirname(__file__)
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

os.makedirs(os.path.join(UPLOADS_DIR, "avatars"), exist_ok=True)
os.makedirs(os.path.join(UPLOADS_DIR, "audio"), exist_ok=True)

app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "static")), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# API routes
app.include_router(auth_routes.router)
app.include_router(users_routes.router)
app.include_router(messages_routes.router)
app.include_router(upload_routes.router)

# WebSocket routes
app.include_router(ws_chat.router)
app.include_router(ws_signaling.router)
app.include_router(ws_voice.router)

# Basit sayfa servisleri
from fastapi.responses import FileResponse

@app.get("/")
def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "templates", "login.html"))

@app.get("/register")
def register_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "templates", "register.html"))

@app.get("/login")
def login_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "templates", "login.html"))

@app.get("/chat")
def chat_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "templates", "chat.html"))

@app.get("/call")
def call_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "templates", "call.html"))
