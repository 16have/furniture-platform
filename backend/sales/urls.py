from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    OrderViewSet,
    PublicCheckoutView,
    PublicOrderTrackingView,
    SuspendedCartViewSet,
)

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")
router.register("suspended-carts", SuspendedCartViewSet, basename="suspended-cart")

urlpatterns = [
    path("checkout/", PublicCheckoutView.as_view(), name="public-checkout"),
    path("track/", PublicOrderTrackingView.as_view(), name="public-order-tracking"),
    *router.urls,
]
