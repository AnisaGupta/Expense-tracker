"""Add food-level review links and business replies.

Revision ID: 8c6d1b9e2f41
Revises: beef6cb3148d
"""
from alembic import op
import sqlalchemy as sa

revision = "8c6d1b9e2f41"
down_revision = "beef6cb3148d"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("reviews", sa.Column("menu_id", sa.Integer(), nullable=True))
    op.add_column("reviews", sa.Column("order_id", sa.Integer(), nullable=True))
    op.add_column("reviews", sa.Column("business_reply", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("replied_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_reviews_menu_id_menu_items", "reviews", "menu_items", ["menu_id"], ["menu_id"])
    op.create_foreign_key("fk_reviews_order_id_orders", "reviews", "orders", ["order_id"], ["order_id"])
    op.create_unique_constraint("uq_review_customer_order_menu", "reviews", ["customer_id", "order_id", "menu_id"])

def downgrade():
    op.drop_constraint("uq_review_customer_order_menu", "reviews", type_="unique")
    op.drop_constraint("fk_reviews_order_id_orders", "reviews", type_="foreignkey")
    op.drop_constraint("fk_reviews_menu_id_menu_items", "reviews", type_="foreignkey")
    op.drop_column("reviews", "replied_at")
    op.drop_column("reviews", "business_reply")
    op.drop_column("reviews", "order_id")
    op.drop_column("reviews", "menu_id")
