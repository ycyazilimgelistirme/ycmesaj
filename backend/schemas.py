from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    profile_image: Optional[str]
    is_online: bool
    last_seen: datetime

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    to_username: str
    content: Optional[str] = None
    msg_type: Literal["text", "audio"] = "text"
    file_url: Optional[str] = None

class MessageOut(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    content: Optional[str]
    msg_type: str
    file_url: Optional[str]
    created_at: datetime
    read_at: Optional[datetime]

    class Config:
        from_attributes = True
