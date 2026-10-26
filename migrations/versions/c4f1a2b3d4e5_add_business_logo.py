"""add business logo path

Revision ID: c4f1a2b3d4e5
Revises: 8c6d1b9e2f41
"""
from alembic import op
import sqlalchemy as sa

revision = "c4f1a2b3d4e5"
down_revision = "8c6d1b9e2f41"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("businesses", sa.Column("logo_path", sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column("businesses", "logo_path")
