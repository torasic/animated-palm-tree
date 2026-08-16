from pydantic import BaseModel
from app.schemas.user import UserResponse  # Import UserResponse to keep it available under auth schemas if needed

class GoogleLoginRequest(BaseModel):
    id_token: str
