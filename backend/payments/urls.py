
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MpesaCallbackView,
    PaymentRecordViewSet,
    PublicMpesaInitiationView,
)

router = DefaultRouter()
router.register("records", PaymentRecordViewSet, basename="payment-record")

urlpatterns = [
    path(
        "mpesa/initiate/",
        PublicMpesaInitiationView.as_view(),
        name="mpesa-initiate",
    ),
    path(
        "mpesa/callback/<str:callback_secret>/",
        MpesaCallbackView.as_view(),
        name="mpesa-callback",
    ),
    path("", include(router.urls)),
]