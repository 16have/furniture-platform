
from .models import AuditLog


def log_action(
    *,
    actor=None,
    action,
    entity,
    description="",
    metadata=None,
    ip_address=None,
):
    opts = entity._meta

    return AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        entity_type=opts.label,
        entity_id=str(entity.pk) if entity.pk is not None else "",
        description=description,
        metadata=metadata or {},
        ip_address=ip_address,
    )