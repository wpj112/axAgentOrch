from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import GlobalSetting
from app.schemas import SettingsRequest, SettingsResponse
from app.config import settings as env_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def get_global_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(GlobalSetting))
    rows = {r.key: r.value for r in result.scalars().all()}
    return rows


@router.get("", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    rows = await get_global_settings(db)
    return SettingsResponse(
        model=rows.get("model", env_settings.llm_model),
        api_key=rows.get("api_key", env_settings.openai_api_key),
        base_url=rows.get("base_url", env_settings.openai_base_url),
        temperature=rows.get("temperature", "0.7"),
        theme=rows.get("theme", "dark"),
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(data: SettingsRequest, db: AsyncSession = Depends(get_db)):
    updates = {
        "model": data.model,
        "api_key": data.api_key,
        "base_url": data.base_url,
        "temperature": data.temperature,
        "theme": data.theme,
    }
    for key, value in updates.items():
        if value is None:
            continue
        result = await db.execute(select(GlobalSetting).where(GlobalSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(GlobalSetting(key=key, value=value))
    await db.commit()
    return await get_settings(db)
