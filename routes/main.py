"""
Shared routes that don't belong strictly to the customer or business side:
the landing/splash page, the role-selection page, and the customer
location picker.
"""
from flask import Blueprint, render_template

from auth import customer_login_required

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.route("/role")
def role():
    return render_template("role.html")


@main_bp.route("/location")
@customer_login_required
def location():
    return render_template("location.html")
