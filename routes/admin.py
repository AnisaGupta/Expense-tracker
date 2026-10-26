"""
Admin routes: login, the pending-business approval dashboard, and a
protected file viewer for the verification documents businesses upload
at registration.

This blueprint is registered in app.py WITHOUT a hardcoded url_prefix —
the actual path comes from Config.ADMIN_URL_PREFIX (set in .env), so the
real "front door" URL is never visible in this source file either.
"""
import os

from flask import (
    Blueprint, render_template, request, jsonify, redirect, url_for,
    current_app, abort, send_from_directory
)
from flask_login import login_user, logout_user, current_user

from extensions import db
from models import Admin, Business
from auth import admin_login_required

admin_bp = Blueprint("admin", __name__)


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        data = request.form
    return data


# ---------------------------------------------------------------------
# Login — deliberately NOT decorated with admin_login_required (it has
# to be reachable by an admin who isn't logged in yet). What keeps this
# safe is that it's never linked anywhere and the path itself is hidden
# behind Config.ADMIN_URL_PREFIX.
# ---------------------------------------------------------------------

@admin_bp.route("/login", methods=["GET"])
def login():
    if current_user.is_authenticated and isinstance(current_user, Admin):
        return redirect(url_for("admin.dashboard"))
    return render_template("admin/login.html")


@admin_bp.route("/login", methods=["POST"])
def login_submit():
    data = _json_body()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify(success=False, message="Please enter your username and password."), 400

    admin = Admin.query.filter_by(username=username).first()
    if not admin or not admin.check_password(password):
        return jsonify(success=False, message="Invalid username or password."), 401

    login_user(admin)
    return jsonify(success=True, redirect=url_for("admin.dashboard"))


@admin_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return jsonify(success=True, redirect=url_for("admin.login"))


# ---------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------

@admin_bp.route("/dashboard")
@admin_login_required
def dashboard():
    pending = Business.query.filter_by(status="pending").order_by(Business.created_at.asc()).all()
    active = Business.query.filter_by(status="active").order_by(Business.created_at.desc()).all()
    return render_template("admin/dashboard.html", pending=pending, active=active)


@admin_bp.route("/businesses/<int:business_id>/approve", methods=["POST"])
@admin_login_required
def approve_business(business_id):
    business = Business.query.get_or_404(business_id)
    business.status = "active"
    business.approved_by_admin_id = current_user.admin_id
    db.session.commit()
    return jsonify(success=True)


@admin_bp.route("/businesses/<int:business_id>/reject", methods=["POST"])
@admin_login_required
def reject_business(business_id):
    business = Business.query.get_or_404(business_id)
    # No "rejected" status exists on the model (only active/pending) —
    # rather than add a migration for one more enum value, a rejected
    # application is simply removed. The applicant can re-register.
    db.session.delete(business)
    db.session.commit()
    return jsonify(success=True)


# ---------------------------------------------------------------------
# Document viewer — the only way these uploaded files are ever served.
# They live outside static/ specifically so nothing but this
# admin-only, authenticated route can reach them.
# ---------------------------------------------------------------------

@admin_bp.route("/documents/<path:relative_path>")
@admin_login_required
def view_document(relative_path):
    upload_root = current_app.config["UPLOAD_FOLDER"]

    # Resolve both paths and make sure the requested file is actually
    # inside upload_root — blocks "../../../etc/passwd"-style traversal.
    full_path = os.path.normpath(os.path.join(upload_root, relative_path))
    if not full_path.startswith(os.path.normpath(upload_root) + os.sep):
        abort(404)

    directory, filename = os.path.split(full_path)
    if not os.path.isfile(full_path):
        abort(404)

    return send_from_directory(directory, filename)
