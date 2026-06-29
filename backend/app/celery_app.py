import uuid
from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown

from app.config import settings

celery_app = Celery(
    "agentorch",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

_session_factory = None
_sync_engine = None


@worker_process_init.connect
def init_worker(**kwargs):
    global _session_factory, _sync_engine
    from app.database import engine as async_engine, async_session
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    _session_factory = async_session
    db_url = settings.database_url.replace("postgresql+psycopg2://", "postgresql+psycopg2://")
    _sync_engine = create_engine(db_url, pool_pre_ping=True)
    from app.models import Base
    Base.metadata.create_all(bind=_sync_engine)


@worker_process_shutdown.connect
def shutdown_worker(**kwargs):
    global _sync_engine
    if _sync_engine:
        _sync_engine.dispose()
