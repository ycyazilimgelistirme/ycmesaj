import os
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from ..deps import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "avatars"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user

@router.post("/me/profile-image", response_model=UserOut)
def upload_profile_image(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename)[1].lower() or ".png"
    fname = f"user_{user.id}_{int(datetime.utcnow().timestamp())}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        f.write(file.file.read())
    user.profile_image = f"/uploads/avatars/{fname}"
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("/{username}/status")
def status(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı yok")
    return {"is_online": user.is_online, "last_seen": user.last_seen}
