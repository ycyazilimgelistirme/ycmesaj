import os
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from ..deps import get_current_user
from ..database import get_db
from ..models import User, Message, MessageType

router = APIRouter(prefix="/api/upload", tags=["upload"])

AUDIO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "audio"))
os.makedirs(AUDIO_DIR, exist_ok=True)

@router.post("/audio")
def upload_audio(to_username: str, file: UploadFile = File(...), db: Session = Depends(get_db), current=Depends(get_current_user)):
    other = db.query(User).filter(User.username == to_username).first()
    if not other:
        raise HTTPException(status_code=404, detail="Kullanıcı yok")
    ext = ".webm" if not os.path.splitext(file.filename)[1] else os.path.splitext(file.filename)[1]
    fname = f"audio_{current.id}_{other.id}_{int(datetime.utcnow().timestamp())}{ext}"
    path = os.path.join(AUDIO_DIR, fname)
    with open(path, "wb") as f:
        f.write(file.file.read())
    url = f"/uploads/audio/{fname}"
    msg = Message(
        sender_id=current.id,
        receiver_id=other.id,
        msg_type=MessageType.audio,
        file_url=url,
        content=None
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"file_url": url, "message_id": msg.id}
