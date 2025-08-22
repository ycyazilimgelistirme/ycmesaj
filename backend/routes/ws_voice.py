from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.orm import Session
from ..auth import decode_token
from ..database import get_db
from ..models import User
from ..ws.manager import manager, room_key

router = APIRouter()

@router.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket, token: str = Query(...), peer: str = Query(...), db: Session = Depends(get_db)):
    username = decode_token(token)
    if not username:
        await websocket.close(code=4401); return
    me = db.query(User).filter(User.username == username).first()
    other = db.query(User).filter(User.username == peer).first()
    if not me or not other:
        await websocket.close(code=4404); return

    rk = f"voice:{room_key(me.id, other.id)}"
    await manager.connect_user(me.id, websocket)
    await manager.join_room(rk, websocket)

    try:
        while True:
            # İkili hale getirilmiş PCM / veya MediaRecorder Blob chunk'ı
            msg = await websocket.receive_bytes()
            # Diğer tarafa aynen yayınla
            await manager.broadcast_room(rk, {"type": "audio-chunk", "data": msg.hex()})
    except WebSocketDisconnect:
        manager.disconnect_user(me.id, websocket)
