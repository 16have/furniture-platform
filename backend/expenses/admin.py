from django.contrib import admin

from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "expense_date",
        "category",
        "description",
        "amount",
        "recorded_by",
    )
    list_filter = ("category", "expense_date")
    search_fields = (
        "description",
        "reference",
        "product__name",
        "supplier__name",
    )
    date_hierarchy = "expense_date"
