from extensions import db


class Category(db.Model):
    __tablename__ = "categories"

    category_id = db.Column(db.Integer, primary_key=True)
    category_name = db.Column(db.String(80), unique=True, nullable=False)
    # Short machine-friendly key used by the business menu UI's filters
    # and category dropdown (e.g. "mess", "tiffin").
    slug = db.Column(db.String(50), unique=True, nullable=False)

    # --- relationships ---
    menu_items = db.relationship("MenuItem", back_populates="category")

    def __repr__(self):
        return f"<Category {self.category_name}>"
