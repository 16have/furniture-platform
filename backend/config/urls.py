from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include("catalog.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/inventory/", include("inventory.urls")),
    path("api/payments/", include("payments.urls")),
    path("api/customers/", include("customers.urls")),
    path("api/design-requests/", include("designs.urls")),
    path("api/expenses/", include("expenses.urls")),
    path("api/reports/", include("expenses.report_urls")),
    path("api/notifications/", include("notifications.urls")),
]
