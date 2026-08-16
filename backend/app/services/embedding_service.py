import asyncio
import logging
from typing import List
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

_client = None

def get_genai_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client

class EmbeddingService:
    # Hard timeout per attempt: prevents indefinite hang on slow API
    _TIMEOUT_SECONDS = 10.0

    async def generate_embedding(self, text: str) -> List[float]:
        # Sanitize/clean input text
        cleaned_text = text.replace("\n", " ")
        
        # Exponential backoff retry logic (up to 3 attempts)
        for attempt in range(3):
            try:
                loop = asyncio.get_running_loop()
                
                def _call_api():
                    client = get_genai_client()
                    response = client.models.embed_content(
                        model="gemini-embedding-001",
                        contents=cleaned_text,
                        config=types.EmbedContentConfig(
                            output_dimensionality=768
                        )
                    )
                    return response.embeddings[0].values
                
                # Enforce per-attempt timeout so a slow API call fails fast
                async with asyncio.timeout(self._TIMEOUT_SECONDS):
                    embedding_values = await loop.run_in_executor(None, _call_api)
                return embedding_values
                
            except TimeoutError:
                logger.warning(
                    "Embedding API call timed out (attempt %d/3, timeout=%ss)",
                    attempt + 1, self._TIMEOUT_SECONDS
                )
                if attempt == 2:
                    raise RuntimeError(
                        f"Embedding API timed out after {int(self._TIMEOUT_SECONDS)}s "
                        "on all 3 attempts"
                    )
                await asyncio.sleep(2 ** attempt)
            except Exception as e:
                # If it's the last attempt, raise the error
                if attempt == 2:
                    raise e
                # Wait 2^attempt * 1 seconds (1s, 2s) before retrying
                await asyncio.sleep(2 ** attempt)

# Export the instance to match imports in products.py and search.py
embedding_service = EmbeddingService()

