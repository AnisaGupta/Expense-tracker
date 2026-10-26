from datetime import datetime

from extensions import db


class Cart(db.Model):
    """Each customer has exactly one (active) cart."""

    __tablename__ = "cart"

    cart_id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(
        db.Integer, db.ForeignKey("customers.customer_id"), unique=True, nullable=False
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # --- relationships ---
    customer = db.relationship("Customer", back_populates="cart")
    items = db.relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Cart {self.cart_id} customer={self.customer_id}>"


class CartItem(db.Model):
    """
    One row per menu item inside a cart. Normalized out of the Cart table
    as recommended, since a cart can hold many menu items (many-to-many
    between Cart and MenuItem).
    """

    __tablename__ = "cart_items"

    cart_item_id = db.Column(db.Integer, primary_key=True)
    cart_id = db.Column(db.Integer, db.ForeignKey("cart.cart_id"), nullable=False)
    menu_id = db.Column(db.Integer, db.ForeignKey("menu_items.menu_id"), nullable=False)
    quantity = db.Column(db.Integer, default=1, nullable=False)
    added_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # --- relationships ---
    cart = db.relationship("Cart", back_populates="items")
    menu_item = db.relationship("MenuItem", back_populates="cart_items")

    def __repr__(self):
        return f"<CartItem cart={self.cart_id} menu={self.menu_id} qty={self.quantity}>"
