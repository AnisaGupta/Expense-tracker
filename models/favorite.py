from datetime import datetime
from extensions import db

class Favorite(db.Model):
    __tablename__ = "favorites"

    favorite_id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.customer_id", ondelete="CASCADE"), nullable=False)
    menu_id = db.Column(db.Integer, db.ForeignKey("menu_items.menu_id", ondelete="CASCADE"), nullable=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.business_id", ondelete="CASCADE"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    customer = db.relationship("Customer", backref=db.backref("favorites", cascade="all, delete-orphan"))
    menu_item = db.relationship("MenuItem", backref=db.backref("favorited_by", cascade="all, delete-orphan"))
    business = db.relationship("Business", backref=db.backref("favorited_by", cascade="all, delete-orphan"))