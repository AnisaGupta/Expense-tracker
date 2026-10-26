"""add category slugs (seeded) and menu item food_type/prep_time fields

Revision ID: ad177ee90498
Revises: 3b374470408b
Create Date: 2026-09-06 13:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ad177ee90498'
down_revision = '3b374470408b'
branch_labels = None
depends_on = None


# The 5 dish categories the business-side menu UI has always offered.
# They previously lived only as hardcoded <option> values in
# templates/business/menu.html with no backing row in `categories` —
# this migration gives them real rows so menu items can carry a real
# category_id instead of a client-side-only string.
SEED_CATEGORIES = [
    {"slug": "mess", "category_name": "Mess Specials"},
    {"slug": "tiffin", "category_name": "Tiffins"},
    {"slug": "meals", "category_name": "Meals & Combos"},
    {"slug": "extras", "category_name": "Sides & Extras"},
    {"slug": "sweets", "category_name": "Sweets & Desserts"},
]


def upgrade():
    # `categories` has existed since the first migration but nothing has
    # ever written a row to it, so it's safe to add a NOT NULL slug and
    # seed it in the same step.
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slug', sa.String(length=50), nullable=True))

    categories_table = sa.table(
        'categories',
        sa.column('category_id', sa.Integer),
        sa.column('category_name', sa.String),
        sa.column('slug', sa.String),
    )
    op.bulk_insert(categories_table, SEED_CATEGORIES)

    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.alter_column('slug', existing_type=sa.String(length=50), nullable=False)
        batch_op.create_unique_constraint('uq_categories_slug', ['slug'])

    # menu_items: the business-menu UI has always collected a veg/non-veg
    # type and a prep time, but the schema never had columns for either —
    # they were only ever saved into the browser's localStorage.
    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'food_type',
            sa.Enum('veg', 'nonveg', name='menu_item_food_type'),
            nullable=False,
            server_default='veg',
        ))
        batch_op.add_column(sa.Column(
            'prep_time_minutes',
            sa.Integer(),
            nullable=False,
            server_default='15',
        ))


def downgrade():
    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.drop_column('prep_time_minutes')
        batch_op.drop_column('food_type')

    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_constraint('uq_categories_slug', type_='unique')
        batch_op.drop_column('slug')
