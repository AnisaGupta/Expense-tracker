"""
Shared authentication helpers.

LocalBites has two independent kinds of accounts (Customer and Business)
backed by two different tables, but Flask-Login only tracks a single
"current user" per session. To make that work with one LoginManager:

- Customer.get_id() / Business.get_id() return prefixed ids
  ("customer-7", "business-3") instead of a bare integer.
- load_user() below looks at the prefix to know which table to query.

On top of Flask-Login's `current_user`, we add two small decorators
(`customer_login_required`, `business_login_required`) instead of using
Flask-Login's generic `login_required`. This lets us:
  1. Redirect customers and businesses to their own login pages
     (rather than one shared login_view), and
  2. Make sure a logged-in customer can't load business-only pages
     (and vice versa) just by guessing the URL.
"""
from functools import wraps

from flask import redirect, url_for, abort
from flask_login import current_user

from extensions import login_manager
from models import Customer, Business, Admin


@login_manager.user_loader
def load_user(user_id):
    kind, _, raw_id = user_id.partition("-")
    if not raw_id.isdigit():
        return None

    if kind == "customer":
        return Customer.query.get(int(raw_id))
    if kind == "business":
        return Business.query.get(int(raw_id))
    if kind == "admin":
        return Admin.query.get(int(raw_id))
    return None


def customer_login_required(view_func):
    """Require a logged-in Customer; otherwise redirect to customer login."""

    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not isinstance(current_user, Customer):
            return redirect(url_for("customer.login"))
        return view_func(*args, **kwargs)

    return wrapped


def business_login_required(view_func):
    """Require a logged-in Business; otherwise redirect to business login."""

    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not isinstance(current_user, Business):
            return redirect(url_for("business.login"))
        return view_func(*args, **kwargs)

    return wrapped


def admin_login_required(view_func):
    """
    Require a logged-in Admin; otherwise 404 instead of redirecting.

    A 404 (not a redirect to an admin login page) is deliberate: it means
    someone poking around at guessed URLs sees "page not found" rather
    than a big obvious "Admin Login" screen confirming the path exists.
    The real login page is only reachable at the exact configured path.
    """

    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not isinstance(current_user, Admin):
            abort(404)
        return view_func(*args, **kwargs)

    return wrapped
