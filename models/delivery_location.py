from datetime import datetime

from extensions import db


class OrderDeliveryLocation(db.Model):
    __tablename__ = "order_delivery_locations"

    location_id = db.Column(
        db.Integer,
        primary_key=True
    )

    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.order_id"),
        nullable=False,
        unique=True
    )

    latitude = db.Column(
        db.Numeric(10, 7),
        nullable=False
    )

    longitude = db.Column(
        db.Numeric(10, 7),
        nullable=False
    )

    accuracy = db.Column(
        db.Float,
        nullable=True
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    order = db.relationship(
        "Order",
        backref=db.backref(
            "delivery_location",
            uselist=False
        )
    )