from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        ADMIN = "ADMIN", "Admin"
        CLERK = "CLERK", "Clerk"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CLERK,
    )

    phone = models.CharField(
        max_length=30,
        blank=True,
    )

    is_staff_member = models.BooleanField(default=True)

    def __str__(self):
        return self.username