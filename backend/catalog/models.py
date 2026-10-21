from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Category(TimeStampedModel):
    name = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    image_url = models.URLField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class Product(TimeStampedModel):
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
    )

    sku = models.CharField(
        max_length=100,
        unique=True,
    )

    name = models.CharField(max_length=200)

    slug = models.SlugField(unique=True)

    description = models.TextField(blank=True)

    specifications = models.JSONField(
        default=dict,
        blank=True,
    )

    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    reorder_level = models.PositiveIntegerField(default=0)

    is_featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["is_active"]),
            models.Index(fields=["category", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class ProductImage(TimeStampedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
    )

    image_url = models.URLField()

    alt_text = models.CharField(
        max_length=255,
        blank=True,
    )

    is_primary = models.BooleanField(default=False)

    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.product.name} image"