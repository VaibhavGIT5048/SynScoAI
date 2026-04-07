from openai import AsyncOpenAI
from app.config import settings

client = AsyncOpenAI(
    api_key=settings.openai_api_key,
    timeout=settings.request_timeout_seconds,
)
MODEL = settings.openai_model


async def chat(messages: list, temperature: float = 0.7) -> str:
    response = await client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content.strip()