from rest_framework.permissions import BasePermission


class IsOwnerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "is_staff_member", False)
            and user.role in {"OWNER", "ADMIN"}
        )
