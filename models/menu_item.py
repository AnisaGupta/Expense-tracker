from extensions import db


class MenuItem(db.Model):
    __tablename__ = "menu_items"

    menu_id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.business_id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.category_id"), nullable=False)

    food_name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Numeric(8, 2), nullable=False)
    image = db.Column(db.String(255), nullable=True)
    is_available = db.Column(db.Boolean, default=True, nullable=False)
    food_type = db.Column(db.Enum("veg", "nonveg", name="menu_item_food_type"),
                           default="veg", nullable=False)
    prep_time_minutes = db.Column(db.Integer, default=15, nullable=False)

    # --- relationships ---
    business = db.relationship("Business", back_populates="menu_items")
    category = db.relationship("Category", back_populates="menu_items")
    cart_items = db.relationship("CartItem", back_populates="menu_item")
    order_items = db.relationship("OrderItem", back_populates="menu_item")

    def __repr__(self):
        return f"<MenuItem {self.food_name}>"
