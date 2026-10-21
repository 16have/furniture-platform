
from rest_framework.routers import DefaultRouter

from .views import (
    SupplierViewSet,
    StockLevelViewSet,
    StockMovementViewSet,
    StockOperationViewSet,
)

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("stock", StockLevelViewSet, basename="stock")
router.register("movements", StockMovementViewSet, basename="stock-movement")
router.register(
    "operations",
    StockOperationViewSet,
    basename="stock-operation",
)

urlpatterns = router.urls