from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.orm import Session
from ..auth import decode_token
from ..database import get_db
from ..models import User
from ..ws.manager import manager

router = APIRouter()

@router.websocket("/ws/signaling")
async def signaling_ws(
    websocket: WebSocket,
    token: str = Query(...),
    room: str = Query(...),
    db: Session = Depends(get_db)
):
    username = decode_token(token)
    if not username:
        await websocket.close(code=4401)
        return
    user = db.query(User).filter(User.username == username).first()
    if not user:
        await websocket.close(code=4404)
        return

    await manager.connect_user(user.id, websocket)
    await manager.join_room(room, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            # Oda içindeki diğer katılımcılara ilet (gönderene geri gönderme!)
            for ws in list(manager.rooms.get(room, [])):
                if ws is not websocket:
                    try:
                        await ws.send_json({"type": "signal", "from": user.username, "data": data})
                    except Exception:
                        manager.rooms[room].discard(ws)
    except WebSocketDisconnect:
        manager.disconnect_user(user.id, websocket)
