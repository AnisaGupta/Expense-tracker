from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db


class Customer(UserMixin, db.Model):
    __tablename__ = "customers"

    customer_id = db.Column(db.Integer, primary_key=True)

    full_name = db.Column(db.String(120), nullable=False)
    username = db.Column(db.String(60), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=False)
    password = db.Column(db.String(255), nullable=False)  # stores the hash

    address = db.Column(db.Text, nullable=True)
    latitude = db.Column(db.Numeric(10, 6), nullable=True)
    longitude = db.Column(db.Numeric(10, 6), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # --- relationships ---
    cart = db.relationship(
        "Cart", back_populates="customer", uselist=False, cascade="all, delete-orphan"
    )
    orders = db.relationship("Order", back_populates="customer", cascade="all, delete-orphan")
    reviews = db.relationship("Review", back_populates="customer", cascade="all, delete-orphan")

    def set_password(self, raw_password):
        self.password = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password, raw_password)

    def update_location(self, lat, lng, address=None):
        """Helper method to update coordinates cleanly."""
        self.latitude = lat
        self.longitude = lng
        if address:
            self.address = address

    def to_dict(self):
        """Serializes user attributes to a dictionary for API responses."""
        return {
            "customer_id": self.customer_id,
            "full_name": self.full_name,
            "username": self.username,
            "email": self.email,
            "address": self.address,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
        }

    # --- Flask-Login ---
    def get_id(self):
        return f"customer-{self.customer_id}"

    def __repr__(self):
        return f"<Customer {self.username}>"