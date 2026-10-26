from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db

# Matches the <option value="..."> list in business-register.html.
# This is the *kind* of food business, separate from food Categories
# (Pizza, Chinese, etc.) used on the menu side.
BUSINESS_TYPES = (
    "mess",
    "home_kitchen",
    "tiffin_service",
    "canteen",
    "poli_bhaji_kendra",
    "festival_seller",
)

BUSINESS_STATUSES = ("active", "pending")


class Business(UserMixin, db.Model):
    __tablename__ = "businesses"

    business_id = db.Column(db.Integer, primary_key=True)

    business_name = db.Column(db.String(150), nullable=False)
    owner_name = db.Column(db.String(120), nullable=False)
    username = db.Column(db.String(60), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=False)
    password = db.Column(db.String(255), nullable=False)  # stores the hash

    address = db.Column(db.Text, nullable=True)
    city = db.Column(db.String(100), nullable=True)
    pincode = db.Column(db.String(10), nullable=True)
    latitude = db.Column(db.Numeric(10, 6), nullable=True)
    longitude = db.Column(db.Numeric(10, 6), nullable=True)
    description = db.Column(db.Text, nullable=True)
    logo_path = db.Column(db.String(255), nullable=True)

    opening_time = db.Column(db.Time, nullable=True)
    closing_time = db.Column(db.Time, nullable=True)
    
    delivery_available = db.Column(
        db.Boolean,
        default=False,
        nullable=False
    )

    self_pickup_available = db.Column(
        db.Boolean,
        default=False,
        nullable=False
    )

    status = db.Column(
        db.Enum(*BUSINESS_STATUSES, name="business_status"),
        default="pending",
        nullable=False,
    )

    # Extra field the register form collects (type of food business)
    business_type = db.Column(
        db.Enum(*BUSINESS_TYPES, name="business_type"), nullable=False
    )

    # Verification documents uploaded at registration (paths, not the files themselves)
    doc_owner_id_path = db.Column(db.String(255), nullable=True)
    doc_business_proof_path = db.Column(db.String(255), nullable=True)
    doc_premises_owned_path = db.Column(db.String(255), nullable=True)
    doc_premises_rented_path = db.Column(db.String(255), nullable=True)

    # Which admin approved this business (nullable until approved)
    approved_by_admin_id = db.Column(
        db.Integer, db.ForeignKey("admins.admin_id"), nullable=True
    )

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # --- relationships ---
    approved_by = db.relationship("Admin", back_populates="approved_businesses")
    menu_items = db.relationship(
        "MenuItem", back_populates="business", cascade="all, delete-orphan"
    )
    orders = db.relationship(
        "Order", back_populates="business", cascade="all, delete-orphan"
    )
    reviews = db.relationship(
        "Review", back_populates="business", cascade="all, delete-orphan"
    )

    def set_password(self, raw_password):
        self.password = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password, raw_password)

    # --- Flask-Login ---
    def get_id(self):
        return f"business-{self.business_id}"

    def __repr__(self):
        return f"<Business {self.username}>"