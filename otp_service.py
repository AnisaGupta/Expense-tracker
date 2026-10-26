"""
Shared OTP logic: generating a code, emailing it, and verifying what the
user types back in. Used for both "register" (verify email before an
account is created) and "reset" (forgot password) — for both Customers
and Businesses — so the logic lives in one place instead of four copies.
"""
import random
from datetime import datetime, timedelta

from werkzeug.security import generate_password_hash, check_password_hash
from flask_mail import Message

from extensions import db, mail
from models.otp import OTPVerification

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
MAX_ATTEMPTS = 5
# How long after verifying an OTP the person has to actually finish the
# action it was for (create the account / set the new password).
VERIFIED_WINDOW_MINUTES = 15


def _generate_code():
    return "".join(str(random.randint(0, 9)) for _ in range(OTP_LENGTH))


def send_otp(email, role, purpose):
    """Create a new OTP row (hashed) and email the plain code to the user."""
    code = _generate_code()

    otp_row = OTPVerification(
        email=email,
        role=role,
        purpose=purpose,
        otp_hash=generate_password_hash(code),
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    db.session.add(otp_row)
    db.session.commit()

    action = "verify your email" if purpose == "register" else "reset your password"
    message = Message(
        subject="Your LocalBites verification code",
        recipients=[email],
        body=(
            f"Your LocalBites OTP to {action} is: {code}\n\n"
            f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
            f"If you didn't request this, you can safely ignore this email."
        ),
    )
    mail.send(message)


def verify_otp(email, role, purpose, submitted_code):
    """
    Check the most recent, not-yet-verified OTP for this email/role/purpose.
    Returns (ok: bool, message: str). Marks the row verified on success.
    """
    otp_row = (
        OTPVerification.query.filter_by(
            email=email, role=role, purpose=purpose, is_verified=False
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )

    if not otp_row:
        return False, "No verification code found for this email. Please request a new one."

    if otp_row.expires_at < datetime.utcnow():
        return False, "This code has expired. Please request a new one."

    if otp_row.attempts >= MAX_ATTEMPTS:
        return False, "Too many incorrect attempts. Please request a new code."

    if not check_password_hash(otp_row.otp_hash, submitted_code):
        otp_row.attempts += 1
        db.session.commit()
        return False, "Incorrect code. Please try again."

    otp_row.is_verified = True
    db.session.commit()
    return True, "Verified."


def has_recent_verified_otp(email, role, purpose):
    """
    Used to gate the *actual* account creation / password reset request,
    so those endpoints can't be called directly while skipping the OTP
    step entirely.
    """
    otp_row = (
        OTPVerification.query.filter_by(
            email=email, role=role, purpose=purpose, is_verified=True
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )
    if not otp_row:
        return False
    cutoff = datetime.utcnow() - timedelta(minutes=VERIFIED_WINDOW_MINUTES)
    return otp_row.created_at >= cutoff
