from datetime import datetime

from extensions import db

PAYMENT_METHODS = ("online", "cod")
DELIVERY_TYPES = ("delivery", "pickup")
ORDER_STATUSES = (
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
)


class Order(db.Model):
    __tablename__ = "orders"

    order_id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.customer_id"), nullable=False)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.business_id"), nullable=False)

    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_method = db.Column(db.Enum(*PAYMENT_METHODS, name="order_payment_method"), nullable=False)
    delivery_type = db.Column(db.Enum(*DELIVERY_TYPES, name="order_delivery_type"), nullable=False)
    status = db.Column(db.Enum(*ORDER_STATUSES, name="order_status"), default="pending", nullable=False)

    ordered_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # --- relationships ---
    customer = db.relationship("Customer", back_populates="orders")
    business = db.relationship("Business", back_populates="orders")
    items = db.relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payment = db.relationship(
        "Payment", back_populates="order", uselist=False, cascade="all, delete-orphan"
    )
    status_history = db.relationship(
        "OrderStatusHistory", back_populates="order", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Order {self.order_id} status={self.status}>"
    
    delivery_person_id = db.Column(
    db.Integer,
    db.ForeignKey("delivery_persons.delivery_person_id"),
    nullable=True
    )
    
    # --- relationships ---
    delivery_person = db.relationship(
    "DeliveryPerson",
    backref=db.backref(
        "orders",
        lazy=True
    )
    )


class OrderItem(db.Model):
    __tablename__ = "order_items"

    order_item_id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.order_id"), nullable=False)
    menu_id = db.Column(db.Integer, db.ForeignKey("menu_items.menu_id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Numeric(8, 2), nullable=False)  # price at time of order

    # --- relationships ---
    order = db.relationship("Order", back_populates="items")
    menu_item = db.relationship("MenuItem", back_populates="order_items")

    def __repr__(self):
        return f"<OrderItem order={self.order_id} menu={self.menu_id} qty={self.quantity}>"
