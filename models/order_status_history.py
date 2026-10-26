from datetime import datetime

from extensions import db

TRACKING_STATUSES = (
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
)


class OrderStatusHistory(db.Model):
    __tablename__ = "order_status_history"

    tracking_id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.order_id"), nullable=False)
    status = db.Column(db.Enum(*TRACKING_STATUSES, name="tracking_status"), nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # --- relationships ---
    order = db.relationship("Order", back_populates="status_history")

    def __repr__(self):
        return f"<OrderStatusHistory order={self.order_id} status={self.status}>"
