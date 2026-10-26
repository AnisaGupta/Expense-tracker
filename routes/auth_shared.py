"""
Shared endpoints for sending/verifying OTP codes and resetting a
forgotten password. Used by both the customer and business login/register
pages — the "role" field in the request body tells us which table
(Customer or Business) to check against.
"""
from flask import Blueprint, request, jsonify

from extensions import db
from models import Customer, Business
from otp_service import send_otp, verify_otp, has_recent_verified_otp, OTP_LENGTH

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

ROLE_MODELS = {"customer": Customer, "business": Business}


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        data = request.form
    return data


@auth_bp.route("/send-otp", methods=["POST"])
def send_otp_route():
    data = _json_body()
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip()
    purpose = (data.get("purpose") or "").strip()

    if role not in ROLE_MODELS:
        return jsonify(success=False, message="Invalid role."), 400
    if purpose not in ("register", "reset"):
        return jsonify(success=False, message="Invalid request."), 400
    if not email:
        return jsonify(success=False, message="Please enter your email address."), 400

    model = ROLE_MODELS[role]
    existing_account = model.query.filter_by(email=email).first()

    if purpose == "register" and existing_account:
        return jsonify(success=False, message="An account with that email already exists."), 409
    if purpose == "reset" and not existing_account:
        return jsonify(success=False, message="No account found with that email."), 404

    try:
        send_otp(email, role, purpose)
    except Exception:
        # Most commonly a bad/missing Gmail App Password or no internet.
        return jsonify(
            success=False,
            message="Could not send the email right now. Please try again shortly.",
        ), 502

    return jsonify(success=True, message="A verification code has been sent to your email.")


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp_route():
    data = _json_body()
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip()
    purpose = (data.get("purpose") or "").strip()
    code = (data.get("otp") or "").strip()

    if role not in ROLE_MODELS or purpose not in ("register", "reset"):
        return jsonify(success=False, message="Invalid request."), 400
    if len(code) != OTP_LENGTH or not code.isdigit():
        return jsonify(success=False, message=f"Please enter the {OTP_LENGTH}-digit code."), 400

    ok, message = verify_otp(email, role, purpose, code)
    return jsonify(success=ok, message=message), (200 if ok else 400)


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password_route():
    data = _json_body()
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip()
    new_password = data.get("new_password") or ""

    if role not in ROLE_MODELS:
        return jsonify(success=False, message="Invalid role."), 400
    if len(new_password) < 8:
        return jsonify(success=False, message="Password must be at least 8 characters long."), 400

    # This is the real security gate: you can only reset a password if
    # you've actually verified an OTP for this email in the last few
    # minutes. Without this check, anyone could call this endpoint
    # directly and reset someone else's password.
    if not has_recent_verified_otp(email, role, "reset"):
        return jsonify(
            success=False,
            message="Please verify the OTP sent to your email first.",
        ), 403

    model = ROLE_MODELS[role]
    account = model.query.filter_by(email=email).first()
    if not account:
        return jsonify(success=False, message="No account found with that email."), 404

    account.set_password(new_password)
    db.session.commit()

    return jsonify(success=True, message="Password updated. You can now log in.")
