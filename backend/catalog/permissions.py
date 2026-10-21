
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsOwnerOrAdminOrReadOnly(BasePermission):
    """
    Anyone may read public catalog data.
    Only active owners and admins may create, update, or deactivate catalog records.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN"}
        )