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


@worker_process_init.connect
def init_worker(**kwargs):
    global _session_factory
    from app.database import async_session
    _session_factory = async_session


@worker_process_shutdown.connect
def shutdown_worker(**kwargs):
    pass
