from typing import Dict, Set, Tuple
from fastapi import WebSocket
from collections import defaultdict

def room_key(u1: int, u2: int) -> str:
    a, b = sorted([u1, u2])
    return f"{a}:{b}"

class ConnectionManager:
    def __init__(self):
        self.user_sockets: Dict[int, Set[WebSocket]] = defaultdict(set)
        self.rooms: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect_user(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.user_sockets[user_id].add(websocket)

    def disconnect_user(self, user_id: int, websocket: WebSocket):
        if user_id in self.user_sockets and websocket in self.user_sockets[user_id]:
            self.user_sockets[user_id].remove(websocket)
        for rk in list(self.rooms.keys()):
            self.rooms[rk].discard(websocket)

    async def join_room(self, rk: str, ws: WebSocket):
        self.rooms[rk].add(ws)

    async def broadcast_room(self, rk: str, message: dict):
        for ws in list(self.rooms.get(rk, [])):
            try:
                await ws.send_json(message)
            except Exception:
                # bağlantı bozulduysa sessizce çıkar
                self.rooms[rk].discard(ws)

manager = ConnectionManager()
