from datetime import datetime

from extensions import db


class Review(db.Model):
    __tablename__ = "reviews"

    review_id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.customer_id"), nullable=False)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.business_id"), nullable=False)
    menu_id = db.Column(db.Integer, db.ForeignKey("menu_items.menu_id"), nullable=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.order_id"), nullable=True)

    rating = db.Column(db.Integer, nullable=False)  # 1-5
    review = db.Column(db.Text, nullable=True)
    business_reply = db.Column(db.Text, nullable=True)
    replied_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.CheckConstraint("rating >= 1 AND rating <= 5", name="rating_between_1_and_5"),
    )

    # --- relationships ---
    customer = db.relationship("Customer", back_populates="reviews")
    business = db.relationship("Business", back_populates="reviews")
    menu_item = db.relationship("MenuItem")
    order = db.relationship("Order")

    def __repr__(self):
        return f"<Review business={self.business_id} rating={self.rating}>"
