
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAuthorizedStaff(BasePermission):
    message = "An authorized staff account is required."

    def has_permission(self, request, view):
        user = request.user

        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN", "CLERK"}
        )