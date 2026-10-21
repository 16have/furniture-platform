
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.permissions import AllowAny
from .pagination import CatalogPagination
from .models import Category, Product
from .permissions import IsOwnerOrAdminOrReadOnly
from .serializers import (
    CategorySerializer,
    PublicProductSerializer,
    StaffProductSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsOwnerOrAdminOrReadOnly]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Category.objects.all()

        user = self.request.user
        is_staff_member = bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN", "CLERK"}
        )

        if not is_staff_member:
            queryset = queryset.filter(is_active=True)

        return queryset


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwnerOrAdminOrReadOnly]
    pagination_class = CatalogPagination
    lookup_field = "slug"
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["category__slug", "is_featured"]
    search_fields = ["name", "description", "sku"]
    ordering_fields = ["selling_price", "created_at", "name"]
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = Product.objects.select_related("category").prefetch_related("images")

        user = self.request.user
        if not (
            user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN", "CLERK"}
        ):
            queryset = queryset.filter(is_active=True)

        return queryset

    def get_serializer_class(self):
        user = self.request.user
        if (
            user.is_authenticated
            and user.is_active
            and user.is_staff_member
            and user.role in {"OWNER", "ADMIN", "CLERK"}
        ):
            return StaffProductSerializer

        return PublicProductSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
