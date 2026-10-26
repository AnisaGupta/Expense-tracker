from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


class Admin(UserMixin, db.Model):
    __tablename__ = "admins"

    admin_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(60), unique=True, nullable=False, index=True)
    password = db.Column(db.String(255), nullable=False)  # stores the hash

    # --- relationships ---
    approved_businesses = db.relationship("Business", back_populates="approved_by")

    def set_password(self, raw_password):
        self.password = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password, raw_password)

    # --- Flask-Login ---
    def get_id(self):
        return f"admin-{self.admin_id}"

    def __repr__(self):
        return f"<Admin {self.username}>"
