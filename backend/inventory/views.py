
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Supplier, StockLevel, StockMovement
from .permissions import IsStaffMember, IsOwnerOrAdmin
from .serializers import (
    SupplierSerializer,
    StockLevelSerializer,
    StockMovementSerializer,
    ReceiveStockSerializer,
    StockOperationSerializer,
    StockAdjustmentSerializer,
)
from .services import (
    receive_stock,
    record_damage,
    adjust_stock,
)


def run_stock_operation(operation, **kwargs):
    try:
        stock = operation(**kwargs)
    except DjangoValidationError as exc:
        raise ValidationError(exc.messages) from exc

    return StockLevelSerializer(stock).data


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsOwnerOrAdmin]
    search_fields = ["name", "contact_person", "phone", "email"]
    filterset_fields = ["is_active"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]


class StockLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockLevel.objects.select_related("product").all()
    serializer_class = StockLevelSerializer
    permission_classes = [IsStaffMember]
    search_fields = ["product__name", "product__sku"]
    filterset_fields = ["product"]
    ordering_fields = ["quantity_on_hand", "updated_at"]
    ordering = ["product__name"]

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        queryset = [
            stock
            for stock in self.filter_queryset(self.get_queryset())
            if stock.is_low_stock
        ]
        page = self.paginate_queryset(queryset)

        if page is not None:
            data = self.get_serializer(page, many=True).data
            return self.get_paginated_response(data)

        return Response(self.get_serializer(queryset, many=True).data)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related(
        "product", "supplier", "created_by"
    ).all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsStaffMember]
    filterset_fields = ["product", "movement_type", "supplier"]
    search_fields = ["product__name", "product__sku", "reference"]
    ordering_fields = ["created_at", "movement_type"]
    ordering = ["-created_at"]


class StockOperationViewSet(viewsets.ViewSet):
    permission_classes = [IsOwnerOrAdmin]

    @action(detail=False, methods=["post"])
    def receive(self, request):
        serializer = ReceiveStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = run_stock_operation(
            receive_stock,
            product_id=data["product_id"],
            quantity=data["quantity"],
            user=request.user,
            supplier_id=data.get("supplier_id"),
            reference=data.get("reference", ""),
            notes=data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"])
    def damage(self, request):
        serializer = StockOperationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = run_stock_operation(
            record_damage,
            product_id=data["product_id"],
            quantity=data["quantity"],
            user=request.user,
            reference=data.get("reference", ""),
            notes=data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"])
    def adjust(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = run_stock_operation(
            adjust_stock,
            product_id=data["product_id"],
            quantity_delta=data["quantity_delta"],
            user=request.user,
            reference=data.get("reference", ""),
            notes=data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_200_OK)