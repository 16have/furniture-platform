from rest_framework.permissions import BasePermission, SAFE_METHODS


class DesignRequestPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        is_staff_member = bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "is_staff_member", False)
            and user.role in {"OWNER", "ADMIN", "CLERK"}
        )

        if request.method == "POST" and view.action == "create":
            return True

        if request.method in SAFE_METHODS:
            return is_staff_member

        return bool(
            is_staff_member and user.role in {"OWNER", "ADMIN"}
        )
