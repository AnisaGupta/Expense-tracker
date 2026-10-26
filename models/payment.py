from extensions import db

PAYMENT_STATUSES = ("pending", "success", "failed", "refunded")


class Payment(db.Model):
    __tablename__ = "payments"

    payment_id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.order_id"), unique=True, nullable=False)

    payment_method = db.Column(db.String(30), nullable=False)
    payment_status = db.Column(db.Enum(*PAYMENT_STATUSES, name="payment_status"),
                                default="pending", nullable=False)
    transaction_id = db.Column(db.String(120), nullable=True)

    # --- relationships ---
    order = db.relationship("Order", back_populates="payment")

    def __repr__(self):
        return f"<Payment order={self.order_id} status={self.payment_status}>"
