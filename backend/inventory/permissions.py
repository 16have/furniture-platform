
from rest_framework.permissions import BasePermission


class IsStaffMember(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN", "CLERK"}
        )


class IsOwnerOrAdmin(BasePermission):
    message = "Only an owner or admin can perform this operation."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN"}
        )