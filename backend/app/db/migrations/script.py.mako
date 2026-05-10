"""Alembic migration script template."""
from typing import Collection

revision: str
down_revision: str | None
branch_labels: str | Collection[str] | None = None
depends_on: str | Collection[str] | None = None


def upgrade() -> None:
    ...


def downgrade() -> None:
    ...