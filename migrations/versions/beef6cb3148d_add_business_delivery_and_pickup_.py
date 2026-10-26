"""Add business delivery and pickup settings

Revision ID: beef6cb3148d
Revises: 2fce68a8e0d0
Create Date: 2026-09-23 16:29:27.155683

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "beef6cb3148d"
down_revision = "2fce68a8e0d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "businesses",
        sa.Column(
            "delivery_available",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0")
        )
    )

    op.add_column(
        "businesses",
        sa.Column(
            "self_pickup_available",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0")
        )
    )


def downgrade():
    op.drop_column(
        "businesses",
        "self_pickup_available"
    )

    op.drop_column(
        "businesses",
        "delivery_available"
    )