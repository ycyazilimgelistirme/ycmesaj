from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from ..deps import get_current_user
from ..database import get_db
from ..models import User, Message, MessageType
from ..schemas import MessageCreate, MessageOut

router = APIRouter(prefix="/api/messages", tags=["messages"])

@router.post("/", response_model=MessageOut)
def send_message(payload: MessageCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    to_user = db.query(User).filter(User.username == payload.to_username).first()
    if not to_user:
        raise HTTPException(status_code=404, detail="Hedef kullanıcı yok")
    msg = Message(
        sender_id=current.id,
        receiver_id=to_user.id,
        content=payload.content,
        msg_type=MessageType(payload.msg_type),
        file_url=payload.file_url
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg

@router.get("/with/{username}")
def history(username: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    other = db.query(User).filter(User.username == username).first()
    if not other:
        raise HTTPException(status_code=404, detail="Kullanıcı yok")
    msgs = (
        db.query(Message)
        .filter(
            ((Message.sender_id == current.id) & (Message.receiver_id == other.id) & (Message.deleted_by_sender == False))
            | ((Message.sender_id == other.id) & (Message.receiver_id == current.id) & (Message.deleted_by_receiver == False))
        )
        .order_by(Message.created_at.asc())
        .all()
    )
    return [MessageOut.model_validate(m) for m in msgs]

@router.delete("/{message_id}")
def delete_message(message_id: int, db: Session = Depends(get_db), current=Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mesaj yok")
    if msg.sender_id == current.id:
        msg.deleted_by_sender = True
    elif msg.receiver_id == current.id:
        msg.deleted_by_receiver = True
    else:
        raise HTTPException(status_code=403, detail="Yetkisiz")
    db.add(msg)
    db.commit()
    return {"ok": True}

@router.post("/{message_id}/read")
def mark_read(message_id: int, db: Session = Depends(get_db), current=Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == message_id, Message.receiver_id == current.id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mesaj yok")
    msg.read_at = datetime.utcnow()
    db.add(msg)
    db.commit()
    return {"ok": True, "read_at": msg.read_at}
