from datetime import datetime

from extensions import db

OTP_ROLES = ("customer", "business")
OTP_PURPOSES = ("register", "reset")


class OTPVerification(db.Model):
    """
    One row per OTP code ever generated. Not tied to a foreign key on
    Customer/Business on purpose — a "register" OTP has to exist *before*
    the account row does, since it's what gates account creation.
    """

    __tablename__ = "otp_verifications"

    id = db.Column(db.Integer, primary_key=True)

    email = db.Column(db.String(120), nullable=False, index=True)
    role = db.Column(db.Enum(*OTP_ROLES, name="otp_role"), nullable=False)
    purpose = db.Column(db.Enum(*OTP_PURPOSES, name="otp_purpose"), nullable=False)

    otp_hash = db.Column(db.String(255), nullable=False)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    attempts = db.Column(db.Integer, default=0, nullable=False)

    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<OTPVerification {self.email} role={self.role} purpose={self.purpose}>"
