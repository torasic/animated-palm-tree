import httpx
import uuid
import io
from PIL import Image
from fastapi import UploadFile
from app.config import settings

def _optimize_image_data(file_content: bytes) -> bytes:
    img = Image.open(io.BytesIO(file_content))
    
    # Convert transparent / RGBA to RGB for JPEG compatibility
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
        
    max_size = 1600
    width, height = img.size
    if width > max_size or height > max_size:
        if width > height:
            new_width = max_size
            new_height = int(height * (max_size / width))
        else:
            new_height = max_size
            new_width = int(width * (max_size / height))
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
    output_buffer = io.BytesIO()
    img.save(output_buffer, format="JPEG", quality=80)
    return output_buffer.getvalue()

async def upload_product_photo(file: UploadFile) -> str:
    """
    Uploads a photo to Supabase Storage and returns the public URL.
    """
    file_content = await file.read()
    content_type = file.content_type
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    
    # Try to resize and compress using Pillow in a thread pool
    try:
        import asyncio
        file_content = await asyncio.to_thread(_optimize_image_data, file_content)
        content_type = "image/jpeg"
        file_extension = "jpg"
    except Exception as e:
        print(f"Pillow image optimization failed, uploading original: {e}")

    file_name = f"{uuid.uuid4()}.{file_extension}"
    storage_url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{file_name}"
    
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type": content_type,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            storage_url,
            content=file_content,
            headers=headers
        )
        
        if response.status_code != 200:
            raise Exception(f"Failed to upload to Supabase: {response.text}")
            
    # Return the public URL
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/{file_name}"
