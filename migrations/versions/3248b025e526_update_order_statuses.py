"""Update order statuses

Revision ID: 3248b025e526
Revises: a6d97107b6bb
Create Date: 2026-09-22 22:45:41.181952

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '3248b025e526'
down_revision = 'a6d97107b6bb'
branch_labels = None
depends_on = None


def upgrade():
    # Update order status history statuses
    with op.batch_alter_table('order_status_history', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=mysql.ENUM(
                'order_placed',
                'confirmed',
                'preparing',
                'ready',
                'out_for_delivery',
                'delivered'
            ),
            type_=sa.Enum(
                'pending',
                'confirmed',
                'preparing',
                'ready',
                'out_for_delivery',
                'delivered',
                'cancelled',
                name='tracking_status'
            ),
            existing_nullable=False
        )

    # Update order statuses
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=mysql.ENUM(
                'pending',
                'preparing',
                'ready',
                'delivered'
            ),
            type_=sa.Enum(
                'pending',
                'confirmed',
                'preparing',
                'ready',
                'out_for_delivery',
                'delivered',
                'cancelled',
                name='order_status'
            ),
            existing_nullable=False
        )


def downgrade():
    # Restore original order statuses
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.Enum(
                'pending',
                'confirmed',
                'preparing',
                'ready',
                'out_for_delivery',
                'delivered',
                'cancelled',
                name='order_status'
            ),
            type_=mysql.ENUM(
                'pending',
                'preparing',
                'ready',
                'delivered'
            ),
            existing_nullable=False
        )

    # Restore original order status history statuses
    with op.batch_alter_table('order_status_history', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.Enum(
                'pending',
                'confirmed',
                'preparing',
                'ready',
                'out_for_delivery',
                'delivered',
                'cancelled',
                name='tracking_status'
            ),
            type_=mysql.ENUM(
                'order_placed',
                'confirmed',
                'preparing',
                'ready',
                'out_for_delivery',
                'delivered'
            ),
            existing_nullable=False
        )