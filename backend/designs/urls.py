from rest_framework.routers import DefaultRouter

from .views import DesignRequestViewSet

router = DefaultRouter()
router.register("", DesignRequestViewSet, basename="design-request")

urlpatterns = router.urls
