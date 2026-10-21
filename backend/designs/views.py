from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from audit.services import log_action
from customers.models import Customer

from .models import DesignRequest
from .permissions import DesignRequestPermission
from .serializers import (
    PublicDesignRequestSerializer,
    StaffDesignRequestSerializer,
)


class DesignRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [DesignRequestPermission]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = DesignRequest.objects.select_related(
            "customer", "reviewed_by", "created_by"
        )

        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        phone = self.request.query_params.get("phone")
        if phone and self.request.user.is_authenticated:
            queryset = queryset.filter(
                customer_phone__icontains=phone.strip()
            )

        return queryset

    def get_serializer_class(self):
        user = self.request.user
        if (
            user.is_authenticated
            and getattr(user, "is_staff_member", False)
        ):
            return StaffDesignRequestSerializer
        return PublicDesignRequestSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        data = serializer.validated_data
        phone = data["customer_phone"].strip()

        customer = (
            Customer.objects.filter(phone=phone).order_by("id").first()
        )

        if customer is None:
            customer = Customer.objects.create(
                name=data["customer_name"].strip(),
                phone=phone,
                email=data.get("customer_email", ""),
            )
        else:
            changed = False
            if not customer.email and data.get("customer_email"):
                customer.email = data["customer_email"]
                changed = True
            if changed:
                customer.save(update_fields=["email", "updated_at"])

        request_obj = serializer.save(
            customer=customer,
            customer_name=data["customer_name"].strip(),
            customer_phone=phone,
            created_by=(
                self.request.user
                if self.request.user.is_authenticated
                else None
            ),
        )

        log_action(
            actor=self.request.user,
            action="DESIGN_REQUEST_CREATED",
            entity=request_obj,
            description="Custom furniture design request submitted.",
            metadata={
                "reference": request_obj.reference,
                "quantity": request_obj.quantity,
            },
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        output = PublicDesignRequestSerializer(
            serializer.instance,
            context=self.get_serializer_context(),
        )
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def transition(self, request, pk=None):
        obj = self.get_object()
        target = request.data.get("status")

        transitions = {
            DesignRequest.Status.REQUESTED: {
                DesignRequest.Status.REVIEWING
            },
            DesignRequest.Status.REVIEWING: {
                DesignRequest.Status.QUOTED
            },
            DesignRequest.Status.QUOTED: {
                DesignRequest.Status.APPROVED
            },
            DesignRequest.Status.APPROVED: {
                DesignRequest.Status.IN_PRODUCTION
            },
            DesignRequest.Status.IN_PRODUCTION: {
                DesignRequest.Status.READY
            },
            DesignRequest.Status.READY: {
                DesignRequest.Status.COMPLETED
            },
        }

        if target == DesignRequest.Status.CANCELLED:
            allowed = obj.status not in {
                DesignRequest.Status.COMPLETED,
                DesignRequest.Status.CANCELLED,
            }
        else:
            allowed = target in transitions.get(obj.status, set())

        if not allowed:
            raise ValidationError({
                "status": (
                    f"Invalid transition from {obj.status} to {target}."
                )
            })

        previous = obj.status

        if target == DesignRequest.Status.QUOTED:
            try:
                price = Decimal(str(request.data["estimated_price"]))
                days = int(request.data["estimated_production_days"])
            except (KeyError, ValueError, TypeError, InvalidOperation):
                raise ValidationError({
                    "quote": (
                        "Provide estimated_price and "
                        "estimated_production_days."
                    )
                })

            if not price.is_finite() or price < 0:
                raise ValidationError({
                    "estimated_price": "Must be a non-negative amount."
                })

            if days < 1:
                raise ValidationError({
                    "estimated_production_days": "Must be at least 1."
                })

            obj.estimated_price = price
            obj.estimated_production_days = days

        if "internal_production_cost" in request.data:
            if request.user.role not in {"OWNER", "ADMIN"}:
                raise ValidationError({
                    "internal_production_cost": "Owner/admin only."
                })
            try:
                cost = Decimal(str(request.data["internal_production_cost"]))
            except (ValueError, TypeError, InvalidOperation):
                raise ValidationError({
                    "internal_production_cost": "Enter a valid amount."
                })

            if not cost.is_finite() or cost < 0:
                raise ValidationError({
                    "internal_production_cost":
                    "Must be a non-negative amount."
                })

            obj.internal_production_cost = cost

        if "internal_notes" in request.data:
            if request.user.role not in {"OWNER", "ADMIN"}:
                raise ValidationError({
                    "internal_notes": "Owner/admin only."
                })
            obj.internal_notes = str(request.data["internal_notes"])

        obj.status = target
        obj.reviewed_by = request.user
        obj.save()

        log_action(
            actor=request.user,
            action="DESIGN_REQUEST_STATUS_CHANGED",
            entity=obj,
            description="Custom design request updated by staff.",
            metadata={
                "previous_status": previous,
                "new_status": obj.status,
            },
        )

        return Response(StaffDesignRequestSerializer(obj).data)
