from django.urls import path

from .views import (
    ExpensesExportView,
    ReportSummaryView,
    SalesExportView,
)

urlpatterns = [
    path("summary/", ReportSummaryView.as_view(), name="report-summary"),
    path("sales/", SalesExportView.as_view(), name="sales-export"),
    path("expenses/", ExpensesExportView.as_view(), name="expenses-export"),
]
