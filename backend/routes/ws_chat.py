from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db
from ..models import User, Message, MessageType
from ..auth import decode_token
from ..ws.manager import manager, room_key

router = APIRouter()

@router.websocket("/ws/chat")
async def chat_ws(websocket: WebSocket, token: str = Query(...), peer: str = Query(...), db: Session = Depends(get_db)):
    username = decode_token(token)
    if not username:
        await websocket.close(code=4401)
        return
    me = db.query(User).filter(User.username == username).first()
    other = db.query(User).filter(User.username == peer).first()
    if not me or not other:
        await websocket.close(code=4404)
        return

    await manager.connect_user(me.id, websocket)
    me.is_online = True
    me.last_seen = datetime.utcnow()
    db.add(me); db.commit()

    rk = room_key(me.id, other.id)
    await manager.join_room(rk, websocket)

    # İlk bağlandığında geçmiş (opsiyonel olarak son 50)
    recent = (
        db.query(Message)
        .filter(
            ((Message.sender_id == me.id) & (Message.receiver_id == other.id) & (Message.deleted_by_sender == False)) |
            ((Message.sender_id == other.id) & (Message.receiver_id == me.id) & (Message.deleted_by_receiver == False))
        )
        .order_by(Message.created_at.asc())
        .limit(100)
        .all()
    )
    await websocket.send_json({"type": "history", "items": [
        {
            "id": m.id, "from": m.sender_id, "to": m.receiver_id, "content": m.content,
            "msg_type": m.msg_type.value, "file_url": m.file_url,
            "created_at": m.created_at.isoformat(), "read_at": m.read_at.isoformat() if m.read_at else None
        } for m in recent
    ]})

    try:
        while True:
            data = await websocket.receive_json()
            t = data.get("type")

            if t == "message":
                content = data.get("content")
                msg_type = data.get("msg_type", "text")
                file_url = data.get("file_url")
                msg = Message(
                    sender_id=me.id, receiver_id=other.id,
                    content=content, msg_type=MessageType(msg_type), file_url=file_url
                )
                db.add(msg); db.commit(); db.refresh(msg)

                payload = {
                    "type": "message",
                    "id": msg.id,
                    "from": me.id,
                    "to": other.id,
                    "content": msg.content,
                    "msg_type": msg.msg_type.value,
                    "file_url": msg.file_url,
                    "created_at": msg.created_at.isoformat()
                }
                await manager.broadcast_room(rk, payload)

            elif t == "read":
                mid = int(data.get("message_id"))
                msg = db.query(Message).filter(Message.id == mid, Message.receiver_id == me.id).first()
                if msg and not msg.read_at:
                    msg.read_at = datetime.utcnow()
                    db.add(msg); db.commit()
                    await manager.broadcast_room(rk, {"type": "read", "message_id": msg.id, "read_at": msg.read_at.isoformat()})

            elif t == "delete":
                mid = int(data.get("message_id"))
                msg = db.query(Message).filter(Message.id == mid).first()
                if msg:
                    if msg.sender_id == me.id:
                        msg.deleted_by_sender = True
                    elif msg.receiver_id == me.id:
                        msg.deleted_by_receiver = True
                    db.add(msg); db.commit()
                    await manager.broadcast_room(rk, {"type": "delete", "message_id": mid})
    except WebSocketDisconnect:
        manager.disconnect_user(me.id, websocket)
        me.is_online = False
        me.last_seen = datetime.utcnow()
        db.add(me); db.commit()
